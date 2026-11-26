// Administrative recovery. Run interactively inside the API container; never expose as an HTTP route.
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import pg from "pg";
if (!process.stdin.isTTY)
  throw new Error("La recuperación requiere una terminal interactiva.");
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(
  "Esto cambiará la contraseña personal y cerrará todas las sesiones. Escribe RESTABLECER para continuar: ",
);
rl.close();
if (answer !== "RESTABLECER") process.exit(0);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("hex");
const derived = await promisify(scryptCallback)(password, salt, 64);
const c = await pool.connect();
try {
  await c.query("BEGIN");
  const { rows } = await c.query("SELECT id,email FROM users FOR UPDATE");
  if (rows.length !== 1)
    throw new Error("Se esperaba exactamente una cuenta personal");
  await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
    `${salt}:${derived.toString("hex")}`,
    rows[0].id,
  ]);
  await c.query("DELETE FROM sessions WHERE user_id=$1", [rows[0].id]);
  await c.query("COMMIT");
  console.log(
    `Cuenta recuperada: ${rows[0].email}\nNueva contraseña: ${password}\nGuárdala en tu gestor de contraseñas. No compartas esta salida.`,
  );
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
