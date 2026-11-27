import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "./db.js";
import { HttpError } from "./operations.js";

const read = "pulso:read";
const write = "pulso:write";
const scopes = `${read} ${write}`;
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const fail = (error: string, description: string, status = 400) =>
  new HttpError(status, error, { description });
const publicPaths = new Set([
  "/mcp",
  "/oauth/register",
  "/oauth/authorize",
  "/oauth/token",
  "/oauth/revoke",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
]);
export const isMcpPublicRoute = (path: string) => publicPaths.has(path);
function scopeValue(value = scopes) {
  const requested = [...new Set(value.split(/\s+/).filter(Boolean))];
  if (!requested.length || requested.some((s) => s !== read && s !== write))
    throw fail("invalid_scope", "Solo se admiten pulso:read y pulso:write");
  if (requested.includes(write) && !requested.includes(read))
    requested.unshift(read);
  return requested.join(" ");
}
function redirectUri(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw fail("invalid_redirect_uri", "URL de retorno inválida");
  }
  if (
    url.hash ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw fail(
      "invalid_redirect_uri",
      "Usa HTTPS o un callback de loopback local",
    );
  return value;
}
function target(value: string | undefined, resource: string) {
  if (value !== undefined && value !== resource)
    throw fail(
      "invalid_target",
      "El recurso debe coincidir con la URL MCP de Pulso",
    );
  return resource;
}
async function cleanup() {
  await pool.query(
    "DELETE FROM mcp_auth_requests WHERE expires_at<now(); DELETE FROM mcp_codes WHERE expires_at<now(); DELETE FROM mcp_tokens WHERE expires_at<now()",
  );
}
async function issue(c: PoolClient, connection: string, refresh = true) {
  const accessToken = `pulso_${secret()}`;
  await c.query(
    "INSERT INTO mcp_tokens(token_hash,connection_id,kind,expires_at) VALUES($1,$2,'access',now()+interval '15 minutes')",
    [digest(accessToken), connection],
  );
  let refreshToken: string | undefined;
  if (refresh) {
    refreshToken = `pulso_refresh_${secret()}`;
    await c.query(
      "INSERT INTO mcp_tokens(token_hash,connection_id,kind,expires_at) VALUES($1,$2,'refresh',now()+interval '30 days')",
      [digest(refreshToken), connection],
    );
  }
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 900,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  };
}
async function clientAuthentication(
  req: FastifyRequest,
  body: Record<string, string>,
) {
  let clientId = body.client_id;
  let clientSecret = body.client_secret;
  let method = clientSecret ? "client_secret_post" : "none";
  const authorization = req.headers.authorization;
  if (authorization) {
    if (!authorization.startsWith("Basic "))
      throw fail("invalid_client", "Autenticación de cliente inválida", 401);
    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf8",
    );
    const at = decoded.indexOf(":");
    if (at < 0) throw fail("invalid_client", "Basic inválido", 401);
    try {
      const basicId = decodeURIComponent(decoded.slice(0, at));
      if (clientId && clientId !== basicId) throw new Error();
      clientId = basicId;
      clientSecret = decodeURIComponent(decoded.slice(at + 1));
    } catch {
      throw fail("invalid_client", "Cliente no válido", 401);
    }
    method = "client_secret_basic";
  }
  if (!clientId) throw fail("invalid_client", "Falta client_id", 401);
  const client = (
    await pool.query("SELECT * FROM mcp_clients WHERE id=$1", [clientId])
  ).rows[0];
  if (
    !client ||
    client.auth_method !== method ||
    (method !== "none" &&
      (!clientSecret ||
        !timingSafeEqual(
          Buffer.from(digest(clientSecret)),
          Buffer.from(client.secret_hash),
        )))
  )
    throw fail("invalid_client", "Cliente no válido", 401);
  return client;
}
export async function authenticateMcp(req: FastifyRequest, origin: string) {
  const resource = origin + "/mcp";
  if (req.headers.host !== new URL(origin).host)
    throw new HttpError(403, "Host no permitido");
  if (req.headers.origin && req.headers.origin !== origin)
    throw new HttpError(403, "Origen MCP no permitido");
  const token = req.headers.authorization?.match(
    /^Bearer ([A-Za-z0-9_-]{32,256})$/i,
  )?.[1];
  if (!token) return null;
  const row = (
    await pool.query(
      `SELECT c.id,c.owner_id,c.scope FROM mcp_tokens t JOIN mcp_connections c ON c.id=t.connection_id
    WHERE t.token_hash=$1 AND t.kind='access' AND t.expires_at>now() AND c.revoked_at IS NULL AND c.resource=$2`,
      [digest(token), resource],
    )
  ).rows[0];
  if (!row) return null;
  await pool.query(
    "UPDATE mcp_connections SET last_used_at=now() WHERE id=$1 AND (last_used_at IS NULL OR last_used_at<now()-interval '1 minute')",
    [row.id],
  );
  return {
    owner: row.owner_id as string,
    canWrite: row.scope.split(" ").includes(write),
    canRead: row.scope.split(" ").includes(read),
  };
}

export function registerMcpAuth(app: FastifyInstance, origin: string) {
  const resource = origin + "/mcp";
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );
  const cors = (reply: any) =>
    reply
      .header("Access-Control-Allow-Origin", "*")
      .header(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, MCP-Protocol-Version",
      )
      .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      .header("Access-Control-Expose-Headers", "WWW-Authenticate");
  for (const path of publicPaths)
    app.options(path, async (_req, reply) => cors(reply).code(204).send());
  app.get("/.well-known/oauth-authorization-server", async (_req, reply) => {
    cors(reply);
    return {
      issuer: origin,
      authorization_endpoint: origin + "/oauth/authorize",
      token_endpoint: origin + "/oauth/token",
      registration_endpoint: origin + "/oauth/register",
      revocation_endpoint: origin + "/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
      scopes_supported: [read, write],
    };
  });
  for (const path of [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ]) {
    app.get(path, async (_req, reply) => {
      cors(reply);
      return {
        resource,
        authorization_servers: [origin],
        scopes_supported: [read, write],
        bearer_methods_supported: ["header"],
        resource_name: "Pulso personal",
      };
    });
  }
  app.post(
    "/oauth/register",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      cors(reply);
      const body = z
        .object({
          client_name: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .default("Asistente MCP"),
          redirect_uris: z.array(z.string().max(2048)).min(1).max(10),
          token_endpoint_auth_method: z
            .enum(["none", "client_secret_post", "client_secret_basic"])
            .default("none"),
          grant_types: z
            .array(z.enum(["authorization_code", "refresh_token"]))
            .optional(),
          response_types: z.array(z.literal("code")).optional(),
        })
        .parse(req.body);
      body.redirect_uris.forEach(redirectUri);
      await cleanup();
      if (
        Number(
          (await pool.query("SELECT count(*) FROM mcp_clients")).rows[0].count,
        ) >= 1000
      )
        throw fail(
          "temporarily_unavailable",
          "Límite de clientes registrados alcanzado",
          429,
        );
      const clientId = `pulso_client_${secret()}`;
      const clientSecret =
        body.token_endpoint_auth_method === "none" ? undefined : secret();
      await pool.query(
        "INSERT INTO mcp_clients(id,name,redirect_uris,auth_method,secret_hash) VALUES($1,$2,$3,$4,$5)",
        [
          clientId,
          body.client_name,
          JSON.stringify(body.redirect_uris),
          body.token_endpoint_auth_method,
          clientSecret ? digest(clientSecret) : null,
        ],
      );
      return reply.code(201).send({
        client_id: clientId,
        client_name: body.client_name,
        redirect_uris: body.redirect_uris,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        ...(clientSecret
          ? { client_secret: clientSecret, client_secret_expires_at: 0 }
          : {}),
        token_endpoint_auth_method: body.token_endpoint_auth_method,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
    },
  );
  app.get(
    "/oauth/authorize",
    { config: { rateLimit: { max: 60, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const q = z
        .object({
          response_type: z.literal("code"),
          client_id: z.string().max(200),
          redirect_uri: z.string().max(2048),
          code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
          code_challenge_method: z.literal("S256"),
          state: z.string().max(4096).optional(),
          scope: z.string().max(200).optional(),
          resource: z.string().max(2048).optional(),
        })
        .parse(req.query);
      const client = (
        await pool.query("SELECT * FROM mcp_clients WHERE id=$1", [q.client_id])
      ).rows[0];
      if (!client || !client.redirect_uris.includes(q.redirect_uri))
        throw fail("invalid_request", "Cliente o retorno no registrado");
      target(q.resource, resource);
      const scope = scopeValue(q.scope);
      await cleanup();
      const id = secret();
      await pool.query(
        "INSERT INTO mcp_auth_requests(id,client_id,redirect_uri,scope,state,challenge,resource) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          q.client_id,
          q.redirect_uri,
          scope,
          q.state ?? null,
          q.code_challenge,
          resource,
        ],
      );
      return reply.redirect(origin + "/connect/mcp?connect=" + id);
    },
  );
  const authorizationDetails = async (req: FastifyRequest) => {
    const { id } = z
      .object({ id: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .parse(req.params);
    const row = (
      await pool.query(
        `SELECT r.id,r.scope,r.redirect_uri,c.name FROM mcp_auth_requests r JOIN mcp_clients c ON c.id=r.client_id
      WHERE r.id=$1 AND r.expires_at>now()`,
        [id],
      )
    ).rows[0];
    if (!row)
      throw new HttpError(
        404,
        "La solicitud expiró. Vuelve a conectar desde el asistente.",
      );
    return { request: row };
  };
  // Only public request metadata: no account information, codes or tokens.
  // Approval remains protected by the web session and Origin checks.
  app.get(
    "/api/auth/mcp-request/:id",
    { config: { rateLimit: { max: 60, timeWindow: "15 minutes" } } },
    authorizationDetails,
  );
  app.get("/api/integrations/authorize/:id", authorizationDetails);
  app.post("/api/integrations/authorize", async (req) => {
    const body = z
      .object({
        id: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        approve: z.boolean(),
      })
      .parse(req.body);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const row = (
        await c.query(
          "DELETE FROM mcp_auth_requests WHERE id=$1 AND expires_at>now() RETURNING *",
          [body.id],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "La solicitud expiró o ya se utilizó");
      const url = new URL(row.redirect_uri);
      if (body.approve) {
        const connection = randomUUID();
        const client = (
          await c.query("SELECT name FROM mcp_clients WHERE id=$1", [
            row.client_id,
          ])
        ).rows[0];
        await c.query(
          "INSERT INTO mcp_connections(id,owner_id,client_id,name,scope,resource) VALUES($1,$2,$3,$4,$5,$6)",
          [
            connection,
            req.user!.id,
            row.client_id,
            client.name,
            row.scope,
            row.resource,
          ],
        );
        const code = secret();
        await c.query(
          "INSERT INTO mcp_codes(code_hash,connection_id,redirect_uri,challenge) VALUES($1,$2,$3,$4)",
          [digest(code), connection, row.redirect_uri, row.challenge],
        );
        url.searchParams.set("code", code);
      } else url.searchParams.set("error", "access_denied");
      if (row.state !== null) url.searchParams.set("state", row.state);
      await c.query("COMMIT");
      return { redirectUrl: url.href };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post(
    "/oauth/token",
    { config: { rateLimit: { max: 90, timeWindow: "1 minute" } } },
    async (req, reply) => {
      cors(reply);
      const body = z.record(z.string(), z.string().max(4096)).parse(req.body);
      const client = await clientAuthentication(req, body);
      target(body.resource, resource);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        let connection: any;
        if (body.grant_type === "authorization_code") {
          if (
            !body.code ||
            !body.redirect_uri ||
            !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier ?? "")
          )
            throw fail(
              "invalid_grant",
              "Faltan código, retorno o verificador PKCE",
            );
          const row = (
            await c.query(
              `SELECT a.*,g.client_id,g.scope,g.resource,g.revoked_at FROM mcp_codes a
          JOIN mcp_connections g ON g.id=a.connection_id WHERE a.code_hash=$1 AND a.expires_at>now() FOR UPDATE OF a,g`,
              [digest(body.code)],
            )
          ).rows[0];
          const challenge = createHash("sha256")
            .update(body.code_verifier)
            .digest("base64url");
          if (
            !row ||
            row.client_id !== client.id ||
            row.redirect_uri !== body.redirect_uri ||
            row.challenge !== challenge ||
            row.resource !== resource ||
            row.revoked_at
          )
            throw fail("invalid_grant", "Código, retorno o PKCE inválido");
          connection = { id: row.connection_id, scope: row.scope };
          await c.query("DELETE FROM mcp_codes WHERE code_hash=$1", [
            digest(body.code),
          ]);
        } else if (body.grant_type === "refresh_token") {
          if (!body.refresh_token)
            throw fail("invalid_grant", "Falta refresh_token");
          const row = (
            await c.query(
              `SELECT t.*,g.client_id,g.scope,g.resource,g.revoked_at FROM mcp_tokens t JOIN mcp_connections g ON g.id=t.connection_id
          WHERE t.token_hash=$1 AND t.kind='refresh' AND t.expires_at>now() FOR UPDATE OF t,g`,
              [digest(body.refresh_token)],
            )
          ).rows[0];
          if (
            !row ||
            row.client_id !== client.id ||
            row.resource !== resource ||
            row.revoked_at
          )
            throw fail("invalid_grant", "Refresh token inválido");
          if (row.used_at) {
            await c.query(
              "UPDATE mcp_connections SET revoked_at=now() WHERE id=$1",
              [row.connection_id],
            );
            await c.query("COMMIT");
            return reply.code(400).send({
              error: "invalid_grant",
              error_description:
                "Refresh token reutilizado. Vuelve a conectar.",
            });
          }
          if (
            body.scope &&
            scopeValue(body.scope).split(" ").sort().join(" ") !==
              row.scope.split(" ").sort().join(" ")
          )
            throw fail(
              "invalid_scope",
              "No se puede cambiar el permiso al renovar",
            );
          await c.query(
            "UPDATE mcp_tokens SET used_at=now() WHERE token_hash=$1",
            [digest(body.refresh_token)],
          );
          connection = { id: row.connection_id, scope: row.scope };
        } else
          throw fail(
            "unsupported_grant_type",
            "Usa authorization_code o refresh_token",
          );
        const tokens = await issue(c, connection.id);
        await c.query("COMMIT");
        return { ...tokens, scope: connection.scope };
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
  );
  app.post("/oauth/revoke", async (req, reply) => {
    cors(reply);
    const body = z.record(z.string(), z.string().max(4096)).parse(req.body);
    const client = await clientAuthentication(req, body);
    if (body.token)
      await pool.query(
        `UPDATE mcp_connections SET revoked_at=now() WHERE client_id=$1 AND id IN
      (SELECT connection_id FROM mcp_tokens WHERE token_hash=$2)`,
        [client.id, digest(body.token)],
      );
    return reply.code(200).send({});
  });
  app.get("/api/integrations", async (req) => ({
    endpoint: resource,
    connections: (
      await pool.query(
        "SELECT id,name,scope,created_at,last_used_at,client_id IS NULL AS manual FROM mcp_connections WHERE owner_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC",
        [req.user!.id],
      )
    ).rows,
  }));
  app.post(
    "/api/integrations/token",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().trim().min(1).max(100),
          access: z.enum(["read", "write"]),
        })
        .parse(req.body);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const id = randomUUID();
        const token = `pulso_${secret()}`;
        await c.query(
          "INSERT INTO mcp_connections(id,owner_id,name,scope,resource) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            req.user!.id,
            body.name,
            body.access === "write" ? scopes : read,
            resource,
          ],
        );
        const expiresAt = (
          await c.query(
            "INSERT INTO mcp_tokens(token_hash,connection_id,kind,expires_at) VALUES($1,$2,'access',now()+interval '90 days') RETURNING expires_at",
            [digest(token), id],
          )
        ).rows[0].expires_at;
        await c.query("COMMIT");
        return reply.code(201).send({ token, id, expiresAt });
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
  );
  app.post("/api/integrations/revoke", async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.body);
    await pool.query(
      "UPDATE mcp_connections SET revoked_at=now() WHERE id=$1 AND owner_id=$2",
      [id, req.user!.id],
    );
    return { ok: true };
  });
}
