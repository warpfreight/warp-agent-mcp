import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../dist/index.js", import.meta.url);
const src = readFileSync(file, "utf8");

if (!src.startsWith("#!")) {
  writeFileSync(file, "#!/usr/bin/env node\n" + src);
}
