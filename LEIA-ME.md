# Cadastro de membros da MISRREV

Este projeto recebe os dados para as carteirinhas da Missão Resgate Restaurando Vidas. O endereço inicial abre o formulário de membros com uma carteirinha ilustrativa. A equipe entra em `/secretaria/` para conferir as fichas e em **Carteirinhas para impressão** para carregar a arte definitiva e gerar o PDF.

## Continuar no Claude

Anexe o ZIP completo ao Claude e envie esta mensagem.

> Leia o CLAUDE.md deste projeto e me ajude a publicá-lo no Cloudflare Pages com o banco D1 e a senha da secretaria. Use o pacote de publicação que já vem pronto e valide o cadastro de ponta a ponta.

## Publicação no Cloudflare

1. No painel do Cloudflare, abra **D1 SQL Database** e crie um banco dedicado. O nome sugerido é `misrrev-membros`.
2. Abra o **Console** desse banco e execute, nesta ordem, `banco/001_cadastros.sql` e `banco/002_carteirinhas.sql`. Para atualizar um banco da primeira versão, aplique somente `002_carteirinhas.sql` no mesmo banco existente. Se o painel aceitar uma instrução por vez, execute cada instrução completa, na ordem do arquivo. Elas podem ser reaplicadas ao mesmo banco.
3. Em **Workers & Pages**, escolha **Create application**, depois **Pages** e a opção de upload direto. Envie o arquivo interno **PUBLICAR_NO_CLOUDFLARE.zip** e crie o projeto. Os arquivos do site já estão na raiz desse ZIP.
4. Nas configurações de **Production** do projeto Pages, abra **Settings → Bindings**, adicione um banco D1 com o nome exato **MEMBROS_DB** e selecione o banco que você preparou.
5. Em **Settings → Variables and Secrets**, crie o segredo **SENHA_SECRETARIA**. Escolha **Encrypt** ou o tipo **Secret** e defina uma senha exclusiva, de 16 a 256 caracteres, que será usada pela equipe. Guarde o valor com a igreja.
6. Crie uma nova implantação de **Production** no mesmo projeto e envie novamente **PUBLICAR_NO_CLOUDFLARE.zip** para ativar o vínculo e o segredo.
7. Abra `/api/pronto` no endereço publicado. A resposta esperada é `{"pronto":true}`. Depois, faça a verificação abaixo antes de divulgar o formulário aos membros.

O pacote de publicação contém o site e a função da API em `_worker.js`. A pasta `site/` contém os mesmos arquivos em formato editável. A pasta do banco, as ferramentas, os testes e as instruções ficam no pacote completo, fora do diretório público.

Referências oficiais do Cloudflare. [Upload direto no Pages](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [Banco D1 e segredos no Pages](https://developers.cloudflare.com/pages/functions/bindings/) · [Console do D1](https://developers.cloudflare.com/d1/get-started/).

## Verificação depois de publicar

1. Abra a página inicial em um celular. Envie um cadastro fictício com nome e telefone de teste e anote o protocolo mostrado.
2. Em outro navegador, abra `/secretaria/`, entre com a senha e busque o protocolo. A ficha deve aparecer com a situação **Recebido**.
3. Abra a ficha, complete a matrícula, salve como **Conferido** e anexe uma imagem de teste. Baixe o JPEG e exporte o CSV filtrado por **Conferido**.
4. Abra **Carteirinhas para impressão**, salve uma arte de teste, baixe a prova e gere um lote. Confira tamanho, frente, verso e marca de corte.
5. Exclua a ficha fictícia pelo painel quando terminar e saia da secretaria. Em uma janela privada, abra `/api/secretaria/sessao` para verificar que a sessão é exigida.

## Uso pela igreja

O formulário pede nome completo, telefone com DDD e função na igreja. O ano de ingresso é opcional. O membro revisa as informações, autoriza o uso e recebe um protocolo. O protocolo permite à Julia localizar a ficha na secretaria.

Na ficha, a equipe corrige os dados, informa a matrícula já adotada pela igreja e acompanha as situações **Recebido**, **Conferido** e **Emitido**. A marcação **Emitido** exige matrícula. O número pode ter zeros à esquerda.

Matheus tira a foto na igreja. A equipe pode anexar um JPEG, PNG ou WebP de até 20 MB. O navegador prepara um JPEG proporcional, com até 1.000 pixels no lado maior e 480 KiB, antes de enviar. A foto fica no banco e é baixada pela secretaria com a matrícula ou o protocolo no nome do arquivo.

**Exportar CSV** usa a busca e a situação aplicadas na lista e inclui todas as páginas do resultado. O arquivo usa UTF-8 com BOM e ponto e vírgula como separador. Para conservar zeros à esquerda no Excel ou LibreOffice, importe a coluna **Matrícula** como texto. O JPEG também pode ser baixado pela ficha de cada membro. Para receber o lote pronto para imprimir, use a tela **Carteirinhas para impressão**.

## Arte definitiva e PDF

1. Na secretaria, abra **Carteirinhas para impressão** e escolha a arte de frente em PDF, PNG ou JPEG. A arte deve conter o fundo fixo, sem nomes ou fotos de membros. O verso é opcional. Um PDF de duas páginas usa a primeira para a frente e a segunda para o verso. Cada arquivo pode ter até 6 MiB.
2. Informe a largura e a altura finais, depois do corte, e a sangria por lado. O padrão editável é **85,6 × 54 mm**, sem sangria. Se sua arte tem 3 mm de cada lado, informe 3 mm e envie a arte com a área adicional incluída. Nesse exemplo, o arquivo com sangria mede 91,6 × 60 mm. Para imagens a 300 ppi, isso corresponde a cerca de 1.082 × 709 pixels com sangria. No PDF, o site usa a caixa de corte para 0 mm e a caixa de sangria quando há sangria configurada. A área aparente da página é usada se essas caixas estiverem ausentes. Exporte PDFs de arte fechados, com fontes incorporadas e sem anotações ou campos interativos.
3. Selecione Nome, Matrícula, Função, Membro desde, Telefone ou Foto. O telefone começa oculto. Defina frente, verso ou oculto para cada campo. Clique na prévia para mover o centro da caixa ou informe as coordenadas a partir do topo e da esquerda da área de corte. Ajuste largura, altura, cor e tipografia conforme a arte. A foto preenche sua caixa pelo centro. A linha de seleção aparece apenas no editor.
4. Clique em **Salvar arte definitiva**. O modelo e os arquivos ficam no banco da secretaria. A equipe pode substituí-los no mesmo painel, inclusive depois de receber os cadastros. O exemplo da página pública continua identificado como ilustrativo.
5. Em **Lote de impressão**, consulte a contagem e as pendências. Por padrão, entram todas as fichas que têm os campos visíveis no modelo preenchidos, de todas as situações e de todas as páginas da lista. Para limitar o lote, selecione uma situação. A foto e o ano só são exigidos para impressão quando estão ativos na arte. Use **Atualizar lista** após corrigir as fichas.
6. Baixe **Prova com a primeira ficha** para conferir o resultado com dados reais. Escolha A4, A3, SRA3 ou tamanho individual, configure as marcas de corte e use **Exportar todas em PDF**. A exportação usa o modelo salvo e as fichas prontas. O estado de emissão continua sob controle da secretaria.

Nas folhas montadas, a área útil reserva pelo menos 5 mm nas bordas e 4 mm entre artes. O PDF intercala frente e verso de cada folha e reposiciona as carteirinhas conforme a borda de virada, inclusive na última folha incompleta. Configure a mesma virada no equipamento, selecione **tamanho real / 100%** e faça uma folha de prova. No formato individual, cada face tem sua página com caixas de corte e sangria. Fundos em PDF são incorporados como página, preservando os elementos vetoriais do arquivo. As imagens mantêm a resolução enviada.

## Atualizar uma instalação existente

Mantenha o projeto Pages, o banco D1, o vínculo `MEMBROS_DB` e o segredo existentes. Aplique `banco/002_carteirinhas.sql` ao banco atual e envie o novo `PUBLICAR_NO_CLOUDFLARE.zip` ao mesmo projeto. A migração acrescenta as tabelas da arte. Os cadastros e as fotos já recebidos continuam disponíveis para o lote.

## Abrir no computador para desenvolver

Use Node.js 24 ou superior. Na pasta que contém `package.json`, rode os comandos abaixo. O projeto usa apenas os módulos incluídos no Node.

```sh
npm test
npm start
```

Abra o endereço local impresso no terminal. O terminal também mostra uma senha aleatória de teste. Para manter uma senha local de sua escolha, defina `SENHA_SECRETARIA` no ambiente antes de iniciar. Os cadastros locais ficam em `dados-locais/cadastros.sqlite`. Use dados fictícios neste ambiente.

## Arquivos de trabalho

| Caminho | Uso |
| --- | --- |
| `site/index.html` e `site/assets/cadastro.js` | Formulário público, revisão e protocolo |
| `site/secretaria/index.html` e `site/assets/secretaria.js` | Painel da equipe e anexos |
| `site/assets/base.css` e `site/assets/secretaria.css` | Interface e regras para celular e computador |
| `site/assets/dados.js` | Validação, telefone e texto de autorização compartilhados |
| `backend/worker.mjs` | API, sessões, consultas, exportação e fotos |
| `banco/001_cadastros.sql` e `002_carteirinhas.sql` | Cadastros, arte definitiva e posições dos campos |
| `site/assets/impressao/` | Editor, formação do lote e geração do PDF |
| `site/_worker.js` | Versão do backend preparada para o upload direto do Pages |

Depois de alterar a API ou a validação, execute `npm run preparar`. Para atualizar o pacote de publicação após qualquer alteração, rode `python3 ferramentas/empacotar.py` ou, no Windows, `py ferramentas/empacotar.py`. O script usa Node.js e Python 3, recria o Worker e compacta apenas o conteúdo de `site/`. Também é possível executar `npm run preparar` e compactar manualmente o conteúdo de `site/`, com `index.html` e `_worker.js` na raiz.

A arte usa a logo da MISRREV e o vitral azul da igreja. As fontes DM Sans e Instrument Serif são servidas pelo próprio site. As licenças acompanham os arquivos em `site/assets/fontes/`.
