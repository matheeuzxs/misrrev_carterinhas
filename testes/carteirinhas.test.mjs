import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import worker from "../site/_worker.js";
import { abrirBanco } from "../ferramentas/banco-local.mjs";
import { modeloInicial, conferirModelo } from "../site/assets/impressao/modelo.js";
import { montarFolha, posicaoNaFolha, lerFundo, gerarPdf, conferirProporcao } from "../site/assets/impressao/pdf.js";
import { PDFDocument,rgb } from "../site/assets/impressao/vendor/pdf-lib.js";

const pt=72/25.4;
const base="/api/secretaria/carteirinhas";
async function arte(larga=false) {
  const doc=await PDFDocument.create();
  for(const cor of [rgb(.12,.23,.35),rgb(.9,.8,.65)]) {
    const page=doc.addPage([85.6*pt,54*pt]);
    page.drawRectangle({x:0,y:0,width:85.6*pt,height:5*pt,color:cor});
  }
  if(larga)doc.setSubject("A".repeat(420000));
  return doc.save({useObjectStreams:false});
}
async function servico(t) {
  const db=abrirBanco();t.after(()=>db.close());
  const env={ MEMBROS_DB:db,SENHA_SECRETARIA:crypto.randomUUID() };
  const origin="https://igreja.example";let cookie="";
  async function call(path,method="GET",data,extra={}) {
    const headers={Origin:origin,Cookie:cookie,...extra};
    let body;
    if(data instanceof Uint8Array)body=data;
    else if(data!==undefined){headers["Content-Type"]="application/json";body=JSON.stringify(data);}
    return worker.fetch(new Request(origin+path,{method,headers,body}),env);
  }
  async function login(){const res=await call("/api/secretaria/entrar","POST",{senha:env.SENHA_SECRETARIA});assert.equal(res.status,200);cookie=res.headers.get("Set-Cookie").split(";")[0];}
  return {db,call,login};
}
function cadastrar(db,i,temMatricula=true) {
  const id=crypto.randomUUID(),mat=String(i).padStart(4,"0"),name="Ficha "+mat;
  db.prepare("INSERT INTO membros(id,solicitacao,resumo_envio,protocolo,nome,nome_busca,telefone,ano,funcao,matricula,situacao,consentimento_versao,recebido_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,crypto.randomUUID(),"teste","TESTE-"+mat,name,name,"11900000000",null,"Membro",temMatricula?mat:null,i%2?"conferido":"recebido","teste","2026-01-01","2026-01-01").run();
  return id;
}
test("a migração acrescenta o modelo e preserva os membros de um banco da primeira versão",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"misrrev-teste-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"banco.sqlite"),old=new DatabaseSync(path);
  old.exec(await readFile(new URL("../banco/001_cadastros.sql",import.meta.url),"utf8"));
  old.exec("INSERT INTO membros(id,solicitacao,resumo_envio,protocolo,nome,nome_busca,telefone,funcao,consentimento_versao,recebido_em,atualizado_em) VALUES('id-teste','sol-teste','r','protocolo-teste','Nome de teste','nome de teste','11900000000','Membro','v1','2026-01-01','2026-01-01')");
  old.close();
  for(let i=0;i<2;i++){const db=abrirBanco(path);assert.equal(db.prepare("SELECT nome FROM membros").first().nome,"Nome de teste");assert.equal(db.prepare("SELECT revisao FROM modelo_carteirinha").first().revisao,0);db.close();}
});
test("apenas a equipe publica a arte, recupera todos os blocos e troca o modelo sem alterar fichas",async t=>{
  const {db,call,login}=await servico(t);
  for(const path of ["/modelo","/artes/exemplo"])assert.equal((await call(base+path)).status,401);
  assert.equal((await call(base+"/lote","POST",{})).status,401);
  await login();
  const empty=await (await call(base+"/modelo")).json();assert.equal(empty.frente,null);
  assert.equal((await call(base+"/lote","POST",{revisao:0})).status,422);
  const bytes=await arte(true);assert.ok(bytes.length>384*1024);
  const art=await (await call(base+"/artes","POST",bytes,{"Content-Type":"application/pdf"})).json();
  assert.match(art.chave,/^[a-f0-9]{64}$/);
  const raw=await call(base+"/artes/"+art.chave);
  assert.equal(raw.headers.get("Content-Type"),"application/pdf");assert.match(raw.headers.get("Cache-Control"),/no-store/);
  assert.deepEqual(new Uint8Array(await raw.arrayBuffer()),bytes);
  const cfg=modeloInicial();cfg.campos.foto.lado="oculto";
  const data={revisao:0,config:cfg,frente:{chave:art.chave,pagina:1},verso:{chave:art.chave,pagina:2}};
  const first=await (await call(base+"/modelo","PUT",data)).json();assert.equal(first.revisao,1);assert.equal(first.verso.pagina,2);
  assert.equal((await call(base+"/modelo","PUT",data)).status,409);
  for(let i=1;i<=29;i++)cadastrar(db,i,i<=27);
  const batch=await (await call(base+"/lote","POST",{revisao:1})).json();assert.equal(batch.prontas.length,27);assert.equal(batch.pendentes.length,2);
  assert.deepEqual(batch.pendentes[0].faltam,["Matrícula"]);assert.equal(batch.prontas[0].telefone,undefined);
  const filtered=await (await call(base+"/lote","POST",{revisao:1,situacao:"conferido"})).json();assert.equal(filtered.prontas.length,14);
  cfg.campos.foto.lado="frente";cfg.campos.ano.lado="verso";
  const next=await call(base+"/modelo","PUT",{...data,config:cfg,revisao:1});assert.equal(next.status,200);
  assert.equal((await call(base+"/lote","POST",{revisao:1})).status,409);
  const now=await (await call(base+"/lote","POST",{revisao:2})).json();assert.equal(now.prontas.length,0);assert.equal(now.pendentes.length,29);
  assert.ok(now.pendentes[0].faltam.includes("Foto"));assert.ok(now.pendentes[0].faltam.includes("Membro desde"));
  assert.equal((await call(base+"/modelo","PUT",{...data,config:cfg,revisao:2,verso:null})).status,422);
});
test("o PDF reúne mais de uma página da lista, alterna faces e espelha os lugares do verso",async()=>{
  const model=modeloInicial();model.campos.foto.lado="oculto";model.campos.matricula.lado="verso";
  const art=await lerFundo(await arte(),"application/pdf"),artes={frente:{art,pagina:1},verso:{art,pagina:2}};
  const fichas=Array.from({length:27},(_,i)=>({nome:"Membro "+(i+1),matricula:String(i+1).padStart(4,"0"),funcao:"Diácono"}));
  const output=await gerarPdf({model,artes,fichas});
  const doc=await PDFDocument.load(output);assert.equal(doc.getPageCount(),6);
  const l=montarFolha(model,"A4");assert.equal(l.capacidade,10);
  const a=posicaoNaFolha(l,0);const long=posicaoNaFolha(l,0,"verso","longa"),short=posicaoNaFolha(l,0,"verso","curta");
  assert.ok(Math.abs(a.x+long.x+l.cartaoW-l.w)<1e-5 && a.y===long.y);
  assert.ok(Math.abs(a.y+short.y+l.cartaoH-l.h)<1e-5 && a.x===short.x);
  assert.ok(Math.abs(doc.getPages()[0].getWidth()/pt-210)<1e-5);
  const single=await PDFDocument.load(await gerarPdf({model,artes,fichas:fichas.slice(0,1),papel:"individual"}));
  assert.equal(single.getPageCount(),2);assert.ok(Math.abs(single.getPages()[0].getTrimBox().height/pt-54)<1e-5);
  assert.throws(()=>conferirProporcao(art,1,{...model,largura:130},"frente"),/proporção/);
  assert.throws(()=>conferirModelo({...model,campos:{...model.campos,foto:{...model.campos.foto,lado:"frente",x:80}}},true),/caber/);
  assert.equal(montarFolha({...model,sangria:3},"A4").capacidade,8);
});

