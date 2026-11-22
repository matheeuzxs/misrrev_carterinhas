import { $, api, aviso, definirErro } from "./comum.js";
import { PAI_NAO_CONSTA, camposPendentes, limparTexto, mostrarTelefone, mostrarData, mostrarCpf, hojeSP, validarDados, VERSAO_CONSENTIMENTO, TEXTO_CONSENTIMENTO } from "./dados.js";

const form = $("#member-form");
const selects = $("#funcao");
const entry = $("#entry-step");
const review = $("#review-step");
const success = $("#success");
const consent = $("#consentimento");
const submit = $("#send");
const firstStep = $("#step-label-1");
const secondStep = $("#step-label-2");
const previewButton = $("#preview-toggle");
const EXTRAS = ["nascimento","batismo","estado_civil","naturalidade","pai","mae","rg","cpf"];
const errorEls = { nome: $("#nome"), telefone: $("#telefone"), funcao: $("#outra"), ...Object.fromEntries(EXTRAS.map(k => [k, $("#" + k)])) };
let values;
let requestId = null;
let sending = false;

$("#consentimento + span").textContent = TEXTO_CONSENTIMENTO;
for (const id of ["nascimento","batismo"]) $("#" + id).max = hojeSP();

function getData() {
  return {
    nome: $("#nome").value,
    telefone: $("#telefone").value,
    funcao: selects.value === "Outro" ? $("#outra").value : selects.value,
    ...Object.fromEntries(EXTRAS.map(k => [k, $("#" + k).value]))
  };
}

function preview() {
  const data = getData();
  const name = limparTexto(data.nome);
  $("#card-name").textContent = name || "Seu nome aqui";
  $("#card-name").classList.toggle("long-name", name.length > 21);
  $("#card-year").textContent = mostrarData(data.nascimento) || "—";
  $("#card-role").textContent = data.funcao || "Membro";
}

function showErrors(errors, focus = true) {
  let first;
  for (const [key, field] of Object.entries(errorEls)) {
    definirErro(field, $("#erro-" + field.id), errors[key]);
    if (errors[key] && !first) first = field;
  }
  if (first && focus) first.focus();
}

function stage(number, focus = true) {
  entry.hidden = number !== 1;
  review.hidden = number !== 2;
  form.hidden = number === 3;
  success.hidden = number !== 3;
  [firstStep, secondStep].forEach((el, i) => {
    const position = i + 1;
    el.classList.toggle("is-current", number === position);
    el.classList.toggle("is-done", number > position);
    if (number === position) el.setAttribute("aria-current", "step");
    else el.removeAttribute("aria-current");
    $(".step-n", el).textContent = number > position ? "✓" : String(position);
  });
  if (focus) {
    const target = [$("#entry-heading"), $("#review-heading"), $("#success-heading")][number - 1];
    target.focus({ preventScroll: true });
    $("#cadastro").scrollIntoView({ block: "start", behavior: "instant" });
  }
}

function buildReview(data) {
  const F = "Falta preencher";
  const faltam = camposPendentes(data);
  const missing = $("#review-missing");
  missing.hidden = !faltam.length;
  missing.textContent = faltam.length ? "Faltam: " + faltam.join(", ") + ". Você pode enviar assim mesmo; a secretaria vai completar com você." : "";
  const dl = $("#review-data");
  const rows = [
    ["Nome completo", data.nome], ["Telefone com DDD", mostrarTelefone(data.telefone)],
    ["Função na igreja", data.funcao], ["Data de nascimento", mostrarData(data.nascimento) || F],
    ["Data de batismo", mostrarData(data.batismo) || F], ["Estado civil", data.estado_civil || F],
    ["Natural de", data.naturalidade || F], ["Pai", data.pai || F], ["Mãe", data.mae || F],
    ["RG", data.rg || F], ["CPF", mostrarCpf(data.cpf) || F]
  ];
  dl.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }));
}

form.addEventListener("input", event => {
  const field = event.target;
  if (field === consent) {
    definirErro(consent, $("#erro-consentimento"), "");
    return;
  }
  const error = $("#erro-" + field.id);
  if (error) definirErro(field, error, "");
  if (field === selects) {
    $("#other-wrap").hidden = selects.value !== "Outro";
    if (selects.value !== "Outro") $("#outra").value = "";
  }
  preview();
});
$("#telefone").addEventListener("blur", event => {
  event.target.value = mostrarTelefone(event.target.value);
});
$("#pai-nc").addEventListener("change", event => {
  const pai = $("#pai");
  pai.value = event.target.checked ? PAI_NAO_CONSTA : "";
  pai.readOnly = event.target.checked;
  definirErro(pai, $("#erro-pai"), "");
});
$("#cpf").addEventListener("blur", event => {
  event.target.value = mostrarCpf(event.target.value);
});
previewButton.addEventListener("click", () => {
  const open = $("#visual-card").classList.toggle("is-open");
  previewButton.setAttribute("aria-expanded", String(open));
  $("span", previewButton).textContent = open ? "Ocultar exemplo" : "Ver carteirinha de exemplo";
});
$("#back").addEventListener("click", () => {
  consent.checked = false;
  definirErro(consent, $("#erro-consentimento"), "");
  aviso($("#send-error"), "");
  stage(1);
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (sending) return;
  if (!entry.hidden) {
    const { fields, errors } = validarDados(getData());
    showErrors(errors);
    if (Object.keys(errors).length) return;
    if (JSON.stringify(values) !== JSON.stringify(fields)) requestId = null;
    values = fields;
    buildReview(values);
    stage(2);
    return;
  }
  if (!consent.checked) {
    definirErro(consent, $("#erro-consentimento"), "Marque a autorização para enviar.");
    consent.focus();
    return;
  }
  sending = true;
  submit.disabled = true;
  $("#back").disabled = true;
  $("span", submit).textContent = "Enviando…";
  aviso($("#send-error"), "");
  try {
    requestId ||= crypto.randomUUID();
    const result = await api("/api/cadastros", {
      method: "POST", json: { ...values, solicitacao: requestId, consentimento: true, versaoConsentimento: VERSAO_CONSENTIMENTO }
    });
    if (typeof result.protocolo !== "string") throw new Error("O servidor não confirmou o recebimento. Tente novamente.");
    $("#protocol").textContent = result.protocolo;
    form.reset();
    $("#review-data").replaceChildren();
    values = undefined;
    requestId = null;
    $("#other-wrap").hidden = true;
    $("#pai").readOnly = false;
    preview();
    stage(3);
  } catch (error) {
    if (error.fields && Object.keys(error.fields).length) {
      stage(1);
      showErrors(error.fields);
    } else {
      aviso($("#send-error"), error.message);
    }
  } finally {
    sending = false;
    submit.disabled = false;
    $("#back").disabled = false;
    $("span", submit).textContent = "Enviar cadastro";
  }
});

$("#new-member").addEventListener("click", () => {
  $("#protocol").textContent = "";
  $("#copy-code span").textContent = "Copiar";
  $("#copy-message").textContent = "";
  showErrors({}, false);
  definirErro(consent, $("#erro-consentimento"), "");
  stage(1);
});
$("#copy-code").addEventListener("click", async () => {
  const code = $("#protocol").textContent;
  try {
    await navigator.clipboard.writeText(code);
    $("#copy-code span").textContent = "Copiado";
    $("#copy-message").textContent = "Protocolo copiado.";
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("#protocol"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    $("#copy-message").textContent = "Protocolo selecionado para copiar.";
  }
});

