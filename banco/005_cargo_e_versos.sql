-- Cargo escolhido pelo membro, aprovação do cargo pela secretaria e
-- segundo verso da carteirinha (demais cargos). Execute uma única vez.
ALTER TABLE membros ADD COLUMN funcao_solicitada TEXT;
ALTER TABLE membros ADD COLUMN funcao_aprovada INTEGER NOT NULL DEFAULT 0;
ALTER TABLE modelo_carteirinha ADD COLUMN verso2 TEXT REFERENCES artes_carteirinha(chave);
ALTER TABLE modelo_carteirinha ADD COLUMN pagina_verso2 INTEGER NOT NULL DEFAULT 1;
