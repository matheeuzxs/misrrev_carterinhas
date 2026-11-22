import { readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("../backend/worker.mjs",import.meta.url),"utf8");
const imports = [...source.matchAll(/^import \{[^\n]+\} from "(\.\.\/site\/assets\/[^"]+\.js)";\n/gm)];
if (!imports.length) throw new Error("Não foi possível encontrar os módulos compartilhados da API.");
const modules = [];
let main = source;
for (const [line,path] of imports) {
  const code = await readFile(new URL(path, new URL("../backend/worker.mjs",import.meta.url)), "utf8");
  modules.push(code.replace(/^export (?=(const|function) )/gm,""));
  main=main.replace(line,"");
}
const result = "// Gerado por npm run preparar a partir de backend/worker.mjs e dos módulos compartilhados.\n" + modules.join("\n") + "\n" + main;
await writeFile(new URL("../site/_worker.js",import.meta.url),result);

