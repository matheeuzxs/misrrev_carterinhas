export const CAMPOS_CARTAO = { nome: "Nome", matricula: "Matrícula", funcao: "Função", ano: "Membro desde", telefone:"Telefone", foto: "Foto",
  batismo: "Data de batismo", pai: "Pai", mae: "Mãe", nascimento: "Data de nascimento", estado_civil: "Estado civil",
  rg: "RG", cpf: "CPF", emissao: "Data de emissão", naturalidade: "Natural de" };
export const LIMITE_ARTE = 6 * 1024 * 1024;

export function modeloInicial() {
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
export function completarModelo(model) {
  const base = modeloInicial();
  const faltantes = Object.fromEntries(Object.entries(base.campos).map(([k, c]) => [k, { ...c, lado: "oculto" }]));
  return { ...base, ...model, campos: { ...faltantes, ...(model?.campos || {}) } };
}

function medida(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

// As posições partem do canto superior esquerdo do tamanho de corte, em mm.
export function conferirModelo(model, comVerso) {
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

export function pendenciasDaFicha(campos, ficha) {
  return Object.keys(CAMPOS_CARTAO).filter(k => campos[k].lado !== "oculto" && !(k === "foto" ? ficha.tem_foto : ficha[k])).map(k => CAMPOS_CARTAO[k]);
}

