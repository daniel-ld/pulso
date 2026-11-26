import { createApp } from "./app.js";
import { migrate, pool } from "./db.js";
import { startReminders } from "./notifications.js";
await migrate();
const app = await createApp();
await app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" });
const stopReminders = startReminders(app);
async function close() {
  stopReminders();
  await app.close();
  await pool.end();
}
process.once("SIGTERM", () => {
  void close();
});
process.once("SIGINT", () => {
  void close();
});
