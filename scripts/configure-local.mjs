import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
try {
  await writeFile(
    new URL("../.env", import.meta.url),
    `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\nSETUP_KEY=${randomBytes(32).toString("hex")}\nAPP_ORIGIN=http://localhost:4173\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Configuración local creada en .env. Secreto de instalación: SETUP_KEY. No se imprime en consola.",
  );
} catch (e) {
  if (e.code === "EEXIST")
    console.log(".env ya existe; se conservó sin cambios.");
  else throw e;
}
