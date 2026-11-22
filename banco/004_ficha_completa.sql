-- Campos da ficha de membro da Missão Resgate: nascimento, batismo, filiação,
-- estado civil, documentos, naturalidade e data de emissão da carteirinha.
-- Execute uma única vez em cada banco. Datas ficam como AAAA-MM-DD.
ALTER TABLE membros ADD COLUMN nascimento TEXT;
ALTER TABLE membros ADD COLUMN batismo TEXT;
ALTER TABLE membros ADD COLUMN pai TEXT;
ALTER TABLE membros ADD COLUMN mae TEXT;
ALTER TABLE membros ADD COLUMN estado_civil TEXT;
ALTER TABLE membros ADD COLUMN rg TEXT;
ALTER TABLE membros ADD COLUMN cpf TEXT;
ALTER TABLE membros ADD COLUMN naturalidade TEXT;
ALTER TABLE membros ADD COLUMN emissao TEXT;
