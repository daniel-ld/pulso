import * as webpush from "web-push";
import { writeFile } from "node:fs/promises";
const keys = webpush.generateVAPIDKeys();
await writeFile(
  new URL("../.env.push", import.meta.url),
  `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:reemplaza@tudominio.com\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Claves creadas en .env.push (ignorado por Git). Configura VAPID_SUBJECT y copia las variables a Coolify.",
);
