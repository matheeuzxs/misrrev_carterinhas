import { $, api, aviso } from "../comum.js";
import { chaveBusca } from "../dados.js";
import { modeloInicial, conferirModelo, LIMITE_ARTE } from "./modelo.js";
import { lerFundo, dimensoesFundo, conferirProporcao, montarFolha, gerarPdf } from "./pdf.js";

const apiBase="/api/secretaria/carteirinhas";
const refs={ frente:null,verso:null,verso2:null };
const exemplo={ nome:"Ana Oliveira",matricula:"0001",funcao:"Pastor(a)",ano:2024,telefone:"11999990000",nascimento:"1990-05-12",batismo:"2015-08-30",pai:"José Oliveira",mae:"Maria Oliveira",estado_civil:"Casado(a)",rg:"12.345.678-9",cpf:"52998224725",emissao:"2026-11-22",naturalidade:"Guarulhos - SP" };
const botoesLado=["frente","verso","verso2"];
// Os campos marcados como "verso" aparecem nos dois versos; o fundo muda conforme o cargo.
const ladoDosCampos=f=>f==="frente"?"frente":"verso";
let salvo={ revisao:0 }, model=modeloInicial(), selecionado="nome", face="frente";
// Carteirinhas escolhidas pelo nome; fichas novas no lote entram marcadas.
const escolhidos=new Set(), conhecidos=new Set();
let travado=false, alterado=false, ocupado=false, lote=null, consultando=false, leitura=0, pintura=0, timer;
let pdfjs, arquivoGerado="";
const numFmt=n=>Number(n.toFixed(2)).toLocaleString("pt-BR");
const urlLogin="/secretaria/?abrir=carteirinhas";
const numberInput=id=>{const el=$("#"+id);return el.value.trim()==="" ? NaN:Number(el.value);};

async function privado(path,options) {
  try { return await api(path,options); }
  catch(error){
    if(error.status===401){alterado=false;$("#studio").hidden=true;location.replace(urlLogin);}
    throw error;
  }
}
function encerrarTela(message) {
  $("#studio").hidden=true;
  $("#loading").hidden=false;
  aviso($("#loading"),message);
}
async function carregarArquivos(modeloSalvo) {
  const cache=new Map();
  for(const side of botoesLado) {
    const ref=modeloSalvo[side];
    refs[side]=null;
    if(!ref) continue;
    if(!cache.has(ref.chave)){
      const r=await privado(apiBase+"/artes/"+ref.chave,{raw:true});
      cache.set(ref.chave,await lerFundo(new Uint8Array(await r.arrayBuffer()),ref.tipo));
    }
    refs[side]={ ...ref, art:cache.get(ref.chave) };
  }
}
function atualizarArquivos() {
  for(const side of botoesLado) {
    const ref=refs[side];
    let detail=side==="frente" ? "Obrigatória":"Opcional";
    if(ref) {
      const dim=dimensoesFundo(ref.art,ref.pagina,model.sangria);
      const tipo=ref.art.tipo==="application/pdf" ? "PDF · pág. "+ref.pagina : ref.art.tipo==="image/png" ? "PNG":"JPEG";
      detail=tipo+" · "+numFmt(dim.largura)+" × "+numFmt(dim.altura)+" "+dim.unidade;
      if(dim.unidade==="px" && model.largura>0 && model.altura>0){
        const ppi=Math.floor(Math.min(dim.largura/(model.largura+2*model.sangria),dim.altura/(model.altura+2*model.sangria))*25.4);
        if(Number.isFinite(ppi)) detail+=" · "+ppi+" ppi";
      }
    }
    $("#info-"+side).textContent=detail;
  }
  $("#remove-back").hidden=!refs.verso;
  $("#remove-back2").hidden=!refs.verso2;
  $("#view-verso").disabled=!refs.verso;
  $("#view-verso2").disabled=!refs.verso2;
}
function atualizarCampos() {
  const f=model.campos[selecionado];
  $("#campo").value=selecionado;$("#lado").value=f.lado;
  for(const prop of ["x","y","w","h","pt","cor","fonte","alinhar"]) $("#"+prop).value=f[prop];
  $("#negrito").checked=f.negrito;
  $("#geometry").hidden=f.lado==="oculto";
  $("#type-tools").hidden=f.lado==="oculto" || selecionado==="foto";
}
function mudarFace(side) {
  face=side;
  for(const s of botoesLado) $("#view-"+s).setAttribute("aria-pressed",String(s===side));
  agendarPrevia();
}
function estado() {
  $("#model-state").textContent=alterado ? "Alterações por salvar":salvo.revisao ? "Arte instalada":"Aguardando arte";
}
function mudou() {
  limparDownload();
  alterado=true;leitura++;consultando=false;lote=null;
  aviso($("#config-msg"),"");aviso($("#batch-msg"),"");
  estado();resumo();agendarPrevia();
}
// Depois de salva, a arte fica fixa: só muda depois de tocar em "Trocar arte e campos".
const EDITAVEIS=".uploads input,.uploads button,.dimensions input,.field-editor input,.field-editor select,#save-model";
function aplicarTrava() {
  for(const el of document.querySelectorAll(EDITAVEIS)) el.disabled=ocupado||travado;
  $("#unlock-art").hidden=!travado;
  $("#cancel-edit").hidden=travado||!salvo.revisao;
  $("#lock-note").hidden=!travado;
  $("#editor-set").hidden=travado;
  $("#arte-instrucoes").hidden=travado;
  $("#arte-resumo").hidden=!travado;
  if(travado) miniaturas();
}
const urlsMini={};
function miniaturas() {
  for(const side of botoesLado) {
    const art=refs[side]?.art, fig=$("#fig-"+side);
    const imagem=art && art.tipo!=="application/pdf";
    fig.hidden=!imagem;
    if(!imagem)continue;
    if(urlsMini[side]?.art!==art){ if(urlsMini[side])URL.revokeObjectURL(urlsMini[side].url); urlsMini[side]={art,url:URL.createObjectURL(new Blob([art.bytes],{type:art.tipo}))}; }
    $("#mini-"+side).src=urlsMini[side].url;
  }
  $("#fig-verso2").classList.toggle("pendente",!refs.verso2);
  if(!refs.verso2) $("#fig-verso2").hidden=false;
}
function setBusy(value) {
  ocupado=value;
  for(const el of document.querySelectorAll(".side-switch button")) el.disabled=value||(el.id!=="view-frente"&&!refs[el.id.slice(5)]);
  aplicarTrava();if(lote)desenharEscolha();
  for(const id of ["grupo","papel","virada","marks"]) $("#"+id).disabled=value;
  resumo();
}
function exemploIndisponivel(message) {
  $("#proof-canvas").hidden=true;$("#preview-empty").hidden=false;$("#preview-empty").textContent=message;
}
async function renderizarPrevia(token) {
  const actual=refs[face];
  if(!actual) {exemploIndisponivel("Escolha a arte de "+face+" para ver a prévia.");return;}
  const m=structuredClone(model), currentFace=face, chosen=selecionado;
  let doc;
  try {
    conferirModelo(m,Boolean(refs.verso||refs.verso2));
    const bytes=await gerarPdf({ model:m,artes:{[currentFace]:actual},fichas:[exemplo],papel:"individual",prova:true,ladoProva:currentFace,marcasDeCorte:false });
    if(token!==pintura)return;
    pdfjs ||= await import("./vendor/pdfjs/pdf.mjs");
    const base=new URL("./vendor/pdfjs/",import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdf.worker.mjs",base).href;
    doc=await pdfjs.getDocument({ data:bytes, isEvalSupported:false, disableFontFace:true, useWasm:false, useSystemFonts:false,
      standardFontDataUrl:new URL("standard_fonts/",base).href, cMapUrl:new URL("cmaps/",base).href,cMapPacked:true, wasmUrl:new URL("wasm/",base).href,iccUrl:new URL("iccs/",base).href }).promise;
    const page=await doc.getPage(1);
    const viewport=page.getViewport({scale: Math.min(880/page.getViewport({scale:1}).width,1000/page.getViewport({scale:1}).height)});
    const scratch=document.createElement("canvas");scratch.width=Math.ceil(viewport.width);scratch.height=Math.ceil(viewport.height);
    await page.render({canvas:scratch,canvasContext:scratch.getContext("2d"),viewport}).promise;
    if(token!==pintura)return;
    const canvas=$("#proof-canvas");
    canvas.width=scratch.width;canvas.height=scratch.height;
    const ctx=canvas.getContext("2d");ctx.drawImage(scratch,0,0);
    const campo=m.campos[chosen],rX=canvas.width/(m.largura+2*m.sangria),rY=canvas.height/(m.altura+2*m.sangria);
    if(campo.lado===ladoDosCampos(currentFace)) {
      const rect=[(campo.x+m.sangria)*rX,(campo.y+m.sangria)*rY,campo.w*rX,campo.h*rY];
      ctx.lineWidth=3;ctx.strokeStyle="#ffffff";ctx.strokeRect(...rect);
      ctx.lineWidth=2;ctx.strokeStyle="#1564a8";ctx.setLineDash([7,4]);ctx.strokeRect(...rect);
    }
    canvas.hidden=false;$("#preview-empty").hidden=true;
  } catch(error){ if(token===pintura) exemploIndisponivel(error.message || "Não foi possível carregar a prévia."); }
  finally { if(doc) await doc.destroy(); }
}
function agendarPrevia() {
  const token=++pintura;clearTimeout(timer);
  // Enquanto a arte carrega, as coordenadas da imagem anterior não podem ser usadas.
  $("#proof-canvas").setAttribute("aria-busy","true");
  timer=setTimeout(async()=>{try{await renderizarPrevia(token);}finally{if(token===pintura)$("#proof-canvas").setAttribute("aria-busy","false");}},140);
}
function sniff(bytes) {
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return "image/jpeg";
  if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return "image/png";
  if(new TextDecoder().decode(bytes.slice(0,5))==="%PDF-")return "application/pdf";
  throw new Error("Escolha um PDF, PNG ou JPEG válido.");
}
async function selecionarArquivo(side,file) {
  if(!file||ocupado)return;
  setBusy(true);
  try{
    if(file.size>LIMITE_ARTE)throw new Error("O limite é 6 MB por arquivo de arte.");
    const bytes=new Uint8Array(await file.arrayBuffer());
    const art=await lerFundo(bytes,sniff(bytes));
    const page=side!=="frente" && art.paginas===2 ? 2:1;
    refs[side]={ art,pagina:page,chave:null };
    if(side==="frente" && art.paginas===2) refs.verso={art,pagina:2,chave:null};
    atualizarArquivos();mudou();mudarFace(side);
  }catch(error){aviso($("#config-msg"),error.message);}
  finally{$("#file-"+side).value="";setBusy(false);}
}
for(const side of botoesLado){
  $("#file-"+side).addEventListener("change",e=>selecionarArquivo(side,e.target.files?.[0]));
  $("#view-"+side).addEventListener("click",()=>mudarFace(side));
}
$("#remove-back").addEventListener("click",()=>{
  refs.verso=null;atualizarArquivos();mudou();mudarFace("frente");
});
$("#remove-back2").addEventListener("click",()=>{
  refs.verso2=null;atualizarArquivos();mudou();mudarFace("frente");
});
for(const k of ["largura","altura","sangria"]){
  $("#"+k).addEventListener("input",()=>{model[k]=numberInput(k);atualizarArquivos();mudou();});
}
$("#campo").addEventListener("change",e=>{
  selecionado=e.target.value;atualizarCampos();
  const side=model.campos[selecionado].lado;
  if(side==="frente")mudarFace("frente");else if(side==="verso")mudarFace(face==="verso2"&&refs.verso2?"verso2":refs.verso?"verso":"verso2");else agendarPrevia();
});
$("#lado").addEventListener("change",e=>{
  model.campos[selecionado].lado=e.target.value;atualizarCampos();mudou();
  if(e.target.value==="frente")mudarFace("frente");else if(e.target.value==="verso")mudarFace(refs.verso?"verso":"verso2");else agendarPrevia();
});
for(const prop of ["x","y","w","h","pt","cor","fonte","alinhar","negrito"]) {
  const el=$("#"+prop);
  el.addEventListener(["fonte","alinhar","negrito"].includes(prop)?"change":"input",()=>{
    model.campos[selecionado][prop]=prop==="negrito" ? el.checked : ["cor","fonte","alinhar"].includes(prop) ? el.value:numberInput(prop);
    mudou();
  });
}
$("#proof-canvas").addEventListener("click",e=>{
  if(ocupado || travado || e.currentTarget.getAttribute("aria-busy")==="true")return;
  const campo=model.campos[selecionado];
  if(campo.lado!==ladoDosCampos(face) || !Number.isFinite(campo.w) || !Number.isFinite(campo.h))return;
  const bounds=e.currentTarget.getBoundingClientRect();
  const pos=(v,max)=>Number(Math.max(0,Math.min(v,max)).toFixed(2));
  campo.x=pos((e.clientX-bounds.left)/bounds.width*(model.largura+2*model.sangria)-model.sangria-campo.w/2,model.largura-campo.w);
  campo.y=pos((e.clientY-bounds.top)/bounds.height*(model.altura+2*model.sangria)-model.sangria-campo.h/2,model.altura-campo.h);
  atualizarCampos();mudou();
});

async function salvar() {
  if(ocupado)return;
  setBusy(true);
  try {
    if(!refs.frente)throw new Error("Escolha a arte definitiva da frente.");
    conferirModelo(model,Boolean(refs.verso||refs.verso2));
    for(const s of botoesLado) if(refs[s]) conferirProporcao(refs[s].art,refs[s].pagina,model,s);
    aviso($("#config-msg"),"Salvando a arte e as posições…",true);
    const cache=new Map();
    const data={revisao:salvo.revisao,config:model,frente:null,verso:null,verso2:null};
    for(const side of botoesLado) {
      const ref=refs[side];if(!ref)continue;
      if(!ref.chave){
        if(!cache.has(ref.art)){
          const result=await privado(apiBase+"/artes",{method:"POST",headers:{"Content-Type":ref.art.tipo},body:ref.art.bytes});
          cache.set(ref.art,result.chave);
        }
        ref.chave=cache.get(ref.art);
      }
      data[side]={chave:ref.chave,pagina:ref.pagina};
    }
    salvo=await privado(apiBase+"/modelo",{method:"PUT",json:data});
    alterado=false;travado=true;aplicarTrava();estado();aviso($("#config-msg"),"Arte definitiva salva e travada.",true);
    await atualizarLista();
  }catch(error){aviso($("#config-msg"),error.message);}
  finally{setBusy(false);}
}
$("#save-model").addEventListener("click",salvar);
$("#unlock-art").addEventListener("click",()=>{travado=false;aplicarTrava();agendarPrevia();aviso($("#config-msg"),"Ajustes liberados. Salve para fixar a nova arte, ou cancele para manter a atual.",true);});
$("#cancel-edit").addEventListener("click",async()=>{
  if(ocupado)return;
  setBusy(true);
  try{
    model=structuredClone(salvo.config);await carregarArquivos(salvo);
    for(const k of ["largura","altura","sangria"])$("#"+k).value=model[k];
    alterado=false;travado=true;leitura++;
    atualizarArquivos();atualizarCampos();estado();mudarFace("frente");aviso($("#config-msg"),"");
  }catch(error){aviso($("#config-msg"),error.message);}
  finally{setBusy(false);}
  await atualizarLista();
});

const selecionadas=()=>(lote?.prontas||[]).filter(m=>escolhidos.has(m.id));
function desenharEscolha() {
  const prontas=lote?.prontas||[], termo=chaveBusca($("#busca-nome").value);
  $("#escolha").hidden=!prontas.length;
  $("#lista-escolha").replaceChildren(...prontas.filter(m=>!termo||chaveBusca(m.nome).includes(termo)).map(m=>{
    const li=document.createElement("li"), label=document.createElement("label"), box=document.createElement("input"), nome=document.createElement("span"), cargo=document.createElement("small");
    box.type="checkbox";box.checked=escolhidos.has(m.id);box.disabled=ocupado;
    box.addEventListener("change",()=>{if(box.checked)escolhidos.add(m.id);else escolhidos.delete(m.id);limparDownload();resumo();});
    nome.textContent=m.nome;cargo.textContent=m.funcao;
    label.append(box,nome,cargo);li.append(label);return li;
  }));
}
$("#busca-nome").addEventListener("input",desenharEscolha);
$("#marcar-todas").addEventListener("click",()=>{for(const m of lote?.prontas||[])escolhidos.add(m.id);limparDownload();desenharEscolha();resumo();});
$("#desmarcar-todas").addEventListener("click",()=>{escolhidos.clear();limparDownload();desenharEscolha();resumo();});
function atualizarPendencias() {
  for(const m of lote?.prontas||[]) if(!conhecidos.has(m.id)){conhecidos.add(m.id);escolhidos.add(m.id);}
  desenharEscolha();
  const arr=lote?.pendentes||[];
  $("#incomplete").hidden=!arr.length;
  $("#missing-title").textContent="Ver fichas pendentes ("+arr.length+")";
  $("#missing-list").replaceChildren(...arr.map(m=>{
    const li=document.createElement("li");li.textContent=m.nome+" · "+m.protocolo+" · Falta preencher: "+m.faltam.join(", ");return li;
  }));
}
function resumo() {
  const papel=$("#papel").value, single=papel==="individual";
  $("#flip-box").hidden=single||!(salvo.verso||salvo.verso2);$("#marks-wrap").hidden=single;
  $("#refresh-batch").disabled=ocupado||consultando||alterado||!salvo.revisao;
  let liberado=false,qty=selecionadas().length;
  let info="",status="";
  if(alterado)status="Salve as alterações da arte para preparar o lote.";
  else if(!salvo.revisao)status="Salve a arte definitiva para conferir as fichas.";
  else if(consultando)status="Conferindo os cadastros…";
  else if(!lote)status="Atualize a lista de fichas.";
  else {
    const p=lote.pendentes.length;
    const total=lote.prontas.length;
    status=qty+" de "+total+" "+(total===1?"carteirinha pronta selecionada":"carteirinhas prontas selecionadas")+" · "+p+" "+(p===1?"ficha pendente":"fichas pendentes");
    try {
      const l=montarFolha(model,papel), folhas=Math.ceil(qty/l.capacidade), paginas=folhas*(salvo.verso||salvo.verso2?2:1);
      info=single ? "Uma face por página, no tamanho de corte escolhido e com a sangria configurada." : l.capacidade+" carteirinhas por folha "+papel+".";
      if(qty) info+=" O lote terá "+paginas+(paginas===1?" página":" páginas")+" de PDF.";
      liberado=qty>0;
    }catch(error){info=error.message;}
  }
  $("#counts").textContent=status;$("#sheet-info").textContent=info;
  for(const id of ["export-one","export-all"])$("#"+id).disabled=!liberado||ocupado||consultando;
  if(!lote)$("#incomplete").hidden=true;
}
const consultar=()=>privado(apiBase+"/lote",{method:"POST",json:{revisao:salvo.revisao,situacao:$("#grupo").value}});
async function atualizarLista() {
  if(alterado || !salvo.revisao)return;
  limparDownload();
  const token=++leitura;consultando=true;lote=null;resumo();aviso($("#batch-msg"),"");
  try{
    const data=await consultar();if(token!==leitura)return;
    lote=data;atualizarPendencias();
  }catch(error){if(token===leitura)aviso($("#batch-msg"),error.message);}
  finally{if(token===leitura){consultando=false;resumo();}}
}
$("#refresh-batch").addEventListener("click",atualizarLista);
$("#grupo").addEventListener("change",atualizarLista);
for(const id of ["papel","virada","marks"])$("#"+id).addEventListener("change",()=>{limparDownload();resumo();});
function assinatura(data) {
  return data.prontas.map(m=>m.id+"."+m.revisao).join("|");
}
function limparDownload() {
  if(arquivoGerado) URL.revokeObjectURL(arquivoGerado);
  arquivoGerado="";
  const link=$("#download-ready");
  link.hidden=true;
  link.removeAttribute("href");
}
function entregarPdf(bytes,nome) {
  limparDownload();
  arquivoGerado=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
  const link=$("#download-ready");
  link.href=arquivoGerado;
  link.download=nome;
  link.hidden=false;
  link.click();
}
async function exportar(uma) {
  if(!lote||alterado||ocupado||consultando)return;
  limparDownload();setBusy(true);
  try{
    const fresh=await consultar(), mudouLista=assinatura(lote)!==assinatura(fresh);
    lote=fresh;atualizarPendencias();resumo();
    if(mudouLista)throw new Error("As fichas mudaram. Confira a nova contagem e exporte novamente.");
    const fichas=uma?selecionadas().slice(0,1):selecionadas();
    if(!fichas.length)throw new Error("Marque pelo menos um nome para imprimir.");
    const papel=uma?"individual":$("#papel").value;
    aviso($("#batch-msg"),"Preparando o PDF…",true);
    const bytes=await gerarPdf({
      model:salvo.config,artes:refs,fichas,papel,virada:$("#virada").value,marcasDeCorte:$("#marks").checked,
      getFoto:async m=>{
        const r=await privado("/api/secretaria/membros/"+m.id+"/foto",{raw:true,headers:{"X-Revisao":String(m.revisao)}});
        if(!r.headers.get("Content-Type")?.includes("image/jpeg"))throw new Error("Não foi possível abrir a foto de "+m.nome+".");
        return new Uint8Array(await r.arrayBuffer());
      },
      onProgress:(n,total)=>{if(n===1||n%5===0||n===total) aviso($("#batch-msg"),"Montando "+n+" de "+total+" carteirinhas…",true);}
    });
    const data=new Date().toISOString().slice(0,10);
    entregarPdf(bytes,(uma?"prova-carteirinha":"carteirinhas-"+papel)+"-MISRREV-"+data+".pdf");
    aviso($("#batch-msg"),uma?"Prova de "+fichas[0].nome+" gerada.":"PDF gerado com "+fichas.length+(fichas.length===1?" carteirinha.":" carteirinhas."),true);
  }catch(error){aviso($("#batch-msg"),error.message);}
  finally{setBusy(false);}
}
$("#export-all").addEventListener("click",()=>exportar(false));$("#export-one").addEventListener("click",()=>exportar(true));
window.addEventListener("pagehide",limparDownload);
window.addEventListener("beforeunload",e=>{if(alterado){e.preventDefault();e.returnValue="";}});
window.addEventListener("pageshow",e=>{if(e.persisted)location.reload();});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!$("#studio").hidden)privado("/api/secretaria/sessao").catch(()=>{});});

async function inicio() {
  try{
    salvo=await privado(apiBase+"/modelo");model=structuredClone(salvo.config);travado=salvo.revisao>0;
    await carregarArquivos(salvo);
    for(const k of ["largura","altura","sangria"])$("#"+k).value=model[k];
    atualizarArquivos();atualizarCampos();estado();resumo();aplicarTrava();
    $("#studio").hidden=false;$("#loading").hidden=true;
    agendarPrevia();if(salvo.revisao)await atualizarLista();
  }catch(error){encerrarTela(error.message);}
}
inicio();

