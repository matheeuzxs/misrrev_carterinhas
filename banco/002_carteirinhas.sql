CREATE TABLE IF NOT EXISTS artes_carteirinha (
  chave TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  criada_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS partes_arte_carteirinha (
  arte TEXT NOT NULL REFERENCES artes_carteirinha(chave) ON DELETE CASCADE,
  parte INTEGER NOT NULL,
  conteudo TEXT NOT NULL,
  PRIMARY KEY (arte, parte)
);
CREATE TABLE IF NOT EXISTS modelo_carteirinha (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  revisao INTEGER NOT NULL,
  configuracao TEXT NOT NULL,
  frente TEXT REFERENCES artes_carteirinha(chave),
  pagina_frente INTEGER NOT NULL DEFAULT 1,
  verso TEXT REFERENCES artes_carteirinha(chave),
  pagina_verso INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO modelo_carteirinha(id,revisao,configuracao) VALUES(1,0,'{}');

