import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const script = readFileSync(
  new URL("../apps/web/public/sw.js", import.meta.url),
  "utf8",
);
function worker(network: () => Promise<any>) {
  const handlers = new Map<string, (event: any) => void>();
  const writes: string[] = [];
  let requests = 0;
  let fallbacks = 0;
  runInNewContext(script, {
    URL,
    Response,
    self: {
      location: { origin: "https://pulso.test" },
      addEventListener: (name: string, handler: any) =>
        handlers.set(name, handler),
    },
    fetch: async () => {
      requests++;
      return network();
    },
    caches: {
      open: async () => ({
        put: async (key: string) => {
          writes.push(key);
        },
      }),
      match: async () => {
        fallbacks++;
        return new Response("offline task shell");
      },
    },
  });
  return {
    navigate(path: string) {
      let response: Promise<Response> | undefined;
      handlers.get("fetch")!({
        request: {
          url: "https://pulso.test" + path,
          method: "GET",
          mode: "navigate",
        },
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
      });
      return response;
    },
    stats: () => ({ requests, fallbacks, writes }),
  };
}

test("el service worker no intercepta OAuth, MCP, metadata ni páginas de consentimiento", () => {
  const sw = worker(async () => {
    throw new Error("offline");
  });
  for (const path of [
    "/oauth/authorize?state=test",
    "/oauth/register",
    "/oauth/token",
    "/oauth/revoke",
    "/mcp",
    "/mcp/",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource",
    "/api/auth/mcp-start",
    "/connect/mcp?connect=test",
    "/?connect=legacy",
  ]) {
    assert.equal(
      sw.navigate(path),
      undefined,
      path + " must reach the network directly",
    );
  }
  assert.deepEqual(sw.stats(), { requests: 0, fallbacks: 0, writes: [] });
});

test("una redirección de navegación conserva Location y no se guarda como shell de tareas", async () => {
  const target = "https://pulso.test/connect/mcp?connect=destination";
  const sw = worker(async () => ({
    redirected: true,
    url: target,
    ok: true,
    clone: () => new Response("consent HTML"),
  }));
  const response = await sw.navigate("/redirecting-page")!;
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), target);
  assert.deepEqual(sw.stats(), { requests: 1, fallbacks: 0, writes: [] });
});

test("la app normal conserva su fallback offline sin usarlo para autenticación", async () => {
  const sw = worker(async () => {
    throw new Error("offline");
  });
  const response = await sw.navigate("/")!;
  assert.equal(await response.text(), "offline task shell");
  assert.deepEqual(sw.stats(), { requests: 1, fallbacks: 1, writes: [] });
});
