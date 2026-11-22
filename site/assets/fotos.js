import { $, api, aviso, prepararFoto } from "./comum.js";
import { chaveBusca } from "./dados.js";

// Tela de fotos: várias fotos de uma vez, cada uma ligada a um membro pelo nome.
let membros = [];
let itens = [];
let ocupado = false;
let seq = 0;

async function privado(path, options) {
  try { return await api(path, options); }
  catch (error) {
    if (error.status === 401) location.replace("/secretaria/?abrir=fotos");
    throw error;
  }
}

// Rótulo único por membro: nome e cargo; se houver nomes repetidos, inclui o protocolo.
function rotulo(m) {
  const base = m.nome + " · " + m.funcao;
  return membros.filter(x => x.nome === m.nome && x.funcao === m.funcao).length > 1 ? base + " · " + m.protocolo : base;
}
const porRotulo = texto => membros.find(m => rotulo(m) === texto);
const porId = id => membros.find(m => m.id === id);

// Tenta reconhecer o membro pelo nome do arquivo (ex.: "Maria Aparecida (2).jpg").
function reconhecer(arquivo) {
  const chave = chaveBusca(arquivo.replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.()]+/g, " ").replace(/\d+/g, " ")).replace(/\s+/g, " ").trim();
  if (chave.length < 3) return null;
  const exatos = membros.filter(m => chaveBusca(m.nome) === chave);
  if (exatos.length === 1) return exatos[0];
  const partes = chave.split(" ");
  const contem = membros.filter(m => { const nome = chaveBusca(m.nome).split(" "); return partes.every(p => nome.includes(p)); });
  return contem.length === 1 ? contem[0] : null;
}

async function carregarMembros() {
  membros = (await privado("/api/secretaria/nomes")).membros;
  const lista = $("#nomes-membros");
  lista.replaceChildren(...membros.map(m => { const o = document.createElement("option"); o.value = rotulo(m); return o; }));
  const semFoto = membros.filter(m => !m.tem_foto);
  $("#sem-foto-resumo").textContent = membros.length ? semFoto.length + " de " + membros.length + " sem foto" : "Nenhum cadastro ainda";
  $("#sem-foto").replaceChildren(...semFoto.map(m => { const li = document.createElement("li"); li.textContent = m.nome; const s = document.createElement("small"); s.textContent = m.funcao; li.append(s); return li; }));
  $("#sem-foto-vazio").hidden = !!semFoto.length || !membros.length;
}

function situacao(item) {
  if (item.feito) return ["ok", "Foto salva no cadastro."];
  if (item.erro) return ["erro", item.erro];
  const m = porId(item.membro);
  if (!m) return ["erro", "Escolha de quem é esta foto."];
  if (itens.some(o => o !== item && !o.feito && o.membro === item.membro)) return ["erro", "Esta pessoa já está em outra foto da lista."];
  return m.tem_foto ? ["aviso", "Já tem foto: esta vai substituir a atual."] : ["ok", "Pronta para salvar."];
}

function desenhar() {
  const ul = $("#fotos-lista");
  ul.replaceChildren(...itens.map(item => {
    const li = document.createElement("li");
    li.className = "foto-item" + (item.feito ? " feito" : "");
    const img = document.createElement("img");
    img.src = item.url; img.alt = ""; img.width = 72; img.height = 96;
    const corpo = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = "De quem é esta foto?";
    label.htmlFor = "foto-" + item.id;
    const input = document.createElement("input");
    input.id = "foto-" + item.id;
    input.setAttribute("list", "nomes-membros");
    input.placeholder = "Digite o nome";
    input.autocomplete = "off";
    input.value = porId(item.membro) ? rotulo(porId(item.membro)) : "";
    input.disabled = item.feito || ocupado;
    input.addEventListener("change", () => { item.membro = porRotulo(input.value)?.id || null; item.erro = ""; desenhar(); });
    const arquivo = document.createElement("small");
    arquivo.className = "foto-arquivo";
    arquivo.textContent = item.arquivo.name;
    const [tipo, texto] = situacao(item);
    const status = document.createElement("small");
    status.className = "foto-status " + tipo;
    status.textContent = texto;
    corpo.append(label, input, arquivo, status);
    const remover = document.createElement("button");
    remover.type = "button"; remover.className = "plain-small"; remover.textContent = item.feito ? "Limpar" : "Remover";
    remover.disabled = ocupado;
    remover.addEventListener("click", () => { URL.revokeObjectURL(item.url); itens = itens.filter(o => o !== item); desenhar(); });
    li.append(img, corpo, remover);
    return li;
  }));
  const prontos = itens.filter(i => !i.feito && situacao(i)[0] !== "erro");
  $("#salvar-fotos").disabled = ocupado || !prontos.length;
  $("#salvar-fotos").lastChild.textContent = prontos.length > 1 ? "Salvar " + prontos.length + " fotos" : "Salvar foto";
  $("#fotos-input").disabled = ocupado;
}

$("#fotos-input").addEventListener("change", e => {
  const novos = [...(e.target.files || [])].map(arquivo => {
    const membro = reconhecer(arquivo.name);
    return { id: ++seq, arquivo, url: URL.createObjectURL(arquivo), membro: membro?.id || null, feito: false, erro: "" };
  });
  e.target.value = "";
  itens.push(...novos);
  const achados = novos.filter(i => i.membro).length;
  aviso($("#fotos-msg"), novos.length + (novos.length === 1 ? " foto adicionada" : " fotos adicionadas") + (achados ? "; " + achados + " reconhecida" + (achados === 1 ? "" : "s") + " pelo nome do arquivo." : ". Escolha o nome de cada uma."), true);
  desenhar();
});

$("#salvar-fotos").addEventListener("click", async () => {
  if (ocupado) return;
  ocupado = true; desenhar();
  let salvas = 0;
  const fila = itens.filter(i => !i.feito && situacao(i)[0] !== "erro");
  try {
    for (const [n, item] of fila.entries()) {
      aviso($("#fotos-msg"), "Salvando " + (n + 1) + " de " + fila.length + "…", true);
      try {
        const m = porId(item.membro);
        const blob = await prepararFoto(item.arquivo);
        const salvo = await privado("/api/secretaria/membros/" + m.id + "/foto", { method: "PUT", headers: { "Content-Type": "image/jpeg", "X-Revisao": String(m.revisao) }, body: blob });
        Object.assign(m, { revisao: salvo.revisao, tem_foto: 1 });
        item.feito = true; salvas++;
      } catch (error) {
        if (error.status === 401) throw error;
        item.erro = error.message;
      }
    }
    const falhas = fila.length - salvas;
    aviso($("#fotos-msg"), salvas + (salvas === 1 ? " foto salva" : " fotos salvas") + (falhas ? ". " + falhas + " não foi possível salvar; veja o aviso em cada uma." : "."), !falhas);
    await carregarMembros();
  } catch (error) { aviso($("#fotos-msg"), error.message); }
  finally { ocupado = false; desenhar(); }
});

window.addEventListener("beforeunload", e => { if (itens.some(i => !i.feito)) { e.preventDefault(); e.returnValue = ""; } });

(async () => {
  try {
    await carregarMembros();
    $("#fotos-app").hidden = false; $("#loading").hidden = true;
    desenhar();
  } catch (error) { aviso($("#loading"), error.message); }
})();
