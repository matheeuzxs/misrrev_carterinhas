export const FUNCOES = ["Membro","Cooperador(a)","Diácono","Diaconisa","Presbítero","Evangelista","Pastor(a)","Pastor-presidente","Pastora-presidente"];
// Estes cargos usam o verso com a Constituição; os demais usam o verso dos demais cargos.
export const FUNCOES_MINISTERIAIS = ["Presbítero","Evangelista","Pastor(a)","Pastor-presidente","Pastora-presidente"];
export function versoDaFuncao(funcao) {
  return FUNCOES_MINISTERIAIS.includes(funcao) ? "verso" : "verso2";
}
export const SITUACOES = { recebido: "Recebido", conferido: "Conferido", emitido: "Emitido" };
export const ESTADOS_CIVIS = ["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União estável"];
export const PAI_NAO_CONSTA = "Não consta";
export const VERSAO_CONSENTIMENTO = "carteirinha-v2";
export const TEXTO_CONSENTIMENTO = "Sou o membro ou seu responsável e autorizo a Missão Resgate Restaurando Vidas a usar estes dados, incluindo RG e CPF, e a foto tirada na igreja para preparar a carteirinha. A secretaria pode entrar em contato sobre este cadastro.";

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

export function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Datas trafegam como AAAA-MM-DD, o formato do campo de data do navegador.
export function dataValida(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function mostrarData(value) {
  return dataValida(value) ? value.split("-").reverse().join("/") : "";
}

export function digitosCpf(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export function cpfValido(value) {
  const d = digitosCpf(value);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    if ((soma * 10) % 11 % 10 !== Number(d[n])) return false;
  }
  return true;
}

export function mostrarCpf(value) {
  const d = digitosCpf(value);
  return d.length === 11 ? d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9) : (value || "");
}

function textoValido(value, max) {
  return value.length >= 2 && value.length <= max && /\p{L}/u.test(value) && !/[\p{Cc}\p{Cf}]/u.test(value);
}

export const CAMPOS_FICHA = { nascimento: "Data de nascimento", batismo: "Data de batismo", estado_civil: "Estado civil",
  naturalidade: "Natural de", pai: "Pai", mae: "Mãe", rg: "RG", cpf: "CPF" };

// Campos da ficha que ficaram em branco e a secretaria precisa completar.
export function camposPendentes(ficha) {
  return Object.keys(CAMPOS_FICHA).filter(k => !ficha?.[k]).map(k => CAMPOS_FICHA[k]);
}

export function validarDados(data) {
  const nome = limparTexto(data.nome);
  const telefone = digitosTelefone(data.telefone);
  const ano = data.ano == null ? "" : String(data.ano).trim();
  const funcao = limparTexto(data.funcao);
  const nascimento = limparTexto(data.nascimento);
  const batismo = limparTexto(data.batismo);
  const pai = limparTexto(data.pai);
  const mae = limparTexto(data.mae);
  const estado_civil = limparTexto(data.estado_civil);
  const rg = limparTexto(data.rg).toUpperCase();
  const cpf = digitosCpf(data.cpf);
  const naturalidade = limparTexto(data.naturalidade);
  const hoje = hojeSP();
  const errors = {};
  if (!textoValido(nome, 100)) errors.nome = "Informe seu nome completo, com até 100 caracteres.";
  if (!/^[1-9][0-9]\d{8,9}$/.test(telefone)) errors.telefone = "Use um telefone brasileiro com DDD e 10 ou 11 dígitos.";
  if (ano && (!/^\d{4}$/.test(ano) || Number(ano) < 1900 || Number(ano) > anoAtual())) {
    errors.ano = "Informe um ano entre 1900 e " + anoAtual() + " ou deixe em branco.";
  }
  if (!FUNCOES.includes(funcao)) errors.funcao = "Escolha o cargo na lista.";
  // Campos em branco não impedem o envio; ficam como pendência para a secretaria. Só valores inválidos bloqueiam.
  if (nascimento && (!dataValida(nascimento) || nascimento < "1900-01-01" || nascimento > hoje)) errors.nascimento = "Confira a data de nascimento.";
  if (batismo && (!dataValida(batismo) || batismo < "1900-01-01" || batismo > hoje)) errors.batismo = "Confira a data de batismo.";
  else if (batismo && nascimento && !errors.nascimento && batismo < nascimento) errors.batismo = "O batismo não pode ser antes do nascimento.";
  if (pai && !textoValido(pai, 100)) errors.pai = "Confira o nome do pai, com até 100 caracteres.";
  if (mae && !textoValido(mae, 100)) errors.mae = "Confira o nome da mãe, com até 100 caracteres.";
  if (estado_civil && !ESTADOS_CIVIS.includes(estado_civil)) errors.estado_civil = "Escolha o estado civil na lista.";
  // RG e CPF são obrigatórios: sem eles o cadastro não é enviado.
  if (!/^[0-9A-Z][0-9A-Z.\-\/ ]{3,19}$/.test(rg)) errors.rg = rg ? "Confira o RG, com até 20 caracteres." : "Informe o RG.";
  if (!cpfValido(cpf)) errors.cpf = cpf ? "Este CPF não é válido. Confira os 11 números." : "Informe o CPF.";
  if (naturalidade && !textoValido(naturalidade, 60)) errors.naturalidade = "Confira a cidade e o estado, com até 60 caracteres.";
  return { fields: {
    nome, telefone, ano: ano ? Number(ano) : null, funcao, nascimento: nascimento || null,
    batismo: batismo || null, pai: pai || null, mae: mae || null, estado_civil: estado_civil || null,
    rg: rg || null, cpf: cpf || null, naturalidade: naturalidade || null
  }, errors };
}
