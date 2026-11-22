import { PDFDocument, StandardFonts, degrees, rgb, grayscale, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from "./vendor/pdf-lib.js";
import { CAMPOS_CARTAO, conferirModelo } from "./modelo.js";
import { mostrarTelefone } from "../dados.js";

const PT = 72 / 25.4;
const PAPEL = { A4:[210,297], A3:[297,420], SRA3:[320,450] };
const mm = value => value * PT;
const faceLabel = side => side === "frente" ? "frente" : "verso";

export function montarFolha(model, papel = "A4") {
  const w=model.largura+2*model.sangria, h=model.altura+2*model.sangria;
  if (papel === "individual") return { w,h,cartaoW:w,cartaoH:h,cols:1,linhas:1,capacidade:1,x:0,top:0,gap:0,individual:true };
  if (!PAPEL[papel]) throw new Error("Escolha um formato de folha.");
  const [sw,sh]=PAPEL[papel], margem=5, gap=4;
  const cols=Math.floor((sw-2*margem+gap+1e-7)/(w+gap));
  const linhas=Math.floor((sh-2*margem+gap+1e-7)/(h+gap));
  if (!cols || !linhas) throw new Error("Esta carteirinha não cabe no papel selecionado.");
  return { w:sw,h:sh,cartaoW:w,cartaoH:h,cols,linhas,capacidade:cols*linhas,
    x:(sw-cols*w-(cols-1)*gap)/2,top:(sh-linhas*h-(linhas-1)*gap)/2,gap,individual:false };
}

// Posição da área com sangria, em mm e com origem no canto inferior esquerdo da folha.
export function posicaoNaFolha(layout,index,side = "frente",virada = "longa") {
  let coluna=index%layout.cols, linha=Math.floor(index/layout.cols);
  if (side === "verso" && virada === "longa") coluna=layout.cols-1-coluna;
  if (side === "verso" && virada === "curta") linha=layout.linhas-1-linha;
  return { x:layout.x+coluna*(layout.cartaoW+layout.gap), y:layout.h-layout.top-layout.cartaoH-linha*(layout.cartaoH+layout.gap) };
}

function pdfBox(page,sangria) {
  const box = sangria ? page.getBleedBox() : page.getTrimBox();
  const rot=((page.getRotation().angle%360)+360)%360;
  if (![0,90,180,270].includes(rot) || box.width<=0 || box.height<=0) throw new Error("A página da arte tem dimensões ou rotação inválidas.");
  return { box,rot, largura:rot%180 ? box.height:box.width, altura:rot%180 ? box.width:box.height };
}

export async function lerFundo(bytes,tipo) {
  if (tipo === "application/pdf") {
    let source;
    try { source=await PDFDocument.load(bytes,{ updateMetadata:false }); }
    catch { throw new Error("Não foi possível abrir o PDF. Exporte a arte em um PDF sem senha."); }
    if (source.getPageCount()<1 || source.getPageCount()>2) throw new Error("Use um PDF com uma página por lado, com até duas páginas.");
    return { tipo,bytes,source,paginas:source.getPageCount() };
  }
  const temp=await PDFDocument.create();
  let model;
  try { model=tipo==="image/png" ? await temp.embedPng(bytes) : await temp.embedJpg(bytes); }
  catch { throw new Error("Não foi possível ler a imagem. Escolha um PNG ou JPEG válido."); }
  return { tipo,bytes,largura:model.width,altura:model.height,paginas:1 };
}

export function dimensoesFundo(art,pagina,sangria) {
  if (!art.source) return { largura:art.largura, altura:art.altura, unidade:"px" };
  const p=art.source.getPage(pagina-1);
  const box=pdfBox(p,sangria);
  return { largura:box.largura/PT, altura:box.altura/PT, unidade:"mm" };
}

export function conferirProporcao(art,pagina,model,side) {
  const d=dimensoesFundo(art,pagina,model.sangria);
  const expected=(model.largura+2*model.sangria)/(model.altura+2*model.sangria);
  if (Math.abs(d.largura/d.altura/expected-1)>.018) {
    const f=n=>Number(n.toFixed(2)).toLocaleString("pt-BR");
    throw new Error("A arte de "+faceLabel(side)+" mede "+f(d.largura)+" × "+f(d.altura)+" "+d.unidade+". Ajuste o tamanho de corte ou a sangria para corresponder à proporção do arquivo.");
  }
  return d;
}

async function embutirFundo(doc,ref,model,side) {
  const { art,pagina }=ref;
  conferirProporcao(art,pagina,model,side);
  if (!art.source) {
    const item=art.tipo==="image/png" ? await doc.embedPng(art.bytes) : await doc.embedJpg(art.bytes);
    return { item,rot:0,isPdf:false };
  }
  const page=art.source.getPage(pagina-1);
  const { box,rot }=pdfBox(page,model.sangria);
  // Uma página branca continua sendo uma arte válida para receber dados.
  if (!page.node.Contents()) return { vazia:true };
  const item=await doc.embedPage(page,{left:box.x,bottom:box.y,right:box.x+box.width,top:box.y+box.height});
  return { item,rot,isPdf:true };
}

function recortar(page,x,y,w,h) {
  page.pushOperators(pushGraphicsState(),rectangle(x,y,w,h),clip(),endPath());
}
function desenharFundo(page,bg,x,y,w,h) {
  if (bg.vazia) return;
  const { item,rot }=bg, lar=rot%180?item.height:item.width, alt=rot%180?item.width:item.height;
  const scale=Math.max(w/lar,h/alt), iw=item.width*scale, ih=item.height*scale;
  let dx=x+(w-lar*scale)/2, dy=y+(h-alt*scale)/2;
  if(rot===90) dy+=iw;
  if(rot===180){dx+=iw;dy+=ih;}
  if(rot===270) dx+=ih;
  recortar(page,x,y,w,h);
  const opts={x:dx,y:dy,width:iw,height:ih,rotate:degrees(-rot)};
  if(bg.isPdf) page.drawPage(item,opts); else page.drawImage(item,opts);
  page.pushOperators(popGraphicsState());
}
function corPdf(hex) {
  const [r,g,b]=hex.slice(1).match(/../g).map(pair=>parseInt(pair,16)/255);
  return r===g && g===b ? grayscale(r):rgb(r,g,b);
}
function quebrar(text,largura,medir) {
  const result=[];
  let line="";
  for (const word of text.split(/\s+/u)) {
    const next=line ? line+" "+word:word;
    if (medir(next)<=largura) { line=next; continue; }
    if(line) {result.push(line);line="";}
    for (const char of Array.from(word)) {
      if (line && medir(line+char)>largura) {result.push(line);line="";}
      line+=char;
    }
  }
  if(line) result.push(line);
  return result;
}
function ajustarTexto(text,field,measure) {
  const maxW=mm(field.w), maxH=mm(field.h);
  for(let size=field.pt;size>=3.99;size=Math.max(3.75,size-.25)) {
    const lines=quebrar(text,maxW,s=>measure(s,size));
    const advance=size*1.12;
    if (lines.length && size+(lines.length-1)*advance<=maxH+.01 && lines.every(s=>measure(s,size)<=maxW+.01)) return { size,lines,advance };
  }
  return null;
}
function deslocamento(align,width,measured) {
  return align==="direita" ? width-measured : align==="centro" ? (width-measured)/2:0;
}
function fonteId(f) { return f.fonte+(f.negrito?"B":"R"); }

async function textoEmImagem(doc,page,text,field,x,top) {
  // Para caracteres fora de WinAnsi, o navegador usa as fontes do sistema em 600 dpi.
  if (typeof document==="undefined") throw new Error("Este nome requer a composição no navegador.");
  const scale=600/72;
  const canvas=document.createElement("canvas");
  canvas.width=Math.ceil(mm(field.w)*scale);canvas.height=Math.ceil(mm(field.h)*scale);
  const ctx=canvas.getContext("2d");
  ctx.scale(scale,scale);
  const setFont=size=>{ctx.font=(field.negrito?"bold ":"")+size+"px "+(field.fonte==="serif"?"Georgia, serif":"Arial, sans-serif");};
  const measure=(s,size)=>{setFont(size);return ctx.measureText(s).width;};
  const fit=ajustarTexto(text,field,measure);
  if(!fit) return false;
  setFont(fit.size);ctx.fillStyle=field.cor;ctx.textBaseline="top";
  fit.lines.forEach((line,i)=>ctx.fillText(line,deslocamento(field.alinhar,mm(field.w),measure(line,fit.size)),i*fit.advance));
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  if(!blob) throw new Error("Não foi possível compor os caracteres desta ficha.");
  const img=await doc.embedPng(await blob.arrayBuffer());
  page.drawImage(img,{x,y:top-mm(field.h),width:mm(field.w),height:mm(field.h)});
  return true;
}
async function escrever(doc,page,fonts,key,field,text,x,top,nome) {
  const font=fonts[fonteId(field)];
  let supported=true;
  try {font.encodeText(text);} catch {supported=false;}
  const fail=()=>new Error("A caixa de "+CAMPOS_CARTAO[key]+" é pequena para “"+nome+"”. Aumente a largura ou a altura do campo no modelo.");
  if(!supported) {
    if(!(await textoEmImagem(doc,page,text,field,x,top))) throw fail();
    return;
  }
  const measure=(s,size)=>font.widthOfTextAtSize(s,size);
  const fit=ajustarTexto(text,field,measure);
  if(!fit) throw fail();
  const ascent=font.heightAtSize(fit.size,{descender:false});
  for(const [i,line] of fit.lines.entries()) {
    const dx=deslocamento(field.alinhar,mm(field.w),measure(line,fit.size));
    page.drawText(line,{x:x+dx,y:top-ascent-i*fit.advance,size:fit.size,font,color:corPdf(field.cor)});
  }
}
function dadosFoto(page,image,field,x,top,font,prova) {
  const w=mm(field.w), h=mm(field.h), y=top-h;
  if(prova) {
    page.drawRectangle({x,y,width:w,height:h,color:rgb(.89,.92,.94),borderColor:rgb(.50,.60,.66),borderWidth:.35});
    const size=Math.min(9,w/3.2,h*.45), label="FOTO";
    page.drawText(label,{x:x+(w-font.widthOfTextAtSize(label,size))/2,y:y+h/2-size*.34,size,font,color:rgb(.25,.33,.4)});
    return;
  }
  if(!image) throw new Error("Falta a foto de uma das fichas do lote.");
  const scale=Math.max(w/image.width,h/image.height);
  const iw=image.width*scale,ih=image.height*scale;
  recortar(page,x,y,w,h);
  page.drawImage(image,{x:x+(w-iw)/2,y:y+(h-ih)/2,width:iw,height:ih});
  page.pushOperators(popGraphicsState());
}

function marcas(page,model,x,y) {
  const b=mm(model.sangria), w=mm(model.largura+2*model.sangria), h=mm(model.altura+2*model.sangria);
  const line=(x1,y1,x2,y2)=>page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},color:grayscale(0),thickness:.25});
  for(const xx of [x+b,x+w-b]) {line(xx,y-mm(1.85),xx,y-mm(.25));line(xx,y+h+mm(.25),xx,y+h+mm(1.85));}
  for(const yy of [y+b,y+h-b]) {line(x-mm(1.85),yy,x-mm(.25),yy);line(x+w+mm(.25),yy,x+w+mm(1.85),yy);}
}

export async function gerarPdf({model,artes,fichas,papel="A4",virada="longa",marcasDeCorte=true,getFoto,onProgress,prova=false,ladoProva="frente",signal}) {
  if(!fichas?.length) throw new Error("Nenhuma carteirinha disponível para este PDF.");
  if(!prova) conferirModelo(model,Boolean(artes.verso));
  const layout=montarFolha(model,papel);
  const doc=await PDFDocument.create();
  doc.setTitle(prova?"Prova de posição • MISRREV":"Carteirinhas de membros • MISRREV");
  doc.setCreator("Secretaria MISRREV");
  const fonts={};
  for(const [id,face] of Object.entries({sansR:StandardFonts.Helvetica,sansB:StandardFonts.HelveticaBold,serifR:StandardFonts.TimesRoman,serifB:StandardFonts.TimesRomanBold})) fonts[id]=await doc.embedFont(face);
  const lados=prova ? [ladoProva] : artes.verso ? ["frente","verso"]:["frente"];
  const fundos={};
  for(const side of lados){
    if(!artes[side]) throw new Error("Adicione a arte de "+faceLabel(side)+".");
    fundos[side]=await embutirFundo(doc,artes[side],model,side);
  }
  let done=0;
  for(let start=0; start<fichas.length; start+=layout.capacidade) {
    const grupo=fichas.slice(start,start+layout.capacidade);
    const pages={};
    for(const side of lados) {
      const page=doc.addPage([mm(layout.w),mm(layout.h)]);
      if(layout.individual) {
        page.setBleedBox(0,0,mm(layout.w),mm(layout.h));
        page.setTrimBox(mm(model.sangria),mm(model.sangria),mm(model.largura),mm(model.altura));
      }
      pages[side]=page;
    }
    for(const [i,ficha] of grupo.entries()) {
      signal?.throwIfAborted();
      let image;
      if(!prova && model.campos.foto.lado!=="oculto") image=await doc.embedJpg(await getFoto(ficha));
      for(const side of lados) {
        const page=pages[side], pos=posicaoNaFolha(layout,i,side,virada);
        const x=mm(pos.x), y=mm(pos.y), left=x+mm(model.sangria), top=y+mm(model.altura+model.sangria);
        desenharFundo(page,fundos[side],x,y,mm(layout.cartaoW),mm(layout.cartaoH));
        const photo=model.campos.foto;
        if(photo.lado===side) dadosFoto(page,image,photo,left+mm(photo.x),top-mm(photo.y),fonts.sansR,prova);
        for(const [key,c] of Object.entries(model.campos)) {
          if(key==="foto" || c.lado!==side || !Object.hasOwn(CAMPOS_CARTAO,key)) continue;
          const texto=key==="telefone" ? mostrarTelefone(ficha.telefone) : String(ficha[key]??"");
          await escrever(doc,page,fonts,key,c,texto,left+mm(c.x),top-mm(c.y),ficha.nome);
        }
        if(marcasDeCorte && !layout.individual) marcas(page,model,x,y);
      }
      onProgress?.(++done,fichas.length);
      if(!prova && done%12===0) await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  signal?.throwIfAborted();
  return doc.save();
}

