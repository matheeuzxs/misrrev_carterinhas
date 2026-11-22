export const CAMPOS_CARTAO = { nome: "Nome", matricula: "Matrícula", funcao: "Função", ano: "Membro desde", telefone:"Telefone", foto: "Foto",
  batismo: "Data de batismo", pai: "Pai", mae: "Mãe", nascimento: "Data de nascimento", estado_civil: "Estado civil",
  rg: "RG", cpf: "CPF", emissao: "Data de emissão", naturalidade: "Natural de" };
export const LIMITE_ARTE = 6 * 1024 * 1024;

export function modeloInicial() {
  const field = (lado, x, y, w, h, pt = 9) => ({ lado, x, y, w, h, pt, cor: "#14233b", fonte: "sans", negrito: false, alinhar: "esquerda" });
  return { largura: 85.6, altura: 54, sangria: 0, campos: {
    nome: { ...field("frente", 6, 20, 52, 11, 13), negrito: true },
    matricula: field("frente", 6, 36, 26, 6),
    funcao: field("frente", 6, 31, 48, 5),
    ano: field("oculto", 34, 36, 18, 6),
    telefone: field("oculto", 6, 43, 42, 6),
    foto: field("frente", 61, 13, 19, 25),
    batismo: field("oculto", 6, 8, 30, 5, 8),
    pai: field("oculto", 6, 14, 60, 5, 8),
    mae: field("oculto", 6, 20, 60, 5, 8),
    nascimento: field("oculto", 6, 26, 30, 5, 8),
    estado_civil: field("oculto", 40, 26, 30, 5, 8),
    rg: field("oculto", 6, 32, 30, 5, 8),
    cpf: field("oculto", 40, 32, 30, 5, 8),
    emissao: field("oculto", 6, 38, 30, 5, 8),
    naturalidade: field("oculto", 6, 44, 60, 5, 8)
  }};
}

// Modelos salvos antes dos campos novos recebem os campos que faltam, ocultos.
export function completarModelo(model) {
  const base = modeloInicial();
  return { ...base, ...model, campos: { ...base.campos, ...(model?.campos || {}) } };
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

