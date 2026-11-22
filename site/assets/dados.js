export const FUNCOES = ["Membro","Cooperador(a)","Diácono(a)","Diaconisa","Presbítero(a)","Evangelista","Missionário(a)","Pastor(a)","Outro"];
export const SITUACOES = { recebido: "Recebido", conferido: "Conferido", emitido: "Emitido" };
export const VERSAO_CONSENTIMENTO = "carteirinha-v1";
export const TEXTO_CONSENTIMENTO = "Sou o membro ou seu responsável e autorizo a Missão Resgate Restaurando Vidas a usar estes dados e a foto tirada na igreja para preparar a carteirinha. A secretaria pode entrar em contato sobre este cadastro.";

export function limparTexto(value) {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/gu, " ").trim() : "";
}

export function chaveBusca(value) {
  return limparTexto(value).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

export function digitosTelefone(value) {
  let digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

export function mostrarTelefone(value) {
  const digits = digitosTelefone(value);
  if (digits.length < 3) return digits ? "(" + digits : "";
  if (digits.length > 11) return value;
  const middle = digits.length === 11 ? 7 : 6;
  const start = "(" + digits.slice(0, 2) + ") " + digits.slice(2, middle);
  return digits.length > middle ? start + "-" + digits.slice(middle) : start;
}

export function anoAtual() {
  return Number(new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
}

export function validarDados(data) {
  const nome = limparTexto(data.nome);
  const telefone = digitosTelefone(data.telefone);
  const ano = data.ano == null ? "" : String(data.ano).trim();
  const funcao = limparTexto(data.funcao);
  const errors = {};
  if (nome.length < 2 || nome.length > 100 || !/\p{L}/u.test(nome) || /[\p{Cc}\p{Cf}]/u.test(nome)) {
    errors.nome = "Informe seu nome completo, com até 100 caracteres.";
  }
  if (!/^[1-9][0-9]\d{8,9}$/.test(telefone)) errors.telefone = "Use um telefone brasileiro com DDD e 10 ou 11 dígitos.";
  if (ano && (!/^\d{4}$/.test(ano) || Number(ano) < 1900 || Number(ano) > anoAtual())) {
    errors.ano = "Informe um ano entre 1900 e " + anoAtual() + " ou deixe em branco.";
  }
  if (funcao.length < 2 || funcao.length > 45 || !/\p{L}/u.test(funcao) || /[\p{Cc}\p{Cf}]/u.test(funcao)) {
    errors.funcao = "Informe uma função de até 45 caracteres.";
  }
  return { fields: { nome, telefone, ano: ano ? Number(ano) : null, funcao }, errors };
}

