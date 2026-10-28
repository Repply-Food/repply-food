# Importar relatórios fictícios no ambiente local

Os scripts geram somente fantasia e nunca leem os exemplos anexados do cliente.
A amostra padrão cobre os seis relatórios nos dias fixos 14 e 15/02/2026: 12
fotografias, 30 linhas, 12 páginas. `natureza` é sempre `simulacao`.
Os UUIDs, sequências e instantes são fixos para permitir a repetição do arquivo.

## Gerar e validar sem serviços

Na raiz do projeto, com as dependências já instaladas:

```sh
node --import tsx scripts/gerar-relatorios-ficticios.ts --saida /tmp/food-relatorios.json
node --import tsx scripts/importar-relatorios.ts --arquivo /tmp/food-relatorios.json --dry-run
```

O gerador exige um arquivo novo e não sobrescreve outro arquivo. A validação não
consulta a rede e não precisa de URL, banco ou token. Sua única saída de sucesso é:

```json
{"relatorios":12,"linhas":30,"paginas":12}
```

O arquivo contém uma lista de fotografias no contrato canônico
`supabase/functions/_shared/relatorios/schemas.ts`: manifesto sem os totais de
paginação e linhas do respectivo relatório. O importador valida todas as
fotografias e seus limites antes da primeira requisição. As linhas são mantidas
inteiras, com seus decimais e valores `null`; nenhuma ocorrência repetida é removida.
A fotografia financeira aceita zero ou uma linha.

Os outros cenários são arquivos separados:

```sh
node --import tsx scripts/gerar-relatorios-ficticios.ts --cenario dia-vazio --saida /tmp/food-relatorios-vazio.json
node --import tsx scripts/gerar-relatorios-ficticios.ts --cenario periodo-parcial --saida /tmp/food-relatorios-parcial.json
node --import tsx scripts/importar-relatorios.ts --arquivo /tmp/food-relatorios-vazio.json --dry-run
node --import tsx scripts/importar-relatorios.ts --arquivo /tmp/food-relatorios-parcial.json --dry-run
```

O dia vazio é 16/02: seis fotografias, zero linhas, seis páginas vazias explícitas.
O período parcial traz apenas Produtos em 17/02 e Financeiro em 18/02: duas
fotografias, três linhas, duas páginas. A ausência dos demais relatórios nesse
cenário representa cobertura parcial, sem afirmar que eles foram importados vazios.

## Envio para a função local

Requer um Supabase local já disponível, com as migrations do projeto aplicadas.
Use uma casa fictícia própria desse banco, habilitada, com seu próprio token SCC.
Não use a casa/token de demonstração nem produção. O script não cria casa, token,
usuário ou banco e não executa resets.

Crie manualmente `.env.relatorios-local`, ignorado por `.gitignore`, com estas
chaves; preencha o token pelo editor, sem colocá-lo em comando ou argumento:

```dotenv
RF_RELATORIOS_URL=http://127.0.0.1:54321/functions/v1/receber-relatorios
RF_RELATORIOS_TOKEN=
RF_PERMITIR_SIMULACAO=1
```

A função local precisa receber `RF_PERMITIR_SIMULACAO=1`. Em um terminal:

```sh
npx supabase functions serve receber-relatorios --env-file .env.relatorios-local
```

Em outro terminal:

```sh
node --env-file=.env.relatorios-local --import tsx scripts/importar-relatorios.ts --arquivo /tmp/food-relatorios.json
```

Somente URLs HTTP/HTTPS com host `127.0.0.1`, `[::1]` ou `localhost` são aceitas;
`localhost` é convertido para `127.0.0.1`, sem resolução DNS. Credenciais na URL,
consulta, fragmento e redirecionamentos são recusados. O token segue no cabeçalho
Bearer; respostas e erros de rede não são impressos. Falhas mostram apenas
mensagem controlada ou código HTTP, nunca o token ou o conteúdo do arquivo.

Cada fotografia envia suas páginas em ordem e solicita publicação somente depois
de todas serem aceitas. Um HTTP 409 ou outra falha interrompe a execução. A carga
é preparada inteira antes do envio: máximo de 500 linhas e 1 MiB por página,
200 páginas, 100 mil linhas e 32 MiB por fotografia. O tamanho considera UTF-8
e também os espaços de `jsonb::text`, usados no limite do banco. Se o total final
de páginas aumentar o manifesto, o importador recompõe com margem e valida tudo
novamente antes de transmitir. O limite é de cada fotografia, não do arquivo todo.

## Repetição e evidência

Repita exatamente o mesmo comando de envio com o mesmo arquivo. Não altere UUID,
ordem, conteúdo ou sequência entre tentativas. O importador não gera novas
identidades e não faz repetição automática. A primeira execução pode publicar
fotografias anteriores àquela em que ocorreu uma falha; repetir o arquivo permite
retomar pelo protocolo idempotente.

Para conferir a idempotência no banco local, consulte antes e depois da segunda
execução, para a casa e os dias fictícios usados, a revisão da casa em
`relatorio_versoes`, a publicação de cada relatório em `relatorio_publicacoes`,
os manifestos em `relatorio_cargas` e a contagem das linhas em `relatorio_linhas`. A segunda execução deve manter as versões
e as contagens. Saída de sucesso do comando, sozinha, não substitui essa consulta.

Nesta implementação foi executada a geração e a validação local sem rede. Os
testes de transporte usam respostas controladas e verificam apenas o fluxo
unitário. A importação HTTP real e a comparação de versões/contagens após duas
execuções ainda precisam ser realizadas quando o banco local estiver disponível;
o ambiente desta tarefa estava sem banco local por falha no download da imagem
(ECR Forbidden). Nenhuma importação real é afirmada a partir desses testes.
