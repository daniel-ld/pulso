import { spawn } from "node:child_process";
import { mkdir, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
const directory = new URL("../backups/", import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
const name = `pulso-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
const path = new URL(name, directory);
const child = spawn(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "db",
    "pg_dump",
    "-U",
    "pulso",
    "-d",
    "pulso",
    "--format=custom",
  ],
  {
    cwd: new URL("../", import.meta.url),
    stdio: ["ignore", "pipe", "inherit"],
  },
);
const status = new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`pg_dump terminó con código ${code}`)),
  );
});
try {
  await Promise.all([
    pipeline(
      child.stdout,
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
    ),
    status,
  ]);
  console.log(
    `Respaldo creado en backups/${name}. Copia este archivo fuera del servidor.`,
  );
} catch (e) {
  await unlink(path).catch(() => {});
  throw e;
}
