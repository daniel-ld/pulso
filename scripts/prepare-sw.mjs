import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../apps/web/dist/", import.meta.url);
const assets = (await readdir(new URL("assets/", root))).map(
  (name) => "/assets/" + name,
);
const path = new URL("sw.js", root);
let script = await readFile(path, "utf8");
const digest = createHash("sha256")
  .update(assets.join(","))
  .update(script)
  .update(await readFile(new URL("theme-init.js", root)))
  .digest("hex")
  .slice(0, 12);
if (!/\/\*__BUILD__\*\/\s*"development"/.test(script))
  throw new Error("Missing worker build marker");
script = script.replace(
  /\/\*__BUILD__\*\/\s*"development"/,
  JSON.stringify(digest),
);
await writeFile(path, script);
console.log(
  "Push-only service worker build " +
    digest +
    "; application caching disabled.",
);
