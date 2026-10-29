# Relatórios SCC: uso local e homologação

Esta funcionalidade acrescenta Financeiro, Produtos, Comissão, Caixa, Auditoria e Notas assinadas ao painel. O código, o importador fictício e os PDFs existem no repositório local. **Isso não confirma que a mudança foi publicada, que as migrations foram aplicadas em algum banco ou que os números foram homologados com a SCC.** A execução real das migrations no PostgreSQL local continua pendente porque o Supabase não iniciou neste ambiente.

O painel não inventa valores oficiais. Se a SCC não enviar um campo, aparece “Não informado pela SCC”. Em Notas assinadas, a interface mostra somente o código do cliente. O resumo de público só mostra contagens agregadas.

## Massa fictícia sem rede

Na raiz do repositório, com Node.js 22 e dependências instaladas, gere o arquivo completo e valide-o sem abrir conexão de rede:

```sh
node --import tsx scripts/gerar-relatorios-ficticios.ts --saida /tmp/food-relatorios.json
node --import tsx scripts/importar-relatorios.ts --arquivo /tmp/food-relatorios.json --dry-run
```

O retorno esperado é apenas uma contagem (`12` fotografias, `30` linhas, `12` páginas). As datas são `2026-02-14` e `2026-02-15`; as linhas, nomes e códigos da amostra são fictícios. O gerador falha se o arquivo já existir: escolha outro caminho ou remova manualmente somente o arquivo local que você criou.

Há cenários separados para ausência de movimento e período parcialmente recebido:

```sh
node --import tsx scripts/gerar-relatorios-ficticios.ts --cenario dia-vazio --saida /tmp/food-relatorios-vazio.json
node --import tsx scripts/importar-relatorios.ts --arquivo /tmp/food-relatorios-vazio.json --dry-run
node --import tsx scripts/gerar-relatorios-ficticios.ts --cenario periodo-parcial --saida /tmp/food-relatorios-parcial.json
node --import tsx scripts/importar-relatorios.ts --arquivo /tmp/food-relatorios-parcial.json --dry-run
```

O cenário vazio representa `2026-02-16`. O parcial contém apenas Produtos em `2026-02-17` e Financeiro em `2026-02-18`. A saída `dry-run` valida arquivo e limites; não comprova banco, RLS, transporte HTTP nem idempotência.

## Importar no Supabase local

Inicie o Supabase local (`npx supabase start`) e siga [Rodar localmente](../../README.md#rodar-localmente) para configurar `.env.local` e criar os acessos locais (`npm run local:acesso`). Pelo admin local, crie um restaurante de teste exclusivo, gere o token dessa casa e crie o acesso de login para ela. Não use a casa de demonstração, a nuvem nem dados recebidos de clientes. Depois, siga [Importar relatórios fictícios no ambiente local](../integracao-scc/importar-relatorios-local.md) para preparar `.env.relatorios-local`, iniciar `receber-relatorios` e importar o arquivo.

As variáveis locais são `RF_RELATORIOS_URL=http://127.0.0.1:54321/functions/v1/receber-relatorios` e `RF_RELATORIOS_TOKEN=<token-local>`. Para que a função de desenvolvimento aceite a marca `natureza=simulacao`, configure `RF_PERMITIR_SIMULACAO=1` **somente no arquivo local ignorado usado pela função**. Essa opção não deve ser adicionada à configuração de produção.

Com Supabase e função local ativos, abra o painel em `http://127.0.0.1:3000`, entre com o acesso local associado ao restaurante e visite:

```text
/r/<slug-local>/relatorios/produtos?inicio=2026-02-14&fim=2026-02-15&fonte=historico
/r/<slug-local>/relatorios/comissao?inicio=2026-02-14&fim=2026-02-15&fonte=historico
/r/<slug-local>/relatorios/caixa?inicio=2026-02-14&fim=2026-02-15&fonte=historico
/r/<slug-local>/relatorios/auditoria?inicio=2026-02-14&fim=2026-02-15&fonte=historico
/r/<slug-local>/relatorios/notas-assinadas?inicio=2026-02-14&fim=2026-02-15&fonte=historico
/r/<slug-local>/relatorios/financeiro?inicio=2026-02-14&fim=2026-02-15&fonte=historico
```

Troque `<slug-local>` pelo slug criado apenas no banco local. Para um PDF, use o botão da tela; a rota acrescenta `/pdf` e conserva os filtros. Alterar datas, fonte ou filtros reinicia a paginação. O modo On-line consulta um único dia; Histórico aceita até 366 dias. O PDF comporta até 2.000 linhas; acima disso, a exportação é recusada em vez de produzir arquivo incompleto.

## Como ler os estados e números

- **Sem dados:** a SCC ainda não publicou aquele relatório para o período.
- **Parcial:** existem dias recebidos e dias ausentes; os totais são parciais e o painel lista as datas que faltam.
- **Completo sem linhas:** houve publicação explícita sem movimento ou os filtros não encontraram linhas; isso é diferente de não ter recebido a fotografia.
- **Dados fictícios de demonstração:** o manifesto foi marcado como simulação. O aviso aparece também no PDF.
- **Não informado pela SCC:** o campo chegou como `null` ou não está disponível no relatório; não significa zero.

Os agregados e totais vêm do PostgreSQL. O painel e o PDF exibem a mesma fotografia e não somam totais de páginas. Produtos e Caixa mostram subtotais completos do grupo, mesmo quando as linhas do grupo atravessam páginas. As consultas ficam limitadas por restaurante e pelos filtros de data/fonte.

As fórmulas de comissão e os blocos oficiais do Financeiro continuam dependendo da consulta/exportação e confirmação da SCC. Os dados pessoais de clientes não são coletados para preencher nomes; o código do cliente não deve ser tratado como nome. Não use os exemplos PDF/SQL da SCC como fixture nem carregue os relatórios reais de clientes nesta demonstração.

## Estado de validação e checklist SCC

Validação local de interface/PDF não substitui a execução real de migrations/SQL e a conferência com a origem. Quando o PostgreSQL local estiver disponível, rode as suítes completas de integração e faça um percurso com restaurante local exclusivo: importar a mesma amostra duas vezes e consultar publicações, versões e contagens para comprovar idempotência; testar vazio e parcial; abrir os seis painéis e PDFs em 390 px e desktop, nos temas claro/escuro, incluindo o painel de leitura do admin. Registre apenas o que foi observado.

Antes de qualquer homologação com a SCC:

- [ ] Adaptar o emissor SCC ao [contrato de relatórios v1](../integracao-scc/contrato-relatorios-v1.md), incluindo origem on-line/histórico e fotografia completa.
- [ ] Receber e confirmar consultas/fórmulas oficiais de Comissão e Financeiro.
- [ ] Confirmar o significado e a chave dos registros de Caixa/Auditoria e datas do movimento.
- [ ] Importar uma fotografia autorizada em ambiente de teste isolado.
- [ ] Conferir filtros e totais centavo a centavo com os relatórios de origem.
- [ ] Executar as suítes PostgreSQL/HTTP, inspeção visual e exportação PDF completa antes de declarar homologação.

**Estado atual:** a importação HTTP local, a idempotência no PostgreSQL e a inspeção visual ainda não foram confirmadas neste ambiente. Não afirmar integração SCC concluída, publicação ou prontidão para clientes até completar o checklist e aprovar separadamente qualquer publicação.
