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

