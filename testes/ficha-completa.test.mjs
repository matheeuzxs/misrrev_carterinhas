import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../site/_worker.js";
import { abrirBanco } from "../ferramentas/banco-local.mjs";
import { VERSAO_CONSENTIMENTO, cpfValido, mostrarData, camposPendentes, mascaraCpf, formatarRg } from "../site/assets/dados.js";
import { modeloInicial, completarModelo, conferirModelo, CAMPOS_CARTAO } from "../site/assets/impressao/modelo.js";

const url = "https://igreja.example";
function servico(t) {
  const db = abrirBanco(); t.after(() => db.close());
  const env = { MEMBROS_DB: db, SENHA_SECRETARIA: crypto.randomUUID() };
  const req = (path, method = "GET", data, cookie) => worker.fetch(new Request(url + path, {
    method, headers: { ...(method === "GET" ? {} : { Origin: url, "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data)
  }), env);
  const login = async () => (await req("/api/secretaria/entrar", "POST", { senha: env.SENHA_SECRETARIA })).headers.get("Set-Cookie").split(";")[0];
  return { req, login };
}
const ficha = (c = {}) => ({ solicitacao: crypto.randomUUID(), nome: "Ana Oliveira", telefone: "11999990000", funcao: "Membro",
  nascimento: "1990-05-12", batismo: "2015-08-30", pai: "José Oliveira", mae: "Maria Oliveira", estado_civil: "Casado(a)",
  rg: "12.345.678-9", cpf: "529.982.247-25", naturalidade: "Guarulhos - SP", consentimento: true, versaoConsentimento: VERSAO_CONSENTIMENTO, ...c });

test("CPF e datas são validados", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("529.982.247-24"), false);
  assert.equal(mostrarData("2015-08-30"), "30/08/2015");
  assert.equal(mascaraCpf("5299"), "529.9"); assert.equal(mascaraCpf("52998224725"), "529.982.247-25"); assert.equal(mascaraCpf("529.982.247-2599"), "529.982.247-25");
  assert.equal(formatarRg("34567890x"), "34.567.890-X"); assert.equal(formatarRg("34.567.890-1"), "34.567.890-1");
  assert.equal(formatarRg("MG-12.345.678"), "MG-12.345.678"); assert.equal(formatarRg("1234567"), "1234567");
  assert.deepEqual(camposPendentes({ nascimento: "1990-01-01", cpf: "52998224725" }), ["Data de batismo","Estado civil","Natural de","Pai","Mãe","RG"]);
});

test("grava a ficha completa, recusa dados inválidos e exporta todas as colunas", async t => {
  const { req, login } = servico(t);
  for (const c of [{ nome: "" }, { telefone: "" }, { nascimento: "2099-01-01" }, { nascimento: "1990-02-30" }, { cpf: "123.456.789-00" },
    { batismo: "1980-01-01" }, { estado_civil: "Noivo" }, { funcao: "Outro" }, { funcao: "Bispo" }]) {
    assert.equal((await req("/api/cadastros", "POST", ficha(c))).status, 422, JSON.stringify(c));
  }
  for (const k of ["rg","cpf"]) assert.equal((await req("/api/cadastros", "POST", ficha({ [k]: "" }))).status, 422, "obrigatório: " + k);
  const vazia = ficha({ nascimento: "", batismo: "", pai: "", mae: "", estado_civil: "", naturalidade: "", cpf: "111.444.777-35" });
  assert.equal((await req("/api/cadastros", "POST", vazia)).status, 201, "campos em branco são aceitos como pendência");
  assert.equal((await req("/api/cadastros", "POST", ficha({ pai: "Não consta", cpf: "390.533.447-05" }))).status, 201);
  assert.equal((await req("/api/cadastros", "POST", ficha())).status, 201);
  const c = await login();
  const lista = await (await req("/api/secretaria/lista", "POST", { busca: "52998224725" }, c)).json();
  assert.equal(lista.total, 1);
  const m = lista.membros[0];
  assert.equal(m.cpf, "52998224725"); assert.equal(m.mae, "Maria Oliveira"); assert.equal(m.nascimento, "1990-05-12");
  assert.equal(m.funcao_solicitada, "Membro"); assert.equal(m.funcao_aprovada, 0);
  assert.equal((await req("/api/secretaria/membros/" + m.id, "PATCH", { ...m, matricula: "12", situacao: "emitido" }, c)).status, 422);
  const emitida = await (await req("/api/secretaria/membros/" + m.id, "PATCH", { ...m, matricula: "12", situacao: "emitido", funcao_aprovada: true }, c)).json();
  assert.equal(emitida.funcao_aprovada, 1);
  assert.match(emitida.emissao, /^\d{4}-\d{2}-\d{2}$/);
  const csv = await (await req("/api/secretaria/exportar", "POST", {}, c)).text();
  assert.match(csv, /Data de nascimento.*CPF.*Natural de.*Data de emissão/);
  assert.match(csv, /"529\.982\.247-25"/);
  assert.match(csv, /"12\/05\/1990"/);
});

test("modelos salvos antes dos campos novos continuam válidos", () => {
  const antigo = modeloInicial();
  for (const k of ["batismo","pai","mae","nascimento","estado_civil","rg","cpf","emissao","naturalidade"]) delete antigo.campos[k];
  const completo = completarModelo(antigo);
  assert.deepEqual(Object.keys(completo.campos).sort(), Object.keys(CAMPOS_CARTAO).sort());
  for (const k of ["batismo","pai","mae","nascimento","estado_civil","rg","cpf","emissao","naturalidade"]) assert.equal(completo.campos[k].lado, "oculto");
  assert.doesNotThrow(() => conferirModelo(completo, false));
  assert.doesNotThrow(() => conferirModelo(modeloInicial(), true));
});


test("a lista de nomes mostra quem tem foto e exige login", async t => {
  const { req, login } = servico(t);
  assert.equal((await req("/api/cadastros", "POST", ficha({ nome: "Bruno Souza" }))).status, 201);
  assert.equal((await req("/api/secretaria/nomes")).status, 401);
  const { membros } = await (await req("/api/secretaria/nomes", "GET", undefined, await login())).json();
  assert.deepEqual(membros.map(m => [m.nome, m.tem_foto]), [["Bruno Souza", 0]]);
  assert.ok(membros[0].id && membros[0].revisao && membros[0].funcao);
});
