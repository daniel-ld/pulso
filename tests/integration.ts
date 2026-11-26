import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import "fake-indexeddb/auto";
import { createApp } from "../apps/api/src/app.ts";
import { migrate, pool } from "../apps/api/src/db.ts";
import { taskSchema, today } from "../packages/shared/src/index.ts";

const origin = "http://localhost:4173";
const key = "test-only-setup-key-at-least-32-characters";
let app: Awaited<ReturnType<typeof createApp>>;
let session = "";
let inbox = "";
let ownerId = "";
const headers = () => ({ origin, cookie: session });
before(async () => {
  // This suite is intentionally restricted to the disposable Compose test database.
  if (!process.env.DATABASE_URL?.endsWith("/pulso_test"))
    throw new Error("Use the isolated pulso_test database");
  await migrate();
  await pool.query(
    "TRUNCATE completions,operations,changes,entities,sessions,users RESTART IDENTITY CASCADE",
  );
  app = await createApp({
    logger: false,
    origin,
    setupKey: key,
    secure: false,
  });
  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    headers: { origin },
    payload: {
      name: "Prueba",
      email: "prueba@example.test",
      password: "long-test-password-123",
      setupKey: key,
    },
  });
  assert.equal(setup.statusCode, 201, setup.body);
  session = setup.cookies[0].name + "=" + setup.cookies[0].value;
  ownerId = setup.json().user.id;
  inbox = (await app.inject({ url: "/api/sync/snapshot", headers: headers() }))
    .json()
    .entities.find((e: any) => e.data.isInbox).id;
});
after(async () => {
  await app?.close();
  await pool.end();
});
const put = (
  type: string,
  entityId: string,
  patch: unknown,
  baseVersion = 0,
  base: unknown = {},
) => ({
  id: randomUUID(),
  type,
  entityId,
  action: "put",
  patch,
  baseVersion,
  base,
});
async function push(operations: unknown[]) {
  return app.inject({
    method: "POST",
    url: "/api/sync/push",
    headers: headers(),
    payload: { operations, timeZone: "America/Mexico_City" },
  });
}
test("las rutas privadas exigen sesión y las escrituras exigen origen", async () => {
  assert.equal(
    (await app.inject({ url: "/api/sync/snapshot" })).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/sync/push",
        headers: { origin: "https://otro.test", cookie: session },
        payload: {},
      })
    ).statusCode,
    403,
  );
});
test("solo permite una cuenta, incluso con la clave de instalación", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    headers: { origin },
    payload: {
      name: "Otro",
      email: "otro@example.test",
      password: "another-long-password",
      setupKey: key,
    },
  });
  assert.equal(response.statusCode, 409);
});
test("dos dispositivos fusionan campos distintos y conservan conflictos del mismo campo", async () => {
  const id = randomUUID();
  const task = taskSchema.parse({ title: "Original", projectId: inbox });
  const create = put("task", id, task);
  const first = await push([create]);
  assert.equal(first.statusCode, 200, first.body);
  const replay = await push([create]);
  assert.equal(replay.json().results[0].entity.version, 1, "idempotencia");
  const deviceA = await push([
    put("task", id, { title: "Desde Mac" }, 1, task),
  ]);
  assert.equal(deviceA.json().results[0].status, "ok");
  const deviceB = await push([put("task", id, { priority: 1 }, 1, task)]);
  assert.equal(deviceB.json().results[0].entity.data.title, "Desde Mac");
  assert.equal(deviceB.json().results[0].entity.data.priority, 1);
  const conflict = await push([
    put("task", id, { title: "Desde celular" }, 1, task),
  ]);
  assert.equal(conflict.json().results[0].status, "conflict");
  assert.deepEqual(conflict.json().results[0].fields, ["title"]);
});
test("completar la misma ocurrencia desde dos dispositivos avanza solo una vez", async () => {
  const id = randomUUID();
  const task = taskSchema.parse({
    title: "Caminar",
    projectId: inbox,
    scheduledDate: today("America/Mexico_City"),
    recurrence: { frequency: "day", interval: 1, anchor: "calendar" },
  });
  await push([put("task", id, task)]);
  const complete = () => ({
    ...put("task", id, {}, 1, task),
    action: "complete",
    occurrence: task.scheduledDate,
  });
  const a = (await push([complete()])).json().results[0];
  const b = (await push([complete()])).json().results[0];
  assert.equal(a.status, "ok");
  assert.equal(b.status, "ok");
  assert.equal(a.entity.data.scheduledDate, b.entity.data.scheduledDate);
  assert.equal(b.entity.version, 2);
  assert.equal(
    Number(
      (
        await pool.query("SELECT count(*) FROM completions WHERE task_id=$1", [
          id,
        ])
      ).rows[0].count,
    ),
    1,
  );
});
test("borrado lógico impide resucitar por una edición offline", async () => {
  const id = randomUUID();
  const task = taskSchema.parse({ title: "Temporal", projectId: inbox });
  await push([put("task", id, task)]);
  const deleted = await push([
    { ...put("task", id, {}, 1, task), action: "delete" },
  ]);
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.ok(deleted.json().results[0].entity.deletedAt);
  const stale = await push([put("task", id, { title: "Offline" }, 1, task)]);
  assert.equal(stale.json().results[0].status, "conflict");
  const restored = await push([
    { ...put("task", id, {}, 2, task), action: "restore" },
  ]);
  assert.equal(restored.json().results[0].entity.deletedAt, null);
});
test("rechaza referencias ajenas y ciclos de subtareas; una transacción no queda a medias", async () => {
  const id = randomUUID();
  const task = taskSchema.parse({ title: "Padre", projectId: inbox });
  await push([put("task", id, task)]);
  const cycle = await push([put("task", id, { parentId: id }, 1, task)]);
  assert.equal(cycle.statusCode, 400);
  const missing = await push([
    put("task", randomUUID(), { ...task, projectId: randomUUID() }),
  ]);
  assert.equal(missing.statusCode, 400);
  const foreignOwner = randomUUID();
  const foreignProject = randomUUID();
  await pool.query(
    "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
    [foreignOwner, "other@example.test", "Otro", "unused"],
  );
  await pool.query(
    "INSERT INTO entities(id,owner_id,type,data) VALUES($1,$2,$3,$4)",
    [foreignProject, foreignOwner, "project", { name: "Privado" }],
  );
  assert.equal(
    (
      await push([
        put("task", randomUUID(), { ...task, projectId: foreignProject }),
      ])
    ).statusCode,
    400,
  );
  const snapshot = (
    await app.inject({ url: "/api/sync/snapshot", headers: headers() })
  ).json();
  assert.ok(!snapshot.entities.some((e: any) => e.id === foreignProject));
  assert.ok(ownerId);
});
test("pull paginado conserva cursor consistente y contenido", async () => {
  const result = await app.inject({
    url: "/api/sync/pull?cursor=0",
    headers: headers(),
  });
  assert.equal(result.statusCode, 200);
  assert.ok(result.json().entities.length > 0);
  const cursor = result.json().cursor;
  const empty = await app.inject({
    url: `/api/sync/pull?cursor=${cursor}`,
    headers: headers(),
  });
  assert.deepEqual(empty.json().entities, []);
});
test("cliente offline conserva tareas tras reabrir IndexedDB y sincroniza contra PostgreSQL", async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: Object.assign(new EventTarget(), { hidden: false }),
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: (k: string, v: string) => storage.set(k, v),
      getItem: (k: string) => storage.get(k) ?? null,
    },
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
  const realInterval = globalThis.setInterval;
  globalThis.setInterval = ((...args: any[]) => {
    const timer = (realInterval as any)(...args);
    timer.unref();
    return timer;
  }) as typeof setInterval;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const response = await app.inject({
      method: (init?.method as any) ?? "GET",
      url: String(url),
      headers: {
        origin,
        cookie: session,
        ...(init?.headers as Record<string, string>),
      },
      payload: init?.body as string | undefined,
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = await import("../apps/web/src/store.ts");
  try {
    await client.openUser({
      id: ownerId,
      name: "Prueba",
      email: "prueba@example.test",
    });
    // Hydrate once online, then perform durable writes with no server available.
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await client.synchronize();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const id = randomUUID();
    await client.mutate(
      "task",
      id,
      taskSchema.parse({ title: "Creada sin conexión", projectId: inbox }),
    );
    await client.mutate("task", id, { description: "También editada offline" });
    assert.equal(await client.db.outbox.count(), 2);
    client.db.close();
    await client.db.open();
    assert.equal(
      (await client.db.entities.get(id))!.data.title,
      "Creada sin conexión",
    );
    assert.equal(
      (await pool.query("SELECT 1 FROM entities WHERE id=$1", [id])).rowCount,
      0,
    );
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await client.synchronize();
    assert.equal(await client.db.outbox.count(), 0);
    assert.equal(
      (await pool.query("SELECT data FROM entities WHERE id=$1", [id])).rows[0]
        .data.description,
      "También editada offline",
    );
    const backup = await client.exportBackup();
    assert.ok(backup.entities.some((e) => e.id === id));
    await client.mutate("task", id, { title: "Editada después del respaldo" });
    await client.synchronize();
    await client.restoreBackup(backup);
    await client.synchronize();
    assert.equal(
      (await pool.query("SELECT data FROM entities WHERE id=$1", [id])).rows[0]
        .data.title,
      "Creada sin conexión",
    );
    const base = (await client.db.entities.get(id))!;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await client.mutate("task", id, { title: "Mi variante local" });
    await push([
      put("task", id, { title: "Variante remota" }, base.version, base.data),
    ]);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await client.synchronize();
    const conflict = (await client.db.outbox.toArray()).find(
      (op) => op.conflict,
    )!;
    assert.ok(conflict);
    await client.resolveConflict(conflict.id, "local");
    await client.synchronize();
    assert.equal(
      (await pool.query("SELECT data FROM entities WHERE id=$1", [id])).rows[0]
        .data.title,
      "Mi variante local",
    );
    assert.equal(await client.db.outbox.count(), 0);
    assert.ok(
      (await client.exportBackup()).recovery.length > 0,
      "Se conserva la variante perdedora",
    );
    await assert.rejects(() =>
      client.restoreBackup({ ...backup, userId: randomUUID() }),
    );
  } finally {
    client.closeLocal();
    globalThis.fetch = originalFetch;
    globalThis.setInterval = realInterval;
  }
});
test("las suscripciones push rechazan destinos arbitrarios", async () => {
  const result = await app.inject({
    method: "POST",
    url: "/api/notifications/subscribe",
    headers: headers(),
    payload: {
      endpoint: "https://servidor-interno.test/private",
      keys: { p256dh: "abc", auth: "abc" },
    },
  });
  assert.equal(result.statusCode, 400);
});
