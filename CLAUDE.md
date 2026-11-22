# Continuidade do cadastro da MISRREV

O Thiago vai publicar este portal de membros da Missão Resgate Restaurando Vidas no Cloudflare. O projeto já traz o formulário, a secretaria, o banco e um ZIP de publicação. Use o arquivo `LEIA-ME.md` como roteiro.

## O que publicar

O destino é **Cloudflare Pages com Direct Upload**. O backend já está preparado em modo avançado. Crie ou use o projeto Pages escolhido pelo Thiago e envie **PUBLICAR_NO_CLOUDFLARE.zip**. Em uma implantação por integração Git, o diretório de saída correspondente é `site` e o comando de preparação é `npm run preparar`.

A produção precisa de um D1 dedicado com `banco/001_cadastros.sql` e depois `banco/002_carteirinhas.sql`, do vínculo **MEMBROS_DB** e do segredo **SENHA_SECRETARIA**. Peça ao Thiago para definir o valor no campo seguro do painel do Cloudflare. Após configurar ambos em **Production**, implante o pacote novamente.

## O que verificar

Confirme `/api/pronto`, o recebimento de um cadastro fictício no banco, a exibição do protocolo ao membro e a recuperação da mesma ficha em outro navegador pela secretaria. Verifique a edição da matrícula, o anexo e o download de uma foto de teste e a exportação CSV. Em **Carteirinhas para impressão**, valide o envio da arte definitiva, a prova individual e o PDF em lote. Depois remova o cadastro fictício. Entregue ao Thiago os endereços de produção do formulário, da secretaria e da tela de carteirinhas.

## Se houver ajustes

A origem da API é `backend/worker.mjs`. A validação compartilhada fica em `site/assets/dados.js`. Preserve a logo original, o português do Brasil e o fluxo em que Julia confere os dados e Matheus tira a foto. Use `npm test` para testar e `python3 ferramentas/empacotar.py` para gerar o novo pacote de upload. A pasta `dados-locais/` é exclusiva de desenvolvimento.

## Atualização da versão anterior

Use o mesmo projeto Pages e o mesmo D1 com os membros existentes. Execute somente `banco/002_carteirinhas.sql` nesse banco e reimplante o ZIP de publicação. A arte que aparece no formulário público é ilustrativa. A equipe define a arte usada na impressão em `/secretaria/carteirinhas/`.
