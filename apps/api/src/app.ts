import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { z, ZodError } from "zod";
import { pool } from "./db.js";
import { entityView, HttpError, applyOperation } from "./operations.js";
import { registerMcpAuth, isMcpPublicRoute } from "./mcp-auth.js";
import { registerMcp } from "./mcp.js";
import { registerNotifications } from "./notifications.js";
import { operationSchema, today, type Entity } from "@pulso/shared";

const scrypt = promisify(scryptCallback);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
});
const userView = (u: any) => ({
  id: u.id as string,
  email: u.email as string,
  name: u.name as string,
});

export async function createApp(
  options: {
    logger?: boolean;
    origin?: string;
    setupKey?: string;
    secure?: boolean;
  } = {},
) {
  const origin =
    options.origin ?? process.env.APP_ORIGIN ?? "http://localhost:4173";
  const setupKey = options.setupKey ?? process.env.SETUP_KEY ?? "";
  if (setupKey.length < 32)
    throw new Error(
      "SETUP_KEY debe contener al menos 32 caracteres aleatorios",
    );
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : { redact: ["req.headers.authorization", "req.headers.cookie"] },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 240, timeWindow: "1 minute" });
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (isMcpPublicRoute(req.url.split("?")[0])) return;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin !== origin)
        throw new HttpError(403, "Origen no permitido");
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw new HttpError(415, "Se requiere JSON");
    }
    if (req.url.startsWith("/api/auth/") || req.url === "/api/health") return;
    const token = req.cookies.pulso_session;
    if (!token) throw new HttpError(401, "Inicia sesión para sincronizar");
    const { rows } = await pool.query(
      `SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
      [hash(token)],
    );
    if (!rows[0])
      throw new HttpError(
        401,
        "Tu sesión expiró. Tus cambios locales están guardados.",
      );
    req.user = userView(rows[0]);
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: "Revisa los datos ingresados",
        details: error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    if (error instanceof HttpError)
      return reply
        .code(error.statusCode)
        .send({ error: error.message, details: error.details });
    if (
      typeof error === "object" &&
      error &&
      "statusCode" in error &&
      Number(error.statusCode) < 500
    )
      return reply.code(Number(error.statusCode)).send({
        error: "Solicitud no válida o límite de solicitudes alcanzado",
      });
    app.log.error(error);
    return reply
      .code(500)
      .send({ error: "No se pudo completar la operación. Intenta de nuevo." });
  });
  const setSession = async (userId: string, reply: any) => {
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
      [hash(token), userId],
    );
    reply.setCookie("pulso_session", token, {
      httpOnly: true,
      secure: options.secure ?? process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 30 * 86400,
    });
  };
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok" };
  });
  app.get("/api/auth/status", async () => ({
    needsSetup:
      Number((await pool.query("SELECT count(*) FROM users")).rows[0].count) ===
      0,
  }));
  app.post(
    "/api/auth/setup",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = credentials
        .extend({
          name: z.string().trim().min(1).max(80),
          setupKey: z.string().max(256),
        })
        .parse(req.body);
      if (
        !timingSafeEqual(
          Buffer.from(hash(body.setupKey)),
          Buffer.from(hash(setupKey)),
        )
      )
        throw new HttpError(403, "Clave de instalación incorrecta");
      const salt = randomBytes(16).toString("hex");
      const derived = (await scrypt(body.password, salt, 64)) as Buffer;
      const c = await pool.connect();
      const id = randomUUID();
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(771289)");
        if ((await c.query("SELECT 1 FROM users LIMIT 1")).rowCount)
          throw new HttpError(409, "La cuenta personal ya fue creada");
        await c.query(
          "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
          [id, body.email, body.name, `${salt}:${derived.toString("hex")}`],
        );
        const inbox: Entity = {
          id: randomUUID(),
          type: "project",
          data: {
            name: "Bandeja de entrada",
            color: "#64748b",
            isInbox: true,
            archived: false,
            sortOrder: 0,
          },
          version: 1,
          deletedAt: null,
          updatedAt: new Date().toISOString(),
        };
        await c.query(
          "INSERT INTO entities(id,owner_id,type,data) VALUES($1,$2,$3,$4)",
          [inbox.id, id, inbox.type, inbox.data],
        );
        await c.query("INSERT INTO changes(owner_id,entity) VALUES($1,$2)", [
          id,
          inbox,
        ]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      await setSession(id, reply);
      reply.code(201);
      return { user: { id, name: body.name, email: body.email } };
    },
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = credentials.parse(req.body);
      const u = (
        await pool.query("SELECT * FROM users WHERE email=$1", [body.email])
      ).rows[0];
      const [salt, expected] = (
        u?.password_hash ?? `${"0".repeat(32)}:${"0".repeat(128)}`
      ).split(":");
      const actual = (await scrypt(body.password, salt, 64)) as Buffer;
      if (!u || !timingSafeEqual(actual, Buffer.from(expected, "hex")))
        throw new HttpError(401, "Correo o contraseña incorrectos");
      await pool.query("DELETE FROM sessions WHERE expires_at<now()");
      await setSession(u.id, reply);
      return { user: userView(u) };
    },
  );
  app.get("/api/me", async (req) => ({ user: req.user }));
  app.post("/api/logout", async (req, reply) => {
    if (req.cookies.pulso_session)
      await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
        hash(req.cookies.pulso_session),
      ]);
    reply.clearCookie("pulso_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/sync/snapshot", async (req) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const entities = (
        await c.query("SELECT * FROM entities WHERE owner_id=$1", [
          req.user!.id,
        ])
      ).rows.map(entityView);
      const cursor = (
        await c.query(
          "SELECT COALESCE(max(seq),0)::text AS cursor FROM changes WHERE owner_id=$1",
          [req.user!.id],
        )
      ).rows[0].cursor;
      await c.query("COMMIT");
      return { entities, cursor };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.get("/api/sync/pull", async (req) => {
    const { cursor } = z
      .object({
        cursor: z
          .string()
          .regex(/^\d{1,19}$/)
          .default("0"),
      })
      .parse(req.query);
    const rows = (
      await pool.query(
        "SELECT seq::text,entity FROM changes WHERE owner_id=$1 AND seq>$2 ORDER BY changes.seq LIMIT 501",
        [req.user!.id, cursor],
      )
    ).rows;
    const page = rows.slice(0, 500);
    return {
      entities: page.map((r) => r.entity),
      cursor: page.at(-1)?.seq ?? cursor,
      hasMore: rows.length > 500,
    };
  });
  app.post("/api/sync/push", async (req) => {
    const body = z
      .object({
        operations: z.array(operationSchema).min(1).max(100),
        timeZone: z.string().max(80),
      })
      .parse(req.body);
    let date: string;
    try {
      date = today(body.timeZone);
    } catch {
      throw new HttpError(400, "Zona horaria inválida");
    }
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      // Serializes mutation commits and change sequence allocation, preventing missed cursor entries.
      await c.query("SELECT pg_advisory_xact_lock(771289)");
      const results = [];
      for (const op of body.operations)
        results.push(await applyOperation(c, req.user!.id, op, date));
      await c.query("COMMIT");
      return { results };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.get("/api/activity", async (req) => ({
    completions: (
      await pool.query(
        "SELECT id,task_id,occurrence,completed_at FROM completions WHERE owner_id=$1 ORDER BY completed_at DESC LIMIT 100",
        [req.user!.id],
      )
    ).rows,
  }));
  registerMcpAuth(app, origin);
  registerMcp(app, origin);
  registerNotifications(app);
  return app;
}

declare module "fastify" {
  interface FastifyRequest {
    user: { id: string; email: string; name: string } | null;
  }
}
