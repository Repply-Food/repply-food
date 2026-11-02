# Smoke do webhook v2 — somente local

Não use produção, dados reais ou tokens de outras casas. Confira antes de cada envio que `base_url` é exatamente `http://127.0.0.1:54321/functions/v1/receber-envio`. Nunca compartilhe nem versione tokens, senhas ou o ambiente local do Insomnia. Não rode reset, limpeza ou exclusão para repetir.

1. Inicie o Supabase local com `npm run supabase:start`. Prepare exclusivamente a casa `smoke-scc-local` seguindo [a preparação local](smoke-scc-local-preparacao.md), inclusive os acessos de dono e admin. O preparador não altera uma casa já existente: se já existir, preserve seus dados e use o token local anteriormente guardado; se não o tiver, pare e peça orientação. Copie o token exibido uma única vez para o ambiente privado do Insomnia, não para o JSON exportado.
2. Terminal 1: crie um arquivo local ignorado contendo `RF_PERMITIR_SIMULACAO=1` e inicie `npx supabase functions serve receber-envio --env-file .env.smoke-local`. Essa variável é exclusiva da função local; nunca configure em produção. Mantenha o terminal aberto.
3. Terminal 2: inicie `npm run dev`. Acesse o aplicativo local e entre como dono local; confira a casa `smoke-scc-local`. Para o admin, saia e entre com a conta admin local, abra a casa e escolha ver o painel do cliente. A preparação explica como criar os acessos ausentes sem redefinir senhas.
4. Importe `insomnia-webhook-v2.json`, escolha o ambiente Local e preencha `token` somente no ambiente privado do Insomnia. Confira também a URL antes de enviar. Envie as requisições da pasta 01 em ordem; cada uma deve retornar HTTP 200 e `estado: publicada`. Depois envie as seis da pasta 02: são fotografias históricas independentes, não cópias automáticas publicadas pelo servidor.
5. A pasta 03 repete a fotografia idêntica: HTTP 200, `repetida: true`, sem duplicação. Confira os resultados iniciais abaixo. Na pasta 04 envie tudo em ordem; aguarde **20 segundos desde a publicação anterior de entradas** antes de enviar as entradas corrigidas. Os demais tipos e fotografias não precisam dessa espera. Confira novamente os resultados.
6. Envie a página 1/2 da pasta 05: HTTP 200, `estado: recebendo`; não envie a página 2. A fotografia publicada continua visível. Na pasta 06, sem token e token inválido retornam 401; mesmo ID divergente e sequência antiga retornam 409; campo desconhecido retorna 422. Confira que nenhuma dessas tentativas muda os resultados.

As datas fixas são 01/11/2026: selecione esse dia nos filtros de Resultados e dos relatórios. Hoje mostra o dia operacional corrente, portanto só coincide com a tabela quando o relógio local e a virada da casa correspondem a esse dia; não altere relógio ou dados existentes para forçar a comparação. A fotografia incompleta fica pendente: repetir as mesmas requisições é idempotente, mas não reinicia o teste do zero. Uma segunda execução devolve recibos repetidos; não apague dados para obter novamente a primeira publicação. Para um ensaio limpo, solicite orientação antes de qualquer limpeza.

## Conferência literal

Compare cada linha em celular (390 px) e computador, temas claro e escuro, tanto como dono quanto como admin em modo leitura. Para cada relatório confira também o PDF exportado com os mesmos filtros. A taxa de serviço não integra o faturamento da casa. Valores históricos só mudam após enviar as correções históricas, no fim da pasta 04.

| Superfície e filtro | Inicial on-line / histórico | Após correção on-line / histórico |
|---|---|---|
| Hoje, quando o dia operacional for 01/11/2026 | 2 contas pagas; faturamento R$ 106,00; serviço R$ 10,60 | 2 contas pagas; faturamento R$ 104,00; serviço R$ 10,40 |
| Resultados, 01/11/2026 | faturamento R$ 106,00; serviço R$ 10,60; 2 contas | faturamento R$ 104,00; serviço R$ 10,40; 2 contas |
| Produtos e PDF | Prato R$ 73,00; Bebida R$ 16,00; Sobremesa R$ 17,00; total R$ 106,00 | Prato R$ 73,00; Bebida R$ 14,00; Sobremesa R$ 17,00; total R$ 104,00 |
| Comissões e PDF | Operador 1 R$ 6,60; Operador 2 R$ 4,00 | Operador 1 R$ 6,60; Operador 2 R$ 3,80 |
| Caixa e PDF | crédito R$ 106,00; débito R$ 12,50 | crédito R$ 94,40; débito R$ 12,50 |
| Auditoria e PDF | 6 eventos, incluindo 2 cancelamentos | 6 eventos, incluindo 2 cancelamentos |
| Notas assinadas e PDF | 1 nota, R$ 20,00 | 1 nota, R$ 20,00 |
| Financeiro e PDF | consumo R$ 106,00; serviço R$ 10,60; projetado R$ 116,60; recebido R$ 96,60; notas R$ 20,00; descontos R$ 3,00 | consumo R$ 104,00; serviço R$ 10,40; projetado R$ 114,40; recebido R$ 94,40; notas R$ 20,00; descontos R$ 5,00 |

Os valores do financeiro e caixa são informados pela SCC na amostra; não suponha que blocos independentes obedeçam a uma fórmula. Se algum valor ou opção não aparecer, registre o resultado observado sem alterar produção.
