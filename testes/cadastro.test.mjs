import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../site/_worker.js";
import { abrirBanco } from "../ferramentas/banco-local.mjs";
import { VERSAO_CONSENTIMENTO } from "../site/assets/dados.js";

const url = "https://igreja.example";
function fixture(t) {
  const db = abrirBanco();
  t.after(() => db.close());
  // Chave aleatória, válida só dentro deste teste.
  const secret = crypto.randomUUID();
  const env = { MEMBROS_DB: db, SENHA_SECRETARIA: secret };
  const req = (path, method = "GET", data, cookie, headers = {}) => {
    const opts = { method, headers: { ...(method === "GET" ? {} : { Origin: url }), ...headers } };
    if (cookie) opts.headers.Cookie = cookie;
    if (data !== undefined) {
      if (data instanceof Uint8Array) opts.body = data;
      else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(data); }
    }
    return worker.fetch(new Request(url + path,opts),env);
  };
  const login = async () => {
    const res = await req("/api/secretaria/entrar","POST",{ senha:secret });
    assert.equal(res.status,200);
    return res.headers.get("Set-Cookie");
  };
  return { env, req, login };
}
function entry(changes = {}) {
  return { solicitacao: crypto.randomUUID(), nome:"Pessoa de Teste", telefone:"(11) 90000-0000", ano:"2020", funcao:"Membro", nascimento:"1990-05-12", batismo:"2015-08-30", pai:"José de Teste", mae:"Maria de Teste", estado_civil:"Solteiro(a)", rg:"12.345.678-9", cpf:"529.982.247-25", naturalidade:"Guarulhos - SP", consentimento:true, versaoConsentimento:VERSAO_CONSENTIMENTO, ...changes };
}

test("recebe, normaliza e confirma apenas uma vez, mesmo ao repetir o mesmo envio",async t => {
  const { req,login } = fixture(t);
  const data = entry({ nome:"  Pessoa  de Teste  ", telefone:"+55 (11) 90000-0000" });
  const responses = await Promise.all([req("/api/cadastros","POST",data),req("/api/cadastros","POST",data)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
  const receipts = await Promise.all(responses.map(r=>r.json()));
  assert.equal(receipts[0].protocolo,receipts[1].protocolo);
  assert.deepEqual(Object.keys(receipts[0]),["protocolo"]);
  assert.equal((await req("/api/cadastros","POST",{...data,nome:"Outro teste"})).status,409);
  const c = (await login()).split(";")[0];
  const listed = await (await req("/api/secretaria/lista","POST",{},c)).json();
  assert.equal(listed.total,1);
  assert.equal(listed.membros[0].nome,"Pessoa de Teste");
  assert.equal(listed.membros[0].telefone,"11900000000");
});
test("valida os campos e a autorização no servidor, com falha fechada se faltar configuração",async t => {
  const {req,env} = fixture(t);
  assert.equal((await req("/api/pronto")).status,200);
  for (const change of [{nome:""}, {ano:"2099"}, {telefone:"123"}, {funcao:""}, {consentimento:false}, {versaoConsentimento:"antiga"}]) {
    assert.equal((await req("/api/cadastros","POST",entry(change))).status,422);
  }
  assert.equal((await req("/api/cadastros","POST",entry(),null,{Origin:"https://outro.example"})).status,403);
  env.SENHA_SECRETARIA="";
  assert.equal((await req("/api/cadastros","POST",entry())).status,503);
});
test("listagem, exportação e fotos exigem sessão, e sair ou trocar a senha invalida o acesso",async t => {
  const {req,login,env} = fixture(t);
  for (const path of ["/lista","/exportar"]) assert.equal((await req("/api/secretaria"+path,"POST",{})).status,401);
  assert.equal((await req("/api/secretaria/membros/"+crypto.randomUUID()+"/foto")).status,401);
  assert.equal((await req("/api/cadastros")).status,405);
  const cookie = await login();
  assert.match(cookie,/HttpOnly/); assert.match(cookie,/Secure/); assert.match(cookie,/SameSite=Strict/);
  const token=cookie.split(";")[0];
  assert.equal((await req("/api/secretaria/sessao","GET",undefined,token)).status,200);
  assert.equal((await req("/api/secretaria/sair","POST",undefined,token)).status,200);
  assert.equal((await req("/api/secretaria/sessao","GET",undefined,token)).status,401);
  const other=(await login()).split(";")[0];
  env.SENHA_SECRETARIA=crypto.randomUUID();
  assert.equal((await req("/api/secretaria/sessao","GET",undefined,other)).status,401);
});
test("limita tentativas repetidas de entrada",async t => {
  const {req}=fixture(t);
  for(let i=0;i<8;i++) assert.equal((await req("/api/secretaria/entrar","POST",{senha:"incorreta"})).status,401);
  const blocked=await req("/api/secretaria/entrar","POST",{senha:"incorreta"});
  assert.equal(blocked.status,429); assert.ok(Number(blocked.headers.get("Retry-After"))>0);
});
test("confere e corrige fichas, protege a matrícula, exporta filtros e remove registros",async t => {
  const {req,login}=fixture(t);
  await req("/api/cadastros","POST",entry({nome:"Ágata Teste",ano:""}));
  await req("/api/cadastros","POST",entry({nome:"Outro Membro"}));
  const c=(await login()).split(";")[0];
  async function find(term) {
    const data=await (await req("/api/secretaria/lista","POST",{busca:term},c)).json();
    return data.membros[0];
  }
  const m=await find("agata");
  assert.equal(m.ano,null);
  const path="/api/secretaria/membros/"+m.id;
  assert.equal((await req(path,"PATCH",{...m,situacao:"emitido"},c)).status,422);
  const edited=await (await req(path,"PATCH",{...m,matricula:"0007",ano:2019,situacao:"conferido"},c)).json();
  assert.equal(edited.revisao,2);
  assert.equal((await req(path,"PATCH",m,c)).status,409);
  const second=await find("outro");
  assert.equal((await req("/api/secretaria/membros/"+second.id,"PATCH",{...second,matricula:"7"},c)).status,409);
  const csv=await req("/api/secretaria/exportar","POST",{situacao:"conferido"},c);
  assert.match(csv.headers.get("Content-Type"),/text\/csv/);
  const content=await csv.text();
  assert.match(content,/"Ágata Teste"/);
  assert.match(content,/"0007"/); assert.doesNotMatch(content,/Outro Membro/);
  assert.equal((await req(path,"DELETE",{revisao:m.revisao},c)).status,409);
  assert.equal((await req(path,"DELETE",{revisao:edited.revisao},c)).status,200);
  assert.equal((await req(path,"GET",undefined,c)).status,404);
});


test("anexa e baixa a foto da ficha certa com autenticação e controle de revisão",async t => {
  const {req,login}=fixture(t);
  const cookie=(await login()).split(";")[0];
  await req("/api/cadastros","POST",entry());
  const data=await (await req("/api/secretaria/lista","POST",{},cookie)).json();
  const m=data.membros[0];
  const path="/api/secretaria/membros/"+m.id+"/foto";
  assert.equal((await req(path,"GET",undefined,cookie)).status,404);
  const jpg=Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzf/wAARCAAWABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAQF/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AkwGghAAf/9k=","base64");
  const headers={"Content-Type":"image/jpeg","X-Revisao":String(m.revisao)};
  assert.equal((await req(path,"PUT",jpg,undefined,headers)).status,401);
  const first=await req(path,"PUT",jpg,cookie,headers);
  assert.equal(first.status,200);
  const updated=await first.json();
  assert.equal(updated.tem_foto,1);
  assert.equal(updated.revisao,m.revisao+1);
  assert.equal((await req(path,"PUT",jpg,cookie,headers)).status,409);
  const res=await req(path,"GET",undefined,cookie);
  assert.equal(res.headers.get("Content-Type"),"image/jpeg");
  assert.match(res.headers.get("Cache-Control"),/no-store/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()),jpg);
  assert.equal((await req(path,"GET")).status,401);
  const unsupported=await req(path,"PUT",jpg,cookie,{"Content-Type":"image/png","X-Revisao":String(updated.revisao)});
  assert.equal(unsupported.status,415);
});
