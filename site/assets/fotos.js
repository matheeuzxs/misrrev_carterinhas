import { $, api, aviso, prepararFoto } from "./comum.js";
import { chaveBusca } from "./dados.js";

// Banco de fotos: as fotos ficam guardadas no site até alguém escolher de quem é cada uma.
// "Enviar para a carteirinha" move a foto do banco para a ficha do membro.
let membros = [];
let banco = [];
let ocupado = false;
const escolhaPorFoto = new Map();

async function privado(path, options) {
  try { return await api(path, options); }
  catch (error) {
    if (error.status === 401) location.replace("/secretaria/?abrir=fotos");
    throw error;
  }
}

// Rótulo único por membro: nome e cargo; com nomes repetidos, inclui o protocolo.
function rotulo(m) {
  const base = m.nome + " · " + m.funcao;
  return membros.filter(x => x.nome === m.nome && x.funcao === m.funcao).length > 1 ? base + " · " + m.protocolo : base;
}
const porRotulo = texto => membros.find(m => rotulo(m) === texto);
const porId = id => membros.find(m => m.id === id);
const urlFoto = id => "/api/secretaria/fotos/" + id;

// Sugere o membro pelo nome do arquivo (ex.: "Maria Aparecida (2).jpg"), se só um nome combinar.
function sugerir(arquivo) {
  const chave = chaveBusca(arquivo.replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.()]+/g, " ").replace(/\d+/g, " ")).replace(/\s+/g, " ").trim();
  if (chave.length < 3) return null;
  const exatos = membros.filter(m => chaveBusca(m.nome) === chave);
  if (exatos.length === 1) return exatos[0];
  const partes = chave.split(" ");
  const contem = membros.filter(m => { const nome = chaveBusca(m.nome).split(" "); return partes.every(p => nome.includes(p)); });
  return contem.length === 1 ? contem[0] : null;
}

async function carregar() {
  const [n, f] = await Promise.all([privado("/api/secretaria/nomes"), privado("/api/secretaria/fotos")]);
  membros = n.membros;
  banco = f.fotos;
  for (const id of [...escolhaPorFoto.keys()]) if (!banco.some(b => b.id === id)) escolhaPorFoto.delete(id);
  $("#nomes-membros").replaceChildren(...membros.map(m => { const o = document.createElement("option"); o.value = rotulo(m); return o; }));
  desenharBanco();
  desenharSemFoto();
}

function desenharBanco() {
  $("#banco-resumo").textContent = banco.length === 1 ? "1 foto guardada" : banco.length + " fotos guardadas";
  $("#banco-vazio").hidden = banco.length > 0;
  $("#banco").replaceChildren(...banco.map(foto => {
    const li = document.createElement("li");
    li.className = "banco-item";
    const img = document.createElement("img");
    img.src = urlFoto(foto.id); img.alt = ""; img.loading = "lazy"; img.width = 150; img.height = 200;
    const nome = document.createElement("small");
    nome.className = "foto-arquivo"; nome.textContent = foto.nome_arquivo;
    const label = document.createElement("label");
    label.htmlFor = "dono-" + foto.id; label.textContent = "De quem é?";
    const input = document.createElement("input");
    input.id = "dono-" + foto.id; input.setAttribute("list", "nomes-membros"); input.placeholder = "Digite o nome"; input.autocomplete = "off";
    if (!escolhaPorFoto.has(foto.id)) escolhaPorFoto.set(foto.id, sugerir(foto.nome_arquivo)?.id || null);
    const escolhido = porId(escolhaPorFoto.get(foto.id));
    input.value = escolhido ? rotulo(escolhido) : "";
    input.disabled = ocupado;
    const status = document.createElement("small");
    status.className = "foto-status";
    const enviar = document.createElement("button");
    enviar.type = "button"; enviar.className = "btn secondary btn-small"; enviar.textContent = "Enviar para a carteirinha";
    const atualizarStatus = () => {
      const m = porId(escolhaPorFoto.get(foto.id));
      status.className = "foto-status " + (!m ? "" : m.tem_foto ? "aviso" : "ok");
      status.textContent = !m ? "" : m.tem_foto ? "Já tem foto: esta vai substituir." : "Sem foto ainda.";
      enviar.disabled = ocupado || !m;
    };
    input.addEventListener("change", () => { escolhaPorFoto.set(foto.id, porRotulo(input.value)?.id || null); atualizarStatus(); });
    enviar.addEventListener("click", () => usar(foto, porId(escolhaPorFoto.get(foto.id))));
    const apagar = document.createElement("button");
    apagar.type = "button"; apagar.className = "plain-small"; apagar.textContent = "Apagar do banco"; apagar.disabled = ocupado;
    apagar.addEventListener("click", () => apagarFoto(foto));
    atualizarStatus();
    li.append(img, nome, label, input, status, enviar, apagar);
    return li;
  }));
}

function desenharSemFoto() {
  const semFoto = membros.filter(m => !m.tem_foto);
  $("#sem-foto-resumo").textContent = membros.length ? semFoto.length + " de " + membros.length : "Nenhum cadastro ainda";
  $("#sem-foto-vazio").hidden = !!semFoto.length || !membros.length;
  $("#sem-foto").replaceChildren(...semFoto.map(m => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button"; b.disabled = ocupado;
    const nome = document.createElement("span"); nome.textContent = m.nome;
    const cargo = document.createElement("small"); cargo.textContent = m.funcao + " · escolher foto";
    b.append(nome, cargo);
    b.addEventListener("click", () => abrirEscolha(m));
    li.append(b);
    return li;
  }));
}

function abrirEscolha(m) {
  $("#escolher-titulo").textContent = "Foto de " + m.nome;
  $("#escolher-vazio").hidden = banco.length > 0;
  const sugerida = banco.find(f => sugerir(f.nome_arquivo)?.id === m.id);
  const ordem = sugerida ? [sugerida, ...banco.filter(f => f !== sugerida)] : banco;
  $("#escolher-grade").replaceChildren(...ordem.map(foto => {
    const li = document.createElement("li");
    li.className = "banco-item";
    const b = document.createElement("button");
    b.type = "button"; b.className = "escolher-opcao";
    const img = document.createElement("img");
    img.src = urlFoto(foto.id); img.alt = "Usar a foto " + foto.nome_arquivo; img.loading = "lazy"; img.width = 150; img.height = 200;
    const nome = document.createElement("small"); nome.className = "foto-arquivo"; nome.textContent = (foto === sugerida ? "Sugerida · " : "") + foto.nome_arquivo;
    b.append(img, nome);
    b.addEventListener("click", async () => { $("#escolher-foto").close(); await usar(foto, m); });
    li.append(b);
    return li;
  }));
  $("#escolher-foto").showModal();
}

async function usar(foto, m) {
  if (ocupado || !m) return;
  if (m.tem_foto && !confirm(m.nome + " já tem foto. Trocar pela foto do banco?")) return;
  ocupado = true; desenharBanco(); desenharSemFoto();
  try {
    await privado(urlFoto(foto.id) + "/usar", { method: "POST", json: { membro: m.id, revisao: m.revisao } });
    escolhaPorFoto.delete(foto.id);
    aviso($("#fotos-msg"), "Foto enviada para a carteirinha de " + m.nome + ".", true);
  } catch (error) { aviso($("#fotos-msg"), error.message); }
  finally { ocupado = false; await carregar().catch(e => aviso($("#fotos-msg"), e.message)); }
}

async function apagarFoto(foto) {
  if (ocupado || !confirm("Apagar a foto " + foto.nome_arquivo + " do banco?")) return;
  ocupado = true; desenharBanco();
  try { await privado(urlFoto(foto.id), { method: "DELETE" }); aviso($("#fotos-msg"), "Foto apagada do banco.", true); }
  catch (error) { aviso($("#fotos-msg"), error.message); }
  finally { ocupado = false; await carregar().catch(e => aviso($("#fotos-msg"), e.message)); }
}

$("#fotos-input").addEventListener("change", async e => {
  const arquivos = [...(e.target.files || [])];
  e.target.value = "";
  if (!arquivos.length || ocupado) return;
  ocupado = true; $("#fotos-input").disabled = true; desenharBanco(); desenharSemFoto();
  let enviadas = 0; const falhas = [];
  try {
    for (const [n, arquivo] of arquivos.entries()) {
      aviso($("#fotos-msg"), "Guardando " + (n + 1) + " de " + arquivos.length + "…", true);
      try {
        const blob = await prepararFoto(arquivo);
        await privado("/api/secretaria/fotos", { method: "POST", headers: { "Content-Type": "image/jpeg", "X-Nome-Arquivo": encodeURIComponent(arquivo.name) }, body: blob });
        enviadas++;
      } catch (error) {
        if (error.status === 401) throw error;
        falhas.push(arquivo.name + ": " + error.message);
      }
    }
    aviso($("#fotos-msg"), (enviadas === 1 ? "1 foto guardada no banco." : enviadas + " fotos guardadas no banco.") + (falhas.length ? " Não foi possível guardar: " + falhas.join(" · ") : ""), !falhas.length);
  } catch (error) { aviso($("#fotos-msg"), error.message); }
  finally { ocupado = false; $("#fotos-input").disabled = false; await carregar().catch(e => aviso($("#fotos-msg"), e.message)); }
});

(async () => {
  try {
    await carregar();
    $("#fotos-app").hidden = false; $("#loading").hidden = true;
  } catch (error) { aviso($("#loading"), error.message); }
})();
