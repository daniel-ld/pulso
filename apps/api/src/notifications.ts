import * as webpush from "web-push";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { pool } from "./db.js";
const subscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(4096)
    .refine((value) => {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        (!u.port || u.port === "443") &&
        ([
          "fcm.googleapis.com",
          "updates.push.services.mozilla.com",
          "web.push.apple.com",
        ].includes(u.hostname) ||
          u.hostname.endsWith(".notify.windows.com"))
      );
    }, "Proveedor push no permitido"),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(256),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(128),
  }),
});
export function registerNotifications(app: FastifyInstance) {
  app.get("/api/notifications/key", async () => ({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  }));
  app.post("/api/notifications/subscribe", async (req) => {
    const subscription = subscriptionSchema.parse(req.body);
    const id = createHash("sha256").update(subscription.endpoint).digest("hex");
    await pool.query(
      "INSERT INTO push_subscriptions(id,owner_id,subscription) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET owner_id=EXCLUDED.owner_id,subscription=EXCLUDED.subscription",
      [id, req.user!.id, subscription],
    );
    return { ok: true };
  });
  app.post("/api/notifications/unsubscribe", async (req) => {
    const { endpoint } = z
      .object({ endpoint: z.string().max(4096) })
      .parse(req.body);
    await pool.query(
      "DELETE FROM push_subscriptions WHERE owner_id=$1 AND id=$2",
      [req.user!.id, createHash("sha256").update(endpoint).digest("hex")],
    );
    return { ok: true };
  });
}
export function startReminders(app: FastifyInstance) {
  if (
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  )
    return () => {};
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    const c = await pool.connect().catch(() => null);
    if (!c) {
      running = false;
      return;
    }
    try {
      await c.query("BEGIN");
      const lock = await c.query(
        "SELECT pg_try_advisory_xact_lock(771290) AS locked",
      );
      if (!lock.rows[0].locked) {
        await c.query("ROLLBACK");
        return;
      }
      // Only valid ISO reminder timestamps can be written through the shared task schema.
      const { rows } =
        await c.query(`SELECT e.id AS task_id,e.data,s.id AS subscription_id,s.subscription FROM entities e
        JOIN push_subscriptions s ON s.owner_id=e.owner_id
        LEFT JOIN reminder_deliveries d ON d.task_id=e.id AND d.reminder_at=e.data->>'reminderAt' AND d.subscription_id=s.id
        WHERE e.type='task' AND e.deleted_at IS NULL AND e.data->>'completedAt' IS NULL
          AND e.data->>'reminderAt' IS NOT NULL AND (e.data->>'reminderAt')::timestamptz<=now()
          AND (e.data->>'reminderAt')::timestamptz>now()-interval '7 days' AND d.task_id IS NULL LIMIT 50`);
      for (const row of rows) {
        try {
          await webpush.sendNotification(
            row.subscription,
            JSON.stringify({
              title: "Pulso · Un pendiente para ti",
              body: row.data.title,
              taskId: row.task_id,
            }),
            { TTL: 3600, timeout: 10000 },
          );
          await c.query(
            "INSERT INTO reminder_deliveries(task_id,reminder_at,subscription_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [row.task_id, row.data.reminderAt, row.subscription_id],
          );
        } catch (e) {
          if (
            [404, 410].includes((e as { statusCode?: number }).statusCode ?? 0)
          )
            await c.query("DELETE FROM push_subscriptions WHERE id=$1", [
              row.subscription_id,
            ]);
          else
            app.log.warn(
              { taskId: row.task_id },
              "No se pudo entregar un recordatorio; se reintentará",
            );
        }
      }
      await c.query("COMMIT");
    } catch {
      await c.query("ROLLBACK");
      app.log.warn("Falló el ciclo de recordatorios");
    } finally {
      c.release();
      running = false;
    }
  }, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
