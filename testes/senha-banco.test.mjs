import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../site/_worker.js";
import { abrirBanco } from "../ferramentas/banco-local.mjs";

const url = "https://igreja.example";

test("sem o segredo no painel, a senha guardada no banco libera a secretaria", async t => {
  const db = abrirBanco();
  t.after(() => db.close());
  const env = { MEMBROS_DB: db };
  const call = (path, method = "GET", data) => worker.fetch(new Request(url + path, {
    method,
    headers: method === "GET" ? {} : { Origin: url, "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data)
  }), env);

  assert.equal((await call("/api/pronto")).status, 503);
  const sql = await readFile(new URL("../banco/003_configuracao.sql", import.meta.url), "utf8");
  await db.batch(sql.split(";").map(x => x.replace(/--.*$/gm, "").trim()).filter(Boolean).map(x => db.prepare(x)));
  const senha = crypto.randomUUID();
  await db.prepare("INSERT INTO configuracao(chave,valor) VALUES('senha_secretaria',?)").bind(senha).run();

  assert.equal((await call("/api/pronto")).status, 200);
  assert.equal((await call("/api/secretaria/entrar", "POST", { senha: "errada-errada-errada" })).status >= 400, true);
  assert.equal((await call("/api/secretaria/entrar", "POST", { senha })).status, 200);
});

test("manter conectado cria sessão de 30 dias; sem marcar, a sessão é curta", async t => {
  const db = abrirBanco();
  t.after(() => db.close());
  const env = { MEMBROS_DB: db, SENHA_SECRETARIA: crypto.randomUUID() };
  const entrar = manter => worker.fetch(new Request(url + "/api/secretaria/entrar", {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify({ senha: env.SENHA_SECRETARIA, manter })
  }), env);
  const longa = await entrar(true);
  assert.equal(longa.status, 200);
  assert.match(longa.headers.get("Set-Cookie"), /Max-Age=2592000;/);
  const curta = await entrar(false);
  assert.match(curta.headers.get("Set-Cookie"), /Max-Age=14400;/);
});
