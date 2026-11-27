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

// MCP uses the same disposable database and owner as the app tests above.
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
let mcpAddress = "";
const callbackUrl = "https://assistant.example.test/callback";
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
async function oauthConnection(scope = "pulso:read pulso:write") {
  const registered = await app.inject({
    method: "POST",
    url: "/oauth/register",
    payload: {
      client_name: "Asistente de prueba",
      redirect_uris: [callbackUrl],
      token_endpoint_auth_method: "none",
    },
  });
  assert.equal(registered.statusCode, 201, registered.body);
  const clientId = registered.json().client_id;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: origin + "/mcp",
    scope,
    state: "state-echo-test",
  });
  const authorize = await app.inject({ url: "/oauth/authorize?" + params });
  assert.equal(authorize.statusCode, 302, authorize.body);
  const id = new URL(authorize.headers.location!).searchParams.get("connect")!;
  return { clientId, params, id };
}
async function approveOAuth(scope?: string) {
  const connection = await oauthConnection(scope);
  const approved = await app.inject({
    method: "POST",
    url: "/api/integrations/authorize",
    headers: headers(),
    payload: { id: connection.id, approve: true },
  });
  assert.equal(approved.statusCode, 200, approved.body);
  const callback = new URL(approved.json().redirectUrl);
  assert.equal(callback.searchParams.get("state"), "state-echo-test");
  return { ...connection, code: callback.searchParams.get("code")! };
}
async function exchange(
  clientId: string,
  code: string,
  codeVerifier = verifier,
  resource = origin + "/mcp",
) {
  return app.inject({
    method: "POST",
    url: "/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
      resource,
    }).toString(),
  });
}
async function mcpClient(token: string) {
  // The disposable test container/CI owns port 4173; use the real advertised
  // authority rather than spoofing Host (fetch intentionally overrides it).
  if (!mcpAddress) {
    await app.listen({ port: 4173, host: "0.0.0.0" });
    mcpAddress = origin;
  }
  const client = new Client({
    name: "pulso-integration-test",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(mcpAddress + "/mcp"),
    {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  await client.connect(transport);
  return client;
}
function mcpData(reply: any) {
  return JSON.parse(reply.content[0].text);
}

test("MCP publica descubrimiento OAuth y exige bearer, host y origen válidos", async () => {
  const meta = await app.inject({
    url: "/.well-known/oauth-authorization-server",
  });
  assert.equal(meta.json().code_challenge_methods_supported[0], "S256");
  const resource = await app.inject({
    url: "/.well-known/oauth-protected-resource/mcp",
  });
  assert.equal(resource.json().resource, origin + "/mcp");
  const noAuth = await app.inject({
    method: "POST",
    url: "/mcp",
    headers: { host: new URL(origin).host },
    payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  assert.equal(noAuth.statusCode, 401);
  assert.match(
    String(noAuth.headers["www-authenticate"]),
    /resource_metadata=/,
  );
  const wrongHost = await app.inject({
    url: "/mcp",
    headers: { host: "attacker.test" },
  });
  assert.equal(wrongHost.statusCode, 403);
  const wrongOrigin = await app.inject({
    url: "/mcp",
    headers: { host: new URL(origin).host, origin: "https://attacker.test" },
  });
  assert.equal(wrongOrigin.statusCode, 403);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/oauth/register",
        payload: {
          redirect_uris: [
            "https://user:secret@assistant.example.test/callback",
          ],
        },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/oauth/register",
        payload: { redirect_uris: ["http://attacker.test/callback"] },
      })
    ).statusCode,
    400,
  );
});

test("OAuth exige consentimiento autenticado, retorno registrado y PKCE; código de un solo uso", async () => {
  const connection = await oauthConnection();
  const bad = new URLSearchParams(connection.params);
  bad.set("redirect_uri", "https://attacker.test");
  assert.equal(
    (await app.inject({ url: "/oauth/authorize?" + bad })).statusCode,
    400,
  );
  bad.set("redirect_uri", callbackUrl);
  bad.set("resource", "https://other.test/mcp");
  assert.equal(
    (await app.inject({ url: "/oauth/authorize?" + bad })).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/integrations/authorize",
        headers: { origin },
        payload: { id: connection.id, approve: true },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/integrations/authorize",
        headers: { cookie: session, origin: "https://attacker.test" },
        payload: { id: connection.id, approve: true },
      })
    ).statusCode,
    403,
  );
  const denied = await app.inject({
    method: "POST",
    url: "/api/integrations/authorize",
    headers: headers(),
    payload: { id: connection.id, approve: false },
  });
  assert.equal(
    new URL(denied.json().redirectUrl).searchParams.get("error"),
    "access_denied",
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/integrations/authorize/" + connection.id,
        headers: headers(),
      })
    ).statusCode,
    404,
  );
  const approved = await approveOAuth();
  assert.equal(
    (await exchange(approved.clientId, approved.code, "x".repeat(43)))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await exchange(
        approved.clientId,
        approved.code,
        verifier,
        "https://other.test/mcp",
      )
    ).statusCode,
    400,
  );
  const token = await exchange(approved.clientId, approved.code);
  assert.equal(token.statusCode, 200, token.body);
  assert.ok(token.json().refresh_token);
  assert.equal(
    (await exchange(approved.clientId, approved.code)).statusCode,
    400,
  );
});

test("SDK MCP real lista herramientas, escribe de forma idempotente y sincroniza con la app", async () => {
  const approved = await approveOAuth();
  const tokens = (await exchange(approved.clientId, approved.code)).json();
  const client = await mcpClient(tokens.access_token);
  try {
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "pulso_create_task"));
    const args = {
      requestId: randomUUID(),
      task: { title: "Tarea desde MCP", priority: 2 },
    };
    const first = await client.callTool({
      name: "pulso_create_task",
      arguments: args,
    });
    assert.ok(!first.isError, JSON.stringify(first));
    const entity = mcpData(first).entity;
    assert.equal(entity.data.projectId, inbox);
    const second = await client.callTool({
      name: "pulso_create_task",
      arguments: args,
    });
    assert.equal(mcpData(second).entity.id, entity.id);
    const edited = await client.callTool({
      name: "pulso_update_task",
      arguments: {
        requestId: randomUUID(),
        id: entity.id,
        expectedVersion: entity.version,
        changes: { description: "Cambio remoto" },
      },
    });
    assert.equal(
      mcpData(edited).entity.data.title,
      "Tarea desde MCP",
      "actualizar no rellena valores por defecto",
    );
    assert.equal(mcpData(edited).entity.data.priority, 2);
    const stale = await client.callTool({
      name: "pulso_update_task",
      arguments: {
        requestId: randomUUID(),
        id: entity.id,
        expectedVersion: entity.version,
        changes: { title: "Antiguo" },
      },
    });
    assert.equal(stale.isError, true);
    const visible = (
      await app.inject({ url: "/api/sync/pull?cursor=0", headers: headers() })
    ).json();
    assert.ok(
      visible.entities.some(
        (e: any) =>
          e.id === entity.id && e.data.description === "Cambio remoto",
      ),
    );
    const listed = mcpData(
      await client.callTool({
        name: "pulso_list_tasks",
        arguments: { query: "desde MCP" },
      }),
    );
    assert.ok(listed.tasks.some((e: any) => e.id === entity.id));
    const foreign = (
      await pool.query("SELECT id FROM entities WHERE owner_id<>$1 LIMIT 1", [
        ownerId,
      ])
    ).rows[0].id;
    assert.equal(
      (await client.callTool({ name: "fetch", arguments: { id: foreign } }))
        .isError,
      true,
    );
    const search = mcpData(
      await client.callTool({
        name: "search",
        arguments: { query: "desde MCP" },
      }),
    );
    assert.ok(search.results.some((e: any) => e.id === entity.id));
  } finally {
    await client.close();
  }
});

test("MCP respeta permisos de solo lectura y revocación inmediata de tokens", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/integrations/token",
    headers: headers(),
    payload: { name: "Solo lectura", access: "read" },
  });
  assert.equal(created.statusCode, 201);
  const { token, id } = created.json();
  const client = await mcpClient(token);
  try {
    const tools = await client.listTools();
    assert.ok(!tools.tools.some((t) => t.name === "pulso_create_task"));
    assert.equal(
      (
        await client.callTool({
          name: "pulso_create_task",
          arguments: {
            requestId: randomUUID(),
            task: { title: "No permitido" },
          },
        })
      ).isError,
      true,
    );
    const connections = (
      await app.inject({ url: "/api/integrations", headers: headers() })
    ).json();
    assert.ok(!JSON.stringify(connections).includes(token));
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/integrations/token",
          headers: { origin: "https://attacker.test", cookie: session },
          payload: { name: "CSRF", access: "write" },
        })
      ).statusCode,
      403,
    );
    await app.inject({
      method: "POST",
      url: "/api/integrations/revoke",
      headers: headers(),
      payload: { id },
    });
    await assert.rejects(() => client.listTools());
  } finally {
    await client.close();
  }
});

test("OAuth rota refresh tokens y revoca toda la conexión ante reutilización", async () => {
  const approved = await approveOAuth("pulso:read");
  const tokens = (await exchange(approved.clientId, approved.code)).json();
  const refresh = () =>
    app.inject({
      method: "POST",
      url: "/oauth/token",
      payload: {
        grant_type: "refresh_token",
        client_id: approved.clientId,
        refresh_token: tokens.refresh_token,
        resource: origin + "/mcp",
      },
    });
  const renewed = await refresh();
  assert.equal(renewed.statusCode, 200, renewed.body);
  assert.notEqual(renewed.json().refresh_token, tokens.refresh_token);
  assert.equal((await refresh()).statusCode, 400);
  const revoked = await app.inject({
    url: "/mcp",
    headers: {
      host: new URL(origin).host,
      authorization: "Bearer " + renewed.json().access_token,
    },
  });
  assert.equal(revoked.statusCode, 401);
});

test("MCP gestiona proyectos, etiquetas, secciones, recurrencia y papelera con las reglas de dominio", async () => {
  const approved = await approveOAuth();
  const tokens = (await exchange(approved.clientId, approved.code)).json();
  const client = await mcpClient(tokens.access_token);
  const call = async (name: string, args: any) => {
    const reply = await client.callTool({
      name,
      arguments: { requestId: randomUUID(), ...args },
    });
    assert.ok(!reply.isError, JSON.stringify(reply));
    return mcpData(reply);
  };
  try {
    const project = (
      await call("pulso_save_project", {
        fields: { name: "Proyecto MCP", color: "#64748b" },
      })
    ).entity;
    const label = (
      await call("pulso_save_label", { fields: { name: "Etiqueta MCP" } })
    ).entity;
    const section = (
      await call("pulso_save_section", {
        fields: { name: "Sección MCP", projectId: project.id },
      })
    ).entity;
    const task = (
      await call("pulso_create_task", {
        task: {
          title: "Recurrente MCP",
          projectId: project.id,
          sectionId: section.id,
          labelIds: [label.id],
          scheduledDate: today("America/Mexico_City"),
          recurrence: { frequency: "day", interval: 1, anchor: "calendar" },
        },
      })
    ).entity;
    const found = await call("pulso_list_tasks", {
      projectId: project.id,
      labelId: label.id,
    });
    assert.equal(found.tasks[0].id, task.id);
    const completeArgs = {
      requestId: randomUUID(),
      id: task.id,
      expectedVersion: task.version,
      timeZone: "America/Mexico_City",
    };
    const first = await call("pulso_complete_task", completeArgs);
    const retry = await call("pulso_complete_task", completeArgs);
    assert.equal(first.entity.version, retry.entity.version);
    assert.ok(first.entity.data.scheduledDate > task.data.scheduledDate);
    assert.equal(
      first.entity.data.scheduledDate,
      retry.entity.data.scheduledDate,
    );
    assert.equal(
      (
        await client.callTool({
          name: "pulso_complete_task",
          arguments: { ...completeArgs, requestId: randomUUID() },
        })
      ).isError,
      true,
    );
    const protectedInbox = await client.callTool({
      name: "pulso_move_to_trash",
      arguments: {
        requestId: randomUUID(),
        type: "project",
        id: inbox,
        expectedVersion: 1,
      },
    });
    assert.equal(protectedInbox.isError, true);
    const hasDependencies = await client.callTool({
      name: "pulso_move_to_trash",
      arguments: {
        requestId: randomUUID(),
        type: "project",
        id: project.id,
        expectedVersion: 1,
      },
    });
    assert.equal(hasDependencies.isError, true);
    const trashed = await call("pulso_move_to_trash", {
      type: "task",
      id: task.id,
      expectedVersion: first.entity.version,
    });
    assert.ok(trashed.entity.deletedAt);
    assert.equal(
      (
        await client.callTool({
          name: "pulso_update_task",
          arguments: {
            requestId: randomUUID(),
            id: task.id,
            expectedVersion: trashed.entity.version,
            changes: { title: "No resucitar" },
          },
        })
      ).isError,
      true,
    );
    assert.equal(
      (await call("pulso_list_tasks", { projectId: project.id })).tasks.length,
      0,
    );
    const restored = await call("pulso_restore_record", {
      type: "task",
      id: task.id,
      expectedVersion: trashed.entity.version,
    });
    assert.equal(restored.entity.deletedAt, null);
    const page = await call("pulso_list_tasks", { limit: 1 });
    assert.equal(page.tasks.length, 1);
    const next = await call("pulso_list_tasks", {
      limit: 1,
      cursor: page.nextCursor,
    });
    assert.notEqual(page.tasks[0].id, next.tasks[0].id);
  } finally {
    await client.close();
  }
});

test("OAuth valida clientes confidenciales, expiración, permisos y revocación RFC7009", async () => {
  const registered = await app.inject({
    method: "POST",
    url: "/oauth/register",
    payload: {
      client_name: "Confidencial",
      redirect_uris: [callbackUrl],
      token_endpoint_auth_method: "client_secret_basic",
    },
  });
  assert.equal(registered.statusCode, 201, registered.body);
  const creds = registered.json();
  const q = new URLSearchParams({
    response_type: "code",
    client_id: creds.client_id,
    redirect_uri: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "pulso:read",
  });
  const start = await app.inject({ url: "/oauth/authorize?" + q });
  const id = new URL(start.headers.location!).searchParams.get("connect")!;
  const details = await app.inject({
    url: "/api/integrations/authorize/" + id,
    headers: headers(),
  });
  assert.equal(details.json().request.name, "Confidencial");
  const allowed = await app.inject({
    method: "POST",
    url: "/api/integrations/authorize",
    headers: headers(),
    payload: { id, approve: true },
  });
  const code = new URL(allowed.json().redirectUrl).searchParams.get("code")!;
  assert.equal(
    (await exchange(creds.client_id, code)).statusCode,
    401,
    "un cliente confidencial exige su secreto",
  );
  const basic =
    "Basic " +
    Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString("base64");
  const granted = await app.inject({
    method: "POST",
    url: "/oauth/token",
    headers: { authorization: basic },
    payload: {
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      code_verifier: verifier,
    },
  });
  assert.equal(granted.statusCode, 200, granted.body);
  assert.match(String(granted.headers["cache-control"]), /no-store/);
  const token = granted.json().access_token;
  const secretHashes = (
    await pool.query("SELECT secret_hash FROM mcp_clients WHERE id=$1", [
      creds.client_id,
    ])
  ).rows[0];
  assert.notEqual(secretHashes.secret_hash, creds.client_secret);
  assert.equal(
    (
      await app.inject({
        url: "/mcp",
        headers: {
          host: new URL(origin).host,
          authorization: "Bearer " + token,
        },
      })
    ).statusCode,
    405,
  );
  const revoked = await app.inject({
    method: "POST",
    url: "/oauth/revoke",
    headers: { authorization: basic },
    payload: { token },
  });
  assert.equal(revoked.statusCode, 200);
  assert.equal(
    (
      await app.inject({
        url: "/mcp",
        headers: {
          host: new URL(origin).host,
          authorization: "Bearer " + token,
        },
      })
    ).statusCode,
    401,
  );
  const expiredRequest = await oauthConnection();
  await pool.query(
    "UPDATE mcp_auth_requests SET expires_at=now()-interval '1 second' WHERE id=$1",
    [expiredRequest.id],
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/integrations/authorize",
        headers: headers(),
        payload: { id: expiredRequest.id, approve: true },
      })
    ).statusCode,
    404,
  );
  const issued = (
    await app.inject({
      method: "POST",
      url: "/api/integrations/token",
      headers: headers(),
      payload: { name: "Caducado", access: "read" },
    })
  ).json();
  await pool.query(
    "UPDATE mcp_tokens SET expires_at=now()-interval '1 second' WHERE connection_id=$1",
    [issued.id],
  );
  assert.equal(
    (
      await app.inject({
        url: "/mcp",
        headers: {
          host: new URL(origin).host,
          authorization: "Bearer " + issued.token,
        },
      })
    ).statusCode,
    401,
  );
});
