CREATE TABLE IF NOT EXISTS membros (
  ordem INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  solicitacao TEXT NOT NULL UNIQUE,
  resumo_envio TEXT NOT NULL,
  protocolo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  nome_busca TEXT NOT NULL,
  telefone TEXT NOT NULL,
  ano INTEGER,
  funcao TEXT NOT NULL,
  matricula TEXT,
  situacao TEXT NOT NULL DEFAULT 'recebido' CHECK (situacao IN ('recebido','conferido','emitido')),
  consentimento_versao TEXT NOT NULL,
  recebido_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  revisao INTEGER NOT NULL DEFAULT 1,
  foto BLOB
);

CREATE INDEX IF NOT EXISTS membros_situacao_ordem ON membros(situacao, ordem);
CREATE UNIQUE INDEX IF NOT EXISTS membros_matricula_unica ON membros(CAST(matricula AS INTEGER)) WHERE matricula IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessoes (
  chave TEXT PRIMARY KEY,
  expira INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_expiram ON sessoes(expira);

CREATE TABLE IF NOT EXISTS limites (
  chave TEXT PRIMARY KEY,
  tentativas INTEGER NOT NULL,
  expira INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS limites_expiram ON limites(expira);

