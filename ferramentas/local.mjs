import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import worker from "../site/_worker.js";
import { abrirBanco } from "./banco-local.mjs";

const root = fileURLToPath(new URL("../site/", import.meta.url));
const dataDir = fileURLToPath(new URL("../dados-locais/", import.meta.url));
const port = Number(process.env.PORTA || 8788);
const password = process.env.SENHA_SECRETARIA || randomBytes(18).toString("base64url");
const dbFile = process.env.MISRREV_BANCO_LOCAL || resolve(dataDir, "cadastros.sqlite");
if (password.length < 16 || password.length > 256) throw new Error("Use SENHA_SECRETARIA com 16 a 256 caracteres.");
if (dbFile !== ":memory:") await mkdir(dataDir, { recursive: true, mode: 0o700 });
const db = abrirBanco(dbFile);

const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".wasm":"application/wasm", ".otf":"font/otf", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".webp":"image/webp", ".ttf":"font/ttf", ".txt":"text/plain; charset=utf-8" };
const rules = (await readFile(resolve(root, "_headers"),"utf8")).split(/\n\s*\n/).map(group => {
  const [pattern,...rows] = group.trim().split("\n");
  const headers = {};
  for (const line of rows) {
    const colon = line.indexOf(":");
    if (colon > 0) headers[line.slice(0,colon).trim()] = line.slice(colon+1).trim();
  }
  return { pattern, headers };
});
async function localAssets(request) {
  if (!["GET","HEAD"].includes(request.method)) return new Response(null,{ status:405 });
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response(null,{ status:400 }); }
  if (["/secretaria","/secretaria/carteirinhas","/secretaria/fotos"].includes(pathname)) return Response.redirect(new URL(pathname + "/", request.url),308);
  const clean = pathname.endsWith("/") ? pathname + "index.html" : pathname;
  const path = resolve(root, "." + clean);
  const blocked = !(path.startsWith(resolve(root) + sep)) || clean.split("/").some(part => part.startsWith("_") || part.startsWith("."));
  let found = false;
  if (!blocked) { try { found = (await stat(path)).isFile(); } catch {} }
  const selected = found ? path : resolve(root, "404.html");
  const headers = { "Content-Type": types[extname(selected)] || "application/octet-stream" };
  for (const rule of rules) if (rule.pattern === "/*" || (rule.pattern.endsWith("*") ? pathname.startsWith(rule.pattern.slice(0,-1)) : pathname === rule.pattern)) Object.assign(headers,rule.headers);
  return new Response(request.method === "HEAD" ? null : await readFile(selected), { status:found ? 200 : 404, headers });
}
const env = { MEMBROS_DB: db, SENHA_SECRETARIA: password, ASSETS: { fetch: localAssets } };
const server = createServer(async (req,res) => {
  try {
    const origin = "http://127.0.0.1:" + port;
    const host = req.headers.host;
    if (host !== "127.0.0.1:" + port && host !== "localhost:" + port) { res.writeHead(403).end(); return; }
    const url = new URL(req.url, host.startsWith("localhost:") ? "http://" + host : origin);
    const opts = { method:req.method, headers:req.headers };
    if (!["GET","HEAD"].includes(req.method)) { opts.body = Readable.toWeb(req); opts.duplex = "half"; }
    const response = await worker.fetch(new Request(url,opts), env);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    if (!response.body) res.end();
    else Readable.fromWeb(response.body).pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(port,"127.0.0.1",() => {
  console.log("Cadastro local: http://127.0.0.1:" + port + "/");
  console.log("Secretaria local: http://127.0.0.1:" + port + "/secretaria/");
  if (!process.env.SENHA_SECRETARIA) console.log("Senha temporária somente para este teste local: " + password);
});
function stop() { server.close(() => { db.close(); process.exit(); }); }
process.on("SIGINT",stop);
process.on("SIGTERM",stop);

