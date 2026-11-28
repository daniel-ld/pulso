import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const script = readFileSync(
  new URL("../apps/web/public/sw.js", import.meta.url),
  "utf8",
);
function worker(urls: string[] = []) {
  const handlers = new Map<string, (event: any) => void>();
  const deleted: string[] = [],
    navigated: string[] = [],
    notifications: any[] = [];
  let skipped = 0,
    claimed = 0;
  runInNewContext(script, {
    URL,
    caches: {
      keys: async () => ["pulso-shell-old", "pulso-shell-v1", "other-app"],
      delete: async (key: string) => deleted.push(key),
    },
    self: {
      location: { origin: "https://pulso.test" },
      skipWaiting: async () => {
        skipped++;
      },
      clients: {
        claim: async () => {
          claimed++;
        },
        matchAll: async () =>
          urls.map((url) => ({
            url,
            navigate: async (target: string) => navigated.push(target),
          })),
      },
      registration: {
        showNotification: async (...args: any[]) => notifications.push(args),
      },
      addEventListener: (name: string, handler: any) =>
        handlers.set(name, handler),
    },
  });
  return {
    handlers,
    deleted,
    navigated,
    notifications,
    stats: () => ({ skipped, claimed }),
    async emit(name: string, props = {}) {
      let pending;
      handlers.get(name)!({
        ...props,
        waitUntil: (promise: any) => {
          pending = promise;
        },
      });
      await pending;
    },
  };
}
test("el worker no intercepta ni almacena ninguna petición, incluyendo OAuth y assets", () => {
  assert.equal(worker().handlers.has("fetch"), false);
});
test("reemplaza workers antiguos sin esperar al cierre y borra únicamente cachés Pulso", async () => {
  const sw = worker();
  await sw.emit("install");
  await sw.emit("activate");
  assert.deepEqual(sw.stats(), { skipped: 1, claimed: 1 });
  assert.deepEqual(sw.deleted, ["pulso-shell-old", "pulso-shell-v1"]);
});
test("recupera ventanas OAuth preservando PKCE/state, sin recargar editores ni entrar en bucle", async () => {
  const sw = worker([
    "https://pulso.test/",
    "https://pulso.test/oauth/authorize?state=a%2Bb&code_challenge=pkce",
    "https://pulso.test/connect/mcp?connect=id",
    "https://pulso.test/?connect=legacy",
    "https://pulso.test/connect/mcp?connect=id&__pulso_build=development",
    "https://other.test/?connect=id",
  ]);
  await sw.emit("activate");
  assert.equal(sw.navigated.length, 3);
  const target = new URL(sw.navigated[0]);
  assert.equal(target.searchParams.get("state"), "a+b");
  assert.equal(target.searchParams.get("code_challenge"), "pkce");
  assert.equal(target.searchParams.get("__pulso_build"), "development");
});
test("la recuperación verifica que está activo el worker sin caché y conserva push", async () => {
  const sw = worker();
  let result: any;
  await sw.emit("message", {
    data: { type: "PULSO_VERSION" },
    ports: [
      {
        postMessage: (data: any) => {
          result = data;
        },
      },
    ],
  });
  assert.equal(result.cacheEnabled, false);
  assert.equal(result.build, "development");
  await sw.emit("push", {
    data: {
      json: () => ({ title: "Mi tarea", body: "Ahora", taskId: "task" }),
    },
  });
  assert.equal(sw.notifications[0][0], "Mi tarea");
  assert.equal(sw.notifications[0][1].tag, "task");
});
