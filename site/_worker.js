// Gerado por npm run preparar a partir de backend/worker.mjs e dos módulos compartilhados.
const CAMPOS_CARTAO = { nome: "Nome", matricula: "Matrícula", funcao: "Função", ano: "Membro desde", telefone:"Telefone", foto: "Foto",
  batismo: "Data de batismo", pai: "Pai", mae: "Mãe", nascimento: "Data de nascimento", estado_civil: "Estado civil",
  rg: "RG", cpf: "CPF", emissao: "Data de emissão", naturalidade: "Natural de" };
const LIMITE_ARTE = 6 * 1024 * 1024;

function modeloInicial() {
  // Posições medidas na arte oficial da carteira de membro (frente e verso), 85,6 × 54 mm sem sangria.
  const field = (lado, x, y, w, h, pt, extra = {}) => ({ lado, x, y, w, h, pt, cor: "#0f2347", fonte: "sans", negrito: false, alinhar: "esquerda", ...extra });
  return { largura: 85.6, altura: 54, sangria: 0, campos: {
    nome: field("frente", 3.86, 27.6, 54.21, 3.86, 10.5, { negrito: true }),
    funcao: field("frente", 3.86, 36.37, 30.45, 3.29, 8.5),
    batismo: field("frente", 36.99, 36.37, 21.08, 3.29, 8.5),
    foto: field("frente", 64.32, 20.55, 15.41, 20.72, 9),
    matricula: field("oculto", 3.86, 42, 26, 4, 8),
    ano: field("oculto", 34, 42, 18, 4, 8),
    telefone: field("oculto", 3.86, 46, 42, 4, 8),
    pai: field("verso", 3.69, 9.81, 37.87, 1.81, 5),
    mae: field("verso", 43.84, 9.81, 37.97, 1.81, 5),
    nascimento: field("verso", 3.69, 14.78, 23.23, 1.95, 5.25),
    estado_civil: field("verso", 29.71, 14.78, 23.6, 1.95, 5.25),
    naturalidade: field("verso", 56.16, 14.78, 25.65, 1.95, 5.25),
    rg: field("verso", 3.69, 19.88, 23.23, 1.95, 5.25),
    cpf: field("verso", 29.71, 19.88, 23.6, 1.95, 5.25),
    emissao: field("verso", 56.16, 19.88, 25.65, 1.95, 5.25)
  }};
}

// Modelos salvos antes dos campos novos recebem os campos que faltam, ocultos.
function completarModelo(model) {
  const base = modeloInicial();
  const faltantes = Object.fromEntries(Object.entries(base.campos).map(([k, c]) => [k, { ...c, lado: "oculto" }]));
  return { ...base, ...model, campos: { ...faltantes, ...(model?.campos || {}) } };
}

function medida(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

// As posições partem do canto superior esquerdo do tamanho de corte, em mm.
function conferirModelo(model, comVerso) {
  if (!model || !medida(model.largura,30,160) || !medida(model.altura,25,160) || !medida(model.sangria,0,5)) {
    throw new Error("Confira o tamanho de corte e a sangria, em milímetros.");
  }
  let ativos = 0;
  for (const [key,label] of Object.entries(CAMPOS_CARTAO)) {
    const c = model.campos?.[key];
    if (!c || !["frente","verso","oculto"].includes(c.lado)) throw new Error("Escolha a posição de " + label + ".");
    if (c.lado === "oculto") continue;
    ativos++;
    if (c.lado === "verso" && !comVerso) throw new Error(label + " está no verso. Adicione a arte do verso ou mude o campo de lado.");
    if (!medida(c.x,0,model.largura) || !medida(c.y,0,model.altura) || !medida(c.w,1,model.largura) || !medida(c.h,1,model.altura) ||
        c.x+c.w > model.largura+0.005 || c.y+c.h > model.altura+0.005) {
      throw new Error("A caixa de " + label + " precisa caber dentro do tamanho de corte.");
    }
    if (key !== "foto" && (!medida(c.pt,4,50) || !/^#[0-9a-f]{6}$/i.test(c.cor) || !["sans","serif"].includes(c.fonte) ||
      !["esquerda","centro","direita"].includes(c.alinhar) || typeof c.negrito !== "boolean")) throw new Error("Confira a tipografia de " + label + ".");
  }
  if (!ativos) throw new Error("Ative pelo menos um campo de personalização.");
  return model;
}

function pendenciasDaFicha(campos, ficha) {
  return Object.keys(CAMPOS_CARTAO).filter(k => campos[k].lado !== "oculto" && !(k === "foto" ? ficha.tem_foto : ficha[k])).map(k => CAMPOS_CARTAO[k]);
}


const FUNCOES = ["Membro","Cooperador(a)","Diácono","Diaconisa","Presbítero","Evangelista","Pastor(a)","Pastor-presidente","Pastora-presidente"];
// Estes cargos usam o verso com a Constituição; os demais usam o verso dos demais cargos.
const FUNCOES_MINISTERIAIS = ["Presbítero","Evangelista","Pastor(a)","Pastor-presidente","Pastora-presidente"];
function versoDaFuncao(funcao) {
  return FUNCOES_MINISTERIAIS.includes(funcao) ? "verso" : "verso2";
}
const SITUACOES = { recebido: "Recebido", conferido: "Conferido", emitido: "Emitido" };
const ESTADOS_CIVIS = ["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União estável"];
const PAI_NAO_CONSTA = "Não consta";
const VERSAO_CONSENTIMENTO = "carteirinha-v2";
const TEXTO_CONSENTIMENTO = "Sou o membro ou seu responsável e autorizo a Missão Resgate Restaurando Vidas a usar estes dados, incluindo RG e CPF, e a foto tirada na igreja para preparar a carteirinha. A secretaria pode entrar em contato sobre este cadastro.";

function limparTexto(value) {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/gu, " ").trim() : "";
}

function chaveBusca(value) {
  return limparTexto(value).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

function digitosTelefone(value) {
  let digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function mostrarTelefone(value) {
  const digits = digitosTelefone(value);
  if (digits.length < 3) return digits ? "(" + digits : "";
  if (digits.length > 11) return value;
  const middle = digits.length === 11 ? 7 : 6;
  const start = "(" + digits.slice(0, 2) + ") " + digits.slice(2, middle);
  return digits.length > middle ? start + "-" + digits.slice(middle) : start;
}

function anoAtual() {
  return Number(new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
}

function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Datas trafegam como AAAA-MM-DD, o formato do campo de data do navegador.
function dataValida(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function mostrarData(value) {
  return dataValida(value) ? value.split("-").reverse().join("/") : "";
}

function digitosCpf(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function cpfValido(value) {
  const d = digitosCpf(value);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    if ((soma * 10) % 11 % 10 !== Number(d[n])) return false;
  }
  return true;
}

function mostrarCpf(value) {
  const d = digitosCpf(value);
  return d.length === 11 ? d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9) : (value || "");
}

function textoValido(value, max) {
  return value.length >= 2 && value.length <= max && /\p{L}/u.test(value) && !/[\p{Cc}\p{Cf}]/u.test(value);
}

const CAMPOS_FICHA = { nascimento: "Data de nascimento", batismo: "Data de batismo", estado_civil: "Estado civil",
  naturalidade: "Natural de", pai: "Pai", mae: "Mãe", rg: "RG", cpf: "CPF" };

// Campos da ficha que ficaram em branco e a secretaria precisa completar.
function camposPendentes(ficha) {
  return Object.keys(CAMPOS_FICHA).filter(k => !ficha?.[k]).map(k => CAMPOS_FICHA[k]);
}

function validarDados(data) {
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


const encoder = new TextEncoder();
const SESSION_COOKIE = "__Host-misrrev";
const SESSION_SECONDS = 4 * 60 * 60;
const SESSION_LONG_SECONDS = 30 * 24 * 60 * 60;
const PHOTO_LIMIT = 480 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const EXTRA_COLUMNS = ["nascimento","batismo","pai","mae","estado_civil","rg","cpf","naturalidade"];
const MEMBER_COLUMNS = "id, protocolo, nome, telefone, ano, funcao, " + EXTRA_COLUMNS.join(", ") + ", emissao, funcao_solicitada, funcao_aprovada, matricula, situacao, recebido_em, atualizado_em, revisao, foto IS NOT NULL AS tem_foto";
const SAFETY_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"
};

class HttpError extends Error {
  constructor(status, message, fields, headers = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.headers = headers;
  }
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { ...SAFETY_HEADERS, ...headers } });
}

function requireMethod(request, method) {
  if (request.method !== method) throw new HttpError(405, "Método indisponível.", undefined, { Allow: method });
}

function methodOrigin(request, url) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("Origin") !== url.origin) throw new HttpError(403, "Reabra o site da igreja para continuar.");
}

async function readBytes(request, limit) {
  if (Number(request.headers.get("Content-Length")) > limit) throw new HttpError(413, "O arquivo ou formulário excede o tamanho permitido.");
  if (!request.body) throw new HttpError(400, "O envio está vazio.");
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "O arquivo ou formulário excede o tamanho permitido.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

async function readJson(request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "Envie o formulário pelo site da igreja.");
  }
  const bytes = await readBytes(request, 8192);
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new HttpError(400, "Não foi possível ler o formulário.");
  }
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}

function secretKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function keyedHash(key, value) {
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function rateLimit(db, request, key, purpose, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(now / windowSeconds);
  const expiry = (slot + 1) * windowSeconds;
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const bucket = await keyedHash(key, ["limite", purpose, ip, slot].join("|"));
  const statements = [
    db.prepare("DELETE FROM limites WHERE expira <= ?").bind(now),
    db.prepare("INSERT INTO limites(chave,tentativas,expira) VALUES(?,1,?) ON CONFLICT(chave) DO UPDATE SET tentativas=tentativas+1 WHERE tentativas < ? RETURNING tentativas").bind(bucket, expiry, limit)
  ];
  const result = await db.batch(statements);
  if (!result[1].results.length) {
    throw new HttpError(429, "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.", undefined, { "Retry-After": String(expiry - now) });
  }
}

function checkedFields(data) {
  const result = validarDados(data);
  if (Object.keys(result.errors).length) throw new HttpError(422, "Confira os campos indicados.", result.errors);
  return result.fields;
}

async function submit(request, db, key) {
  requireMethod(request, "POST");
  const data = await readJson(request);
  if (!UUID.test(data.solicitacao) || data.consentimento !== true || data.versaoConsentimento !== VERSAO_CONSENTIMENTO) {
    throw new HttpError(422, "Confira a autorização e envie pelo formulário atualizado.");
  }
  const values = checkedFields(data);
  await rateLimit(db, request, key, "cadastro", 120, 900);
  const digest = hex(await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(values))));
  const id = crypto.randomUUID();
  const code = "MR-" + id.replace(/-/g, "").slice(-12).toUpperCase().match(/.{4}/g).join("-");
  const time = new Date().toISOString();
  const inserted = await db.prepare(
    "INSERT INTO membros(id,solicitacao,resumo_envio,protocolo,nome,nome_busca,telefone,ano,funcao,funcao_solicitada," + EXTRA_COLUMNS.join(",") + ",consentimento_versao,recebido_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?," + EXTRA_COLUMNS.map(() => "?").join(",") + ",?,?,?) ON CONFLICT(solicitacao) DO NOTHING RETURNING protocolo"
  ).bind(id, data.solicitacao, digest, code, values.nome, chaveBusca(values.nome), values.telefone, values.ano, values.funcao, values.funcao, ...EXTRA_COLUMNS.map(k => values[k]), VERSAO_CONSENTIMENTO, time, time).first();
  if (inserted) return json({ protocolo: inserted.protocolo }, 201);
  const existing = await db.prepare("SELECT protocolo, resumo_envio FROM membros WHERE solicitacao=?").bind(data.solicitacao).first();
  if (existing?.resumo_envio !== digest) throw new HttpError(409, "Este envio já foi registrado com outros dados. Para uma correção, fale com a Julia.");
  return json({ protocolo: existing.protocolo });
}

function cookie(token, maxAge) {
  return SESSION_COOKIE + "=" + token + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Strict";
}

async function signIn(request, db, secret, key) {
  requireMethod(request, "POST");
  const data = await readJson(request);
  await rateLimit(db, request, key, "login", 8, 900);
  const provided = typeof data.senha === "string" && data.senha.length <= 256 ? data.senha : "";
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(secret));
  if (!(await crypto.subtle.verify("HMAC", key, signature, encoder.encode(provided)))) throw new HttpError(401, "Senha incorreta.");
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await keyedHash(key, "sessao|" + raw);
  const now = Math.floor(Date.now() / 1000);
  const seconds = data.manter === true ? SESSION_LONG_SECONDS : SESSION_SECONDS;
  await db.batch([
    db.prepare("DELETE FROM sessoes WHERE expira <= ?").bind(now),
    db.prepare("INSERT INTO sessoes(chave,expira) VALUES(?,?)").bind(hash, now + seconds)
  ]);
  return json({ ok: true }, 200, { "Set-Cookie": cookie(raw, seconds) });
}

async function authorize(request, db, key) {
  const part = (request.headers.get("Cookie") || "").split(";").map(item => item.trim()).find(item => item.startsWith(SESSION_COOKIE + "="));
  const raw = part?.slice(SESSION_COOKIE.length + 1);
  if (!/^[a-f0-9]{64}$/.test(raw || "")) throw new HttpError(401, "Entre com a senha da secretaria.");
  const hash = await keyedHash(key, "sessao|" + raw);
  const session = await db.prepare("SELECT 1 AS ok FROM sessoes WHERE chave=? AND expira>?").bind(hash, Math.floor(Date.now() / 1000)).first();
  if (!session) throw new HttpError(401, "Sua sessão terminou. Entre novamente.");
  return hash;
}

function filterFor(data) {
  const status = data.situacao || "";
  if (status && !Object.hasOwn(SITUACOES, status)) throw new HttpError(422, "A situação selecionada é inválida.");
  const term = chaveBusca(data.busca).slice(0, 100);
  const clauses = [];
  const args = [];
  if (status) {
    clauses.push("situacao=?");
    args.push(status);
  }
  if (term) {
    clauses.push("(instr(nome_busca,?)>0 OR instr(lower(protocolo),?)>0 OR instr(COALESCE(matricula,''),?)>0 OR instr(telefone,?)>0 OR instr(COALESCE(cpf,''),?)>0)");
    const tel = /^[0-9+()\s-]+$/.test(term) ? (term.replace(/\D/g,"") || term) : term;
    args.push(term, term, term, tel, tel);
  }
  return { sql: clauses.length ? " WHERE " + clauses.join(" AND ") : "", args };
}

async function listMembers(request, db) {
  requireMethod(request, "POST");
  const data = await readJson(request);
  const f = filterFor(data);
  const page = Number(data.pagina) || 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw new HttpError(422, "Página inválida.");
  const limit = 24;
  const [count, rows] = await db.batch([
    db.prepare("SELECT COUNT(*) AS total FROM membros" + f.sql).bind(...f.args),
    db.prepare("SELECT " + MEMBER_COLUMNS + " FROM membros" + f.sql + " ORDER BY ordem DESC LIMIT ? OFFSET ?").bind(...f.args, limit, (page - 1) * limit)
  ]);
  return json({ membros: rows.results, total: count.results[0].total, pagina: page, porPagina: limit });
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

async function exportMembers(request, db) {
  requireMethod(request, "POST");
  const f = filterFor(await readJson(request));
  const data = await db.prepare("SELECT protocolo,nome,telefone,ano,funcao," + EXTRA_COLUMNS.join(",") + ",emissao,funcao_solicitada,funcao_aprovada,matricula,situacao,foto IS NOT NULL AS tem_foto,recebido_em FROM membros" + f.sql + " ORDER BY ordem").bind(...f.args).all();
  const header = ["Protocolo","Nome completo","Telefone com DDD","Membro desde","Função","Data de nascimento","Data de batismo","Pai","Mãe","Estado civil","RG","CPF","Natural de","Data de emissão","Cargo solicitado","Cargo confirmado","Matrícula","Situação","Foto anexada","Recebido em"];
  const rows = [header.map(csvCell).join(";")];
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  for (const m of data.results) {
    const time = dateFormat.format(new Date(m.recebido_em));
    rows.push([m.protocolo,m.nome,mostrarTelefone(m.telefone),m.ano,m.funcao,mostrarData(m.nascimento),mostrarData(m.batismo),m.pai,m.mae,m.estado_civil,m.rg,mostrarCpf(m.cpf),m.naturalidade,mostrarData(m.emissao),m.funcao_solicitada,m.funcao_aprovada ? "Sim" : "Não",m.matricula,SITUACOES[m.situacao],m.tem_foto ? "Sim" : "Não",time].map(csvCell).join(";"));
  }
  return new Response("\uFEFF" + rows.join("\r\n") + "\r\n", { headers: { ...SAFETY_HEADERS, "Content-Type": "text/csv; charset=UTF-8", "Content-Disposition": 'attachment; filename="cadastros-misrrev.csv"' } });
}

async function member(db, id) {
  const result = await db.prepare("SELECT " + MEMBER_COLUMNS + " FROM membros WHERE id=?").bind(id).first();
  if (!result) throw new HttpError(404, "Este cadastro não está mais disponível.");
  return result;
}

function revision(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(422, "Reabra a ficha antes de gravar.");
  return number;
}

async function checkChange(db, id, result) {
  if (result.meta.changes) return;
  await member(db, id);
  throw new HttpError(409, "Outra pessoa alterou esta ficha. Feche e abra novamente para ver os dados atuais.");
}

async function updateMember(request, db, id) {
  const data = await readJson(request);
  const values = checkedFields(data);
  const matricula = limparTexto(data.matricula);
  if (matricula && (!/^\d{1,12}$/.test(matricula) || !Number(matricula))) throw new HttpError(422, "Use de 1 a 12 dígitos para a matrícula.");
  if (!Object.hasOwn(SITUACOES, data.situacao)) throw new HttpError(422, "Selecione uma situação válida.");
  if (data.situacao === "emitido" && !matricula) throw new HttpError(422, "Informe a matrícula antes de marcar a carteirinha como emitida.");
  const aprovada = data.funcao_aprovada === true ? 1 : 0;
  if (data.situacao === "emitido" && !aprovada) throw new HttpError(422, "Confirme o cargo antes de marcar a carteirinha como emitida.");
  let emissao = limparTexto(data.emissao) || null;
  if (emissao && !dataValida(emissao)) throw new HttpError(422, "Confira a data de emissão.", { emissao: "Confira a data de emissão." });
  if (!emissao && data.situacao === "emitido") emissao = hojeSP();
  let result;
  try {
    result = await db.prepare("UPDATE membros SET nome=?,nome_busca=?,telefone=?,ano=?,funcao=?," + EXTRA_COLUMNS.map(k => k + "=?").join(",") + ",emissao=?,funcao_aprovada=?,matricula=?,situacao=?,atualizado_em=?,revisao=revisao+1 WHERE id=? AND revisao=?")
      .bind(values.nome, chaveBusca(values.nome), values.telefone, values.ano, values.funcao, ...EXTRA_COLUMNS.map(k => values[k]), emissao, aprovada, matricula || null, data.situacao, new Date().toISOString(), id, revision(data.revisao)).run();
  } catch (error) {
    if (/UNIQUE constraint/i.test(String(error.message) + " " + String(error.cause?.message))) throw new HttpError(409, "Essa matrícula já pertence a outro cadastro.");
    throw error;
  }
  await checkChange(db, id, result);
  return json(await member(db, id));
}

async function photo(request, db, id) {
  if (request.method === "GET") {
    const result = await db.prepare("SELECT foto,revisao FROM membros WHERE id=? AND foto IS NOT NULL").bind(id).first();
    const expected = request.headers.get("X-Revisao");
    if (expected && String(result?.revisao) !== expected) throw new HttpError(409,"A ficha mudou durante a montagem. Atualize o lote e gere o PDF novamente.");
    if (!result) throw new HttpError(404, "Este cadastro ainda não tem uma foto.");
    return new Response(new Uint8Array(result.foto), { headers: { ...SAFETY_HEADERS, "Content-Type": "image/jpeg", "Content-Disposition": 'inline; filename="foto-membro.jpg"' } });
  }
  requireMethod(request, "PUT");
  const rev = revision(request.headers.get("X-Revisao"));
  if (request.headers.get("Content-Type") !== "image/jpeg") throw new HttpError(415, "Escolha uma foto compatível.");
  const bytes = await readBytes(request, PHOTO_LIMIT);
  const size = bytes.length;
  if (size < 32 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes[size - 2] !== 255 || bytes[size - 1] !== 217) {
    throw new HttpError(422, "Não foi possível reconhecer a foto em JPEG.");
  }
  const result = await db.prepare("UPDATE membros SET foto=?,atualizado_em=?,revisao=revisao+1 WHERE id=? AND revisao=?")
    .bind(bytes.buffer, new Date().toISOString(), id, rev).run();
  await checkChange(db, id, result);
  return json(await member(db, id));
}

const SELECT_MODELO = "SELECT m.revisao,m.configuracao,m.pagina_frente,m.pagina_verso,m.pagina_verso2,m.frente,m.verso,m.verso2,f.tipo AS tipo_frente,v.tipo AS tipo_verso,v2.tipo AS tipo_verso2 FROM modelo_carteirinha m LEFT JOIN artes_carteirinha f ON f.chave=m.frente LEFT JOIN artes_carteirinha v ON v.chave=m.verso LEFT JOIN artes_carteirinha v2 ON v2.chave=m.verso2 WHERE m.id=1";
const CHAVE_ARTE = /^[0-9a-f]{64}$/;
const TAMANHO_BLOCO = 384 * 1024;

function modeloDaLinha(row) {
  if (!row) throw new HttpError(503, "A secretaria precisa aplicar a atualização do banco de carteirinhas.");
  return {
    revisao: row.revisao,
    config: row.revisao ? completarModelo(JSON.parse(row.configuracao)) : modeloInicial(),
    frente: row.frente ? { chave:row.frente, pagina:row.pagina_frente, tipo:row.tipo_frente } : null,
    verso: row.verso ? { chave:row.verso, pagina:row.pagina_verso, tipo:row.tipo_verso } : null,
    verso2: row.verso2 ? { chave:row.verso2, pagina:row.pagina_verso2, tipo:row.tipo_verso2 } : null
  };
}

function tipoDaArte(bytes) {
  if (bytes.length < 16) return "";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  if (new TextDecoder().decode(bytes.slice(0,5)) === "%PDF-") return "application/pdf";
  return "";
}

function base64DeBloco(bytes) {
  let chars = "";
  for (let i=0;i<bytes.length;i+=8192) chars += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(chars);
}

async function receberArte(request, db) {
  requireMethod(request, "POST");
  const bytes = await readBytes(request, LIMITE_ARTE);
  const tipo = tipoDaArte(bytes);
  if (!tipo || request.headers.get("Content-Type") !== tipo) throw new HttpError(415, "Envie a arte em PDF, PNG ou JPEG.");
  const chave = hex(await crypto.subtle.digest("SHA-256", bytes));
  const now = Math.floor(Date.now()/1000);
  const cleanup = db.prepare("DELETE FROM artes_carteirinha WHERE criada_em < ? AND NOT EXISTS (SELECT 1 FROM modelo_carteirinha WHERE frente=artes_carteirinha.chave OR verso=artes_carteirinha.chave OR verso2=artes_carteirinha.chave)").bind(now-86400);
  const statements = [cleanup, db.prepare("INSERT INTO artes_carteirinha(chave,tipo,tamanho,criada_em) VALUES(?,?,?,?) ON CONFLICT(chave) DO UPDATE SET criada_em=excluded.criada_em").bind(chave,tipo,bytes.length,now)];
  for (let i=0;i<bytes.length;i+=TAMANHO_BLOCO) {
    const text = base64DeBloco(bytes.subarray(i,i+TAMANHO_BLOCO));
    statements.push(db.prepare("INSERT OR IGNORE INTO partes_arte_carteirinha(arte,parte,conteudo) VALUES(?,?,?)").bind(chave,i/TAMANHO_BLOCO,text));
  }
  await db.batch(statements);
  return json({ chave, tipo, tamanho:bytes.length },201);
}

async function lerArte(request, db, chave) {
  requireMethod(request, "GET");
  if (!CHAVE_ARTE.test(chave)) throw new HttpError(404, "Arte indisponível.");
  const [metadata,parts] = await db.batch([
    db.prepare("SELECT tipo,tamanho FROM artes_carteirinha WHERE chave=?").bind(chave),
    db.prepare("SELECT conteudo FROM partes_arte_carteirinha WHERE arte=? ORDER BY parte").bind(chave)
  ]);
  const meta = metadata.results[0];
  if (!meta) throw new HttpError(404, "Arte indisponível. Carregue o arquivo novamente.");
  const bytes = new Uint8Array(meta.tamanho);
  let offset=0;
  for (const part of parts.results) {
    const decoded=atob(part.conteudo);
    for (let i=0;i<decoded.length;i++) bytes[offset++]=decoded.charCodeAt(i);
  }
  if (offset !== bytes.length) throw new Error("Arte incompleta");
  return new Response(bytes,{ headers:{ ...SAFETY_HEADERS,"Content-Type":meta.tipo,"Content-Disposition":"attachment" } });
}

async function confirmarLado(db, side) {
  if (!side || !CHAVE_ARTE.test(side.chave) || !Number.isSafeInteger(side.pagina) || side.pagina < 1 || side.pagina > 2) throw new HttpError(422, "Carregue a arte do lado indicado.");
  const meta = await db.prepare("SELECT tipo FROM artes_carteirinha WHERE chave=?").bind(side.chave).first();
  if (!meta || (meta.tipo !== "application/pdf" && side.pagina !== 1)) throw new HttpError(422, "A arte selecionada não está disponível para este lado.");
}

async function modeloDaSecretaria(request, db) {
  if (request.method === "GET") return json(modeloDaLinha(await db.prepare(SELECT_MODELO).first()));
  requireMethod(request, "PUT");
  const data = await readJson(request);
  if (!Number.isSafeInteger(data.revisao) || data.revisao<0) throw new HttpError(422, "Reabra o modelo antes de salvar.");
  try { conferirModelo(data.config, Boolean(data.verso || data.verso2)); }
  catch (error) { throw new HttpError(422,error.message); }
  await confirmarLado(db,data.frente);
  if (data.verso) await confirmarLado(db,data.verso);
  if (data.verso2) await confirmarLado(db,data.verso2);
  const [updated, saved] = await db.batch([
    db.prepare("UPDATE modelo_carteirinha SET revisao=revisao+1,configuracao=?,frente=?,pagina_frente=?,verso=?,pagina_verso=?,verso2=?,pagina_verso2=? WHERE id=1 AND revisao=?")
      .bind(JSON.stringify(data.config),data.frente.chave,data.frente.pagina,data.verso?.chave || null,data.verso?.pagina || 1,data.verso2?.chave || null,data.verso2?.pagina || 1,data.revisao),
    db.prepare(SELECT_MODELO)
  ]);
  if (!updated.meta.changes) throw new HttpError(409, "A arte foi alterada em outra sessão. Recarregue a página para abrir a versão salva.");
  return json(modeloDaLinha(saved.results[0]));
}

async function fichasParaImpressao(request, db) {
  requireMethod(request,"POST");
  const data = await readJson(request);
  const situacao = data.situacao || "";
  if (situacao && !Object.hasOwn(SITUACOES,situacao)) throw new HttpError(422, "Selecione uma situação válida.");
  const sql = "SELECT id,protocolo,nome,matricula,funcao,ano,telefone," + EXTRA_COLUMNS.join(",") + ",emissao,funcao_aprovada,revisao,foto IS NOT NULL AS tem_foto FROM membros" + (situacao ? " WHERE situacao=?" : "") + " ORDER BY nome_busca,ordem";
  const [model,records] = await db.batch([db.prepare(SELECT_MODELO),situacao ? db.prepare(sql).bind(situacao) : db.prepare(sql)]);
  const saved = modeloDaLinha(model.results[0]);
  if (!saved.frente) throw new HttpError(422, "Salve a arte definitiva para preparar o lote.");
  if (data.revisao !== saved.revisao) throw new HttpError(409, "O modelo foi atualizado. Recarregue a página antes de exportar.");
  const prontas=[], pendentes=[];
  const hoje = hojeSP();
  for (const ficha of records.results) {
    // Sem data de emissão registrada, a carteirinha sai com a data da impressão.
    ficha.emissao ||= hoje;
    const faltam = pendenciasDaFicha(saved.config.campos,ficha);
    if (!ficha.funcao_aprovada) faltam.push("Cargo confirmado pela secretaria");
    const verso = versoDaFuncao(ficha.funcao);
    if ((saved.verso || saved.verso2) && !saved[verso]) faltam.push(verso === "verso" ? "Arte do verso de Presbítero, Evangelista e Pastores" : "Arte do verso dos demais cargos");
    if (faltam.length) pendentes.push({ nome:ficha.nome,protocolo:ficha.protocolo,faltam });
    else {
      if (saved.config.campos.telefone.lado === "oculto") delete ficha.telefone;
      prontas.push(ficha);
    }
  }
  return json({ revisao:saved.revisao, prontas, pendentes });
}


function senhaValida(secret) {
  return typeof secret === "string" && secret.length >= 16 && secret.length <= 256;
}

// Usada quando o segredo SENHA_SECRETARIA não foi definido no painel do Cloudflare.
async function senhaDoBanco(db) {
  try {
    const row = await db.prepare("SELECT valor FROM configuracao WHERE chave='senha_secretaria'").first();
    return row?.valor;
  } catch {
    return undefined;
  }
}

async function handle(request, env, url) {
  methodOrigin(request, url);
  const db = env.MEMBROS_DB;
  let secret = env.SENHA_SECRETARIA;
  if (db && !senhaValida(secret)) secret = await senhaDoBanco(db);
  if (!db || typeof secret !== "string" || secret.length < 16 || secret.length > 256) throw new HttpError(503, "O cadastro está temporariamente indisponível. Tente novamente mais tarde.");
  const path = url.pathname;
  if (path === "/api/pronto") {
    requireMethod(request, "GET");
    await db.batch([
      db.prepare("SELECT id, revisao, foto FROM membros LIMIT 0"),
      db.prepare("SELECT chave FROM limites LIMIT 0"),
      db.prepare("SELECT chave FROM sessoes LIMIT 0"),
      db.prepare("SELECT revisao FROM modelo_carteirinha WHERE id=1")
    ]);
    return json({ pronto: true });
  }
  const key = await secretKey(secret);
  if (path === "/api/cadastros") return submit(request, db, key);
  if (path === "/api/secretaria/entrar") return signIn(request, db, secret, key);
  if (!path.startsWith("/api/secretaria/")) throw new HttpError(404, "Página não encontrada.");
  const session = await authorize(request, db, key);
  if (path === "/api/secretaria/carteirinhas/modelo") return modeloDaSecretaria(request,db);
  if (path === "/api/secretaria/carteirinhas/artes") return receberArte(request,db);
  if (path.startsWith("/api/secretaria/carteirinhas/artes/")) return lerArte(request,db,path.slice("/api/secretaria/carteirinhas/artes/".length));
  if (path === "/api/secretaria/carteirinhas/lote") return fichasParaImpressao(request,db);
  if (path === "/api/secretaria/sessao") {
    requireMethod(request, "GET");
    return json({ ok: true });
  }
  if (path === "/api/secretaria/sair") {
    requireMethod(request, "POST");
    await db.prepare("DELETE FROM sessoes WHERE chave=?").bind(session).run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
  }
  if (path === "/api/secretaria/lista") return listMembers(request, db);
  if (path === "/api/secretaria/exportar") return exportMembers(request, db);
  const match = /^\/api\/secretaria\/membros\/([^/]+)(\/foto)?$/.exec(path);
  if (!match || !UUID.test(match[1])) throw new HttpError(404, "Página não encontrada.");
  const id = match[1];
  if (match[2]) return photo(request, db, id);
  if (request.method === "GET") return json(await member(db, id));
  if (request.method === "PATCH") return updateMember(request, db, id);
  if (request.method === "DELETE") {
    const data = await readJson(request);
    const result = await db.prepare("DELETE FROM membros WHERE id=? AND revisao=?").bind(id, revision(data.revisao)).run();
    await checkChange(db, id, result);
    return json({ ok: true });
  }
  throw new HttpError(405, "Método indisponível.", undefined, { Allow: "GET, PATCH, DELETE" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    // Identifica a implantação atual; as páginas abertas comparam para avisar sobre atualização.
    if (url.pathname === "/api/versao") return json({ versao: env.CF_VERSION_METADATA?.id || "local" });
    try {
      return await handle(request, env, url);
    } catch (error) {
      if (error instanceof HttpError) return json({ erro: error.message, campos: error.fields }, error.status, error.headers);
      console.error("Falha interna no serviço de cadastros.");
      return json({ erro: "O serviço não pôde concluir esta operação. Tente novamente. Se o problema continuar, procure a secretaria." }, 503);
    }
  }
};

