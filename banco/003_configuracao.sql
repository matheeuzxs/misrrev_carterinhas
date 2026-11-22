-- Opcional. Guarda a senha da secretaria no banco quando o segredo
-- SENHA_SECRETARIA não estiver definido no painel do Cloudflare.
-- Se o segredo existir no painel, ele tem prioridade.
CREATE TABLE IF NOT EXISTS configuracao (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
