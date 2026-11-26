import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../apps/web/dist/", import.meta.url);
const assets = (await readdir(new URL("assets/", root))).map(
  (name) => "/assets/" + name,
);
const digest = createHash("sha256")
  .update(assets.join(","))
  .digest("hex")
  .slice(0, 12);
const path = new URL("sw.js", root);
let script = await readFile(path, "utf8");
script = script.replace(
  "'pulso-shell-v1'",
  JSON.stringify("pulso-shell-" + digest),
);
script = script.replace("/*__ASSETS__*/[]", JSON.stringify(assets));
await writeFile(path, script);
console.log("Service worker precaches the exact built JavaScript and CSS.");
