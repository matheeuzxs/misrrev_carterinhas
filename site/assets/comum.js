export const $ = (selector, parent = document) => parent.querySelector(selector);

export class ApiError extends Error {
  constructor(status, data) {
    super(data.erro || "Não foi possível concluir. Tente novamente.");
    this.status = status;
    this.fields = data.campos || {};
  }
}

export async function api(path, options = {}) {
  const settings = { credentials: "same-origin", cache: "no-store", ...options };
  if (Object.hasOwn(settings, "json")) {
    settings.body = JSON.stringify(settings.json);
    settings.headers = { "Content-Type": "application/json", ...settings.headers };
    delete settings.json;
  }
  let response;
  try {
    response = await fetch(path, settings);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Confira a conexão com a internet e tente novamente.");
  }
  const isJson = response.headers.get("Content-Type")?.includes("application/json");
  if (!response.ok) {
    const data = isJson ? await response.json() : { erro: "O serviço está indisponível. Tente novamente em instantes." };
    throw new ApiError(response.status, data);
  }
  if (options.raw) return response;
  if (!isJson) throw new Error("O serviço de cadastro está indisponível. Tente novamente em instantes.");
  return response.json();
}

export function aviso(el, message, ok = false) {
  el.textContent = message || "";
  el.className = "notice " + (ok ? "ok" : "error");
  el.hidden = !message;
}

export function definirErro(input, target, message) {
  input.setAttribute("aria-invalid", message ? "true" : "false");
  target.textContent = message || "";
}

export function linkArquivo(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}


// Avisa quem está com a página aberta quando uma versão nova do site é publicada.
async function versaoPublicada() {
  try {
    const res = await fetch("/api/versao", { cache: "no-store", credentials: "same-origin" });
    return res.ok ? (await res.json()).versao : null;
  } catch { return null; }
}
function mostrarAvisoDeVersao() {
  if (document.getElementById("aviso-versao")) return;
  const bar = document.createElement("div");
  bar.id = "aviso-versao";
  bar.className = "update-bar";
  bar.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = "Há uma nova versão do site. Atualize antes de continuar.";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn primary";
  button.textContent = "Atualizar";
  button.addEventListener("click", () => location.reload());
  bar.append(text, button);
  document.body.append(bar);
}
if (typeof document !== "undefined") {
  let inicial = null;
  const conferir = async () => {
    const atual = await versaoPublicada();
    if (!atual) return;
    if (inicial === null) inicial = atual;
    else if (atual !== inicial) mostrarAvisoDeVersao();
  };
  conferir();
  setInterval(conferir, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") conferir(); });
}

// Aplica uma máscara enquanto a pessoa digita, mantendo o cursor depois do mesmo número de dígitos.
export function mascarar(input, formatar) {
  const contar = text => (text.match(/[0-9A-Za-z]/g) || []).length;
  input.addEventListener("input", event => {
    let value = input.value, pos = input.selectionStart ?? value.length;
    let antes = contar(value.slice(0, pos));
    // Apagar um ponto ou traço com Backspace apaga o dígito anterior a ele.
    if (event.inputType === "deleteContentBackward" && contar(value) === contar(input.dataset.anterior || "") && antes > 0) {
      let i = pos;
      while (i > 0 && !/[0-9A-Za-z]/.test(value[i - 1])) i--;
      value = value.slice(0, i - 1) + value.slice(i);
      antes--;
    }
    const novo = formatar(value);
    input.value = novo;
    input.dataset.anterior = novo;
    let cursor = 0, vistos = 0;
    while (cursor < novo.length && vistos < antes) { if (/[0-9A-Za-z]/.test(novo[cursor])) vistos++; cursor++; }
    if (document.activeElement === input) input.setSelectionRange(cursor, cursor);
  });
  input.addEventListener("focus", () => { input.dataset.anterior = input.value; });
}

// Reduz a foto para no máximo 1000 px e 480 KB em JPEG, como a API exige.
export async function prepararFoto(file) {
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
