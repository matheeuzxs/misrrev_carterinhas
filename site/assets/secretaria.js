import { $, api, aviso, linkArquivo } from "./comum.js";
import { limparTexto, mostrarTelefone, SITUACOES, validarDados } from "./dados.js";

const base = "/api/secretaria";
const login = $("#login-view");
const dashboard = $("#dashboard");
const dialog = $("#record-dialog");
const list = $("#member-list");
const recordForm = $("#record-form");
let active = false;
let current = null;
let photoUrl = "";
let page = 1;
let applied = { busca: "", situacao: "" };
let listRequest = 0;
let detailRequest = 0;
let busy = false;

function shortDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}
function resetPhoto() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = "";
  $("#portrait").removeAttribute("src");
  $("#portrait").hidden = true;
}
function clearRecord() {
  detailRequest++;
  resetPhoto();
  current = null;
  recordForm.reset();
  $("#record-title").textContent = "";
  $("#record-protocol").textContent = "";
  $("#delete-name").textContent = "";
  $("#photo-input").value = "";
  $("#delete-confirm").hidden = true;
  [$("#record-msg"), $("#photo-msg"), $("#delete-error")].forEach(el => aviso(el, ""));
}
function signOutView(message = "") {
  active = false;
  listRequest++;
  if (dialog.open) dialog.close();
  clearRecord();
  list.replaceChildren();
  $("#number-results").textContent = "";
  $("#filters").reset();
  applied = { busca: "", situacao: "" };
  page = 1;
  dashboard.hidden = true;
  $("#logout").hidden = true;
  login.hidden = false;
  $("#senha").value = "";
  $("#senha").type = "password";
  $("#show-password").setAttribute("aria-pressed", "false");
  $("#show-password").setAttribute("aria-label", "Mostrar senha");
  aviso($("#login-msg"), message);
}
async function staff(path, options) {
  try { return await api(base + path, options); }
  catch (error) {
    if (error.status === 401 && active) {
      signOutView(error.message);
      $("#senha").focus();
    }
    throw error;
  }
}
function rowCard(m) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "member-row";
  button.setAttribute("aria-label", "Abrir ficha de " + m.nome);
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  const parts = m.nome.split(" ");
  avatar.textContent = (parts[0].slice(0,1) + (parts.length > 1 ? parts.at(-1).slice(0,1) : "")).toLocaleUpperCase("pt-BR");
  const text = document.createElement("span");
  text.className = "row-text";
  const name = document.createElement("b");
  name.textContent = m.nome;
  const small = document.createElement("small");
  small.textContent = (m.matricula ? "Matrícula " + m.matricula : m.protocolo) + " · " + shortDate(m.recebido_em);
  text.append(name, small);
  const state = document.createElement("span");
  state.className = "status-tag " + m.situacao;
  state.textContent = SITUACOES[m.situacao];
  const arrow = document.createElement("span");
  arrow.className = "row-arrow";
  arrow.setAttribute("aria-hidden","true");
  arrow.textContent = "›";
  button.append(avatar, text, state, arrow);
  button.addEventListener("click", () => openMember(m.id, button));
  item.append(button);
  return item;
}
async function loadList(number = 1) {
  if (!active) return;
  const token = ++listRequest;
  page = number;
  $("#number-results").textContent = "Consultando…";
  $("#page-controls").hidden = true;
  $("#empty").hidden = true;
  list.replaceChildren();
  aviso($("#dash-msg"), "");
  try {
    const data = await staff("/lista", { method: "POST", json: { ...applied, pagina: number } });
    if (token !== listRequest || !active) return;
    const pages = Math.ceil(data.total / data.porPagina);
    if (number > Math.max(1, pages)) return loadList(Math.max(1,pages));
    $("#number-results").textContent = data.total + (data.total === 1 ? " cadastro" : " cadastros");
    list.replaceChildren(...data.membros.map(rowCard));
    if (!data.total) {
      const filtered = Boolean(applied.busca || applied.situacao);
      $("#empty-title").textContent = filtered ? "Nenhum cadastro encontrado" : "Os cadastros aparecerão aqui";
      $("#empty-detail").textContent = filtered ? "Tente outro termo ou selecione todas as situações." : "Quando um membro enviar o formulário, a ficha entrará nesta lista.";
      $("#empty").hidden = false;
    }
    if (pages > 1) {
      $("#page-controls").hidden = false;
      $("#page-label").textContent = "Página " + number + " de " + pages;
      $("#previous").disabled = number === 1;
      $("#next").disabled = number === pages;
    }
  } catch (error) {
    if (active && token === listRequest) {
      $("#number-results").textContent = "";
      aviso($("#dash-msg"), error.message);
    }
  }
}
function signedIn(focus = false) {
  if (new URLSearchParams(window.location?.search || "").get("abrir") === "carteirinhas") {
    location.replace("/secretaria/carteirinhas/");
    return;
  }
  active = true;
  login.hidden = true;
  dashboard.hidden = false;
  $("#logout").hidden = false;
  $("#senha").value = "";
  if (focus) $("#dash-title").focus();
  return loadList();
}
$("#show-password").addEventListener("click", () => {
  const show = $("#senha").type === "password";
  $("#senha").type = show ? "text" : "password";
  $("#show-password").setAttribute("aria-pressed", String(show));
  $("#show-password").setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
});
$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  if ($("#login-btn").disabled) return;
  $("#login-btn").disabled = true;
  aviso($("#login-msg"), "");
  try {
    await api(base + "/entrar", { method: "POST", json: { senha: $("#senha").value } });
    await signedIn(true);
  } catch (error) {
    if (!active) { aviso($("#login-msg"), error.message); $("#senha").focus(); }
  } finally { $("#login-btn").disabled = false; }
});
$("#logout").addEventListener("click", async () => {
  $("#logout").disabled = true;
  try {
    await staff("/sair", { method: "POST" });
    signOutView();
    $("#login-heading").focus();
  } catch (error) {
    if (active) aviso($("#dash-msg"), error.message);
  } finally { $("#logout").disabled = false; }
});
$("#filters").addEventListener("submit", event => {
  event.preventDefault();
  applied = { busca: limparTexto($("#busca").value), situacao: $("#filter-status").value };
  loadList();
});
$("#filter-status").addEventListener("change", () => $("#filters").requestSubmit());
$("#previous").addEventListener("click", () => loadList(page - 1));
$("#next").addEventListener("click", () => loadList(page + 1));
$("#export-csv").addEventListener("click", async () => {
  const button = $("#export-csv");
  button.disabled = true;
  aviso($("#dash-msg"), "");
  try {
    const response = await staff("/exportar", { method: "POST", json: applied, raw: true });
    if (!response.headers.get("Content-Type")?.includes("text/csv")) throw new Error("A exportação não está disponível.");
    linkArquivo(await response.blob(), "cadastros-misrrev.csv");
  } catch (error) { if (active) aviso($("#dash-msg"), error.message); }
  finally { button.disabled = false; }
});

function fillFields(m) {
  $("#ed-nome").value = m.nome;
  $("#ed-telefone").value = mostrarTelefone(m.telefone);
  $("#ed-ano").value = m.ano || "";
  $("#ed-funcao").value = m.funcao;
  $("#ed-matricula").value = m.matricula || "";
  $("#ed-situacao").value = m.situacao;
  updateHeader(m);
}
function updateHeader(m) {
  $("#record-title").textContent = m.nome;
  $("#record-protocol").textContent = m.protocolo + " · Recebido em " + shortDate(m.recebido_em);
  $("#delete-name").textContent = m.nome;
}
function setBusy(value) {
  busy = value;
  for (const field of recordForm.querySelectorAll("input,select")) field.disabled = value;
  for (const selector of ["#save-record","#photo-input","#ask-delete","#confirm-delete","#cancel-delete","#close-dialog"]) $(selector).disabled = value;
}
async function showPhoto(m) {
  const tag = detailRequest;
  resetPhoto();
  $("#photo-action").textContent = m.tem_foto ? "Trocar foto" : "Adicionar foto";
  $("#download-photo").hidden = !m.tem_foto;
  $("#photo-info").textContent = m.tem_foto ? "Foto anexada a esta ficha." : "Use a foto tirada com Matheus.";
  if (!m.tem_foto) return;
  try {
    const res = await staff("/membros/" + m.id + "/foto", { raw: true });
    if (!res.headers.get("Content-Type")?.startsWith("image/jpeg")) throw new Error("Não foi possível abrir a foto.");
    const blob = await res.blob();
    if (tag !== detailRequest || current?.id !== m.id) return;
    photoUrl = URL.createObjectURL(blob);
    $("#portrait").src = photoUrl;
    $("#portrait").hidden = false;
  } catch (error) { if (active && tag === detailRequest) aviso($("#photo-msg"), error.message); }
}
async function openMember(id, button) {
  const tag = ++detailRequest;
  button.disabled = true;
  aviso($("#dash-msg"), "");
  try {
    const m = await staff("/membros/" + id);
    if (!active || tag !== detailRequest) return;
    current = m;
    fillFields(m);
    $("#delete-confirm").hidden = true;
    $("#ask-delete").hidden = false;
    aviso($("#record-msg"), "");
    aviso($("#photo-msg"), "");
    setBusy(false);
    dialog.showModal();
    $("#close-dialog").focus();
    await showPhoto(m);
  } catch (error) { if (active && tag === detailRequest) aviso($("#dash-msg"), error.message); }
  finally { button.disabled = false; }
}
function closeDialog() { if (!busy) dialog.close(); }
$("#close-dialog").addEventListener("click", closeDialog);
dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
dialog.addEventListener("close", clearRecord);
recordForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!current || busy) return;
  const { fields, errors } = validarDados({ nome: $("#ed-nome").value, telefone: $("#ed-telefone").value, ano: $("#ed-ano").value, funcao: $("#ed-funcao").value });
  if (Object.keys(errors).length) {
    const key = Object.keys(errors)[0];
    aviso($("#record-msg"), errors[key]);
    $("#ed-" + key).focus();
    return;
  }
  setBusy(true);
  try {
    current = await staff("/membros/" + current.id, { method: "PATCH", json: { ...fields, matricula: $("#ed-matricula").value, situacao: $("#ed-situacao").value, revisao: current.revisao } });
    fillFields(current);
    aviso($("#record-msg"), "Ficha salva.", true);
    await loadList(page);
  } catch (error) { if (active) aviso($("#record-msg"), error.message); }
  finally { setBusy(false); }
});

async function preparePortrait(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error("Escolha uma foto com até 20 MB.");
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Escolha uma foto em JPEG, PNG ou WebP.");
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    try { await img.decode(); } catch { throw new Error("Não foi possível ler esta imagem. Tente uma foto em JPEG."); }
    const ratio = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1,Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    for (const quality of [.9,.78,.64,.5]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",quality));
      if (blob && blob.size <= 480 * 1024) return blob;
    }
    throw new Error("A foto ficou muito grande. Escolha uma imagem menor.");
  } finally { URL.revokeObjectURL(src); }
}
$("#photo-input").addEventListener("change", async () => {
  const input = $("#photo-input");
  const file = input.files?.[0];
  if (!file || !current || busy) return;
  setBusy(true);
  aviso($("#photo-msg"), "Preparando a foto…", true);
  try {
    const blob = await preparePortrait(file);
    current = await staff("/membros/" + current.id + "/foto", { method: "PUT", headers: { "Content-Type": "image/jpeg", "X-Revisao": String(current.revisao) }, body: blob });
    aviso($("#photo-msg"), "Foto salva.", true);
    await showPhoto(current);
  } catch (error) { if (active) aviso($("#photo-msg"), error.message); }
  finally { input.value = ""; setBusy(false); }
});
$("#download-photo").addEventListener("click", async () => {
  if (!current) return;
  const m = current;
  try {
    const res = await staff("/membros/" + m.id + "/foto", { raw: true });
    if (!res.headers.get("Content-Type")?.startsWith("image/jpeg")) throw new Error("A foto não está disponível.");
    linkArquivo(await res.blob(), "foto-" + (m.matricula || m.protocolo) + ".jpg");
  } catch (error) { if (active) aviso($("#photo-msg"), error.message); }
});
$("#ask-delete").addEventListener("click", () => {
  $("#ask-delete").hidden = true;
  $("#delete-confirm").hidden = false;
  $("#cancel-delete").focus();
});
$("#cancel-delete").addEventListener("click", () => {
  $("#delete-confirm").hidden = true;
  $("#ask-delete").hidden = false;
  aviso($("#delete-error"), "");
  $("#ask-delete").focus();
});
$("#confirm-delete").addEventListener("click", async () => {
  if (!current || busy) return;
  setBusy(true);
  try {
    await staff("/membros/" + current.id, { method: "DELETE", json: { revisao: current.revisao } });
    dialog.close();
    await loadList(page);
    if (active) { aviso($("#dash-msg"), "Cadastro excluído.", true); $("#dash-title").focus(); }
  } catch (error) { if (active) aviso($("#delete-error"), error.message); }
  finally { setBusy(false); }
});

async function checkSession(initial) {
  try {
    await api(base + "/sessao");
    if (initial && !active) await signedIn();
  } catch (error) {
    if (initial && active) return;
    if (error.status === 401) signOutView(initial ? "" : "Sua sessão terminou. Entre novamente.");
    else if (initial) signOutView(error.message);
  }
}
window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && active) checkSession(false); });
checkSession(true);

