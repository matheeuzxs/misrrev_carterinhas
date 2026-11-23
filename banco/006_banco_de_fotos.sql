-- Banco de fotos: fotos enviadas sem dono. Ao escolher a pessoa, a foto vai
-- para a ficha do membro e sai daqui.
CREATE TABLE IF NOT EXISTS fotos_avulsas (
  id TEXT PRIMARY KEY,
  nome_arquivo TEXT NOT NULL,
  foto BLOB NOT NULL,
  criada_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fotos_avulsas_criadas ON fotos_avulsas(criada_em);
