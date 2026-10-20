# Recepção de dados (`receber-envio`) e vigia

*Como a nuvem recebe o que o SCC manda. O lado do SCC está no [contrato de dados](../integracao-scc/contrato-de-dados.md). Os padrões vêm do Repply CRM: webhook que fecha por padrão, idempotência pela chave e alarme de "sinal de vida".*

## 1. Peças

| Peça | Onde roda | Faz |
|---|---|---|
| `receber-envio` | Supabase Edge Function (Deno) | Autentica, deixa passar só os campos da lista do contrato (D-51), valida e chama o banco |
| `processar_envio()` | Função no Postgres (plpgsql) | Grava, reconcilia e atualiza o sinal de vida, **numa transação só** |
| `atualizar_estados()` | Função no Postgres, pg_cron a cada 5 min | O vigia: em dia, atrasado, parado ou fechado |
| `enviar-alerta` | Supabase Edge Function | Manda para a equipe Repply o alerta de parada e o de volta pela Resend; só aceita chamada interna autenticada por segredo |

Por que dividir assim:
- a função HTTP fica pequena e fácil de testar;
- o trabalho pesado roda dentro do banco, numa ida e volta só;
- se a gravação falhar no meio, nada fica pela metade.

## 2. Configuração da função

- No `supabase/config.toml`: `verify_jwt = false` para `receber-envio`, **com um comentário explicando por quê**, como o CRM faz. O SCC não tem sessão do Supabase. A autenticação é o token do restaurante, conferido dentro da função.
- Ela usa a chave de serviço (service role), que nunca sai do servidor. **Todo acesso ao banco passa o `restaurante_id` resolvido pelo token, e nunca um valor que veio no corpo.**

## 3. Passo a passo de um envio

1. **Só `POST`.** Qualquer outro método recebe `405`.
2. **Tamanho:** corpo acima de 2 MB recebe `413`.
3. **Token:**
   - lê o `Authorization: Bearer`;
   - calcula o SHA-256;
   - procura um token válido em `tokens_envio`.
   - Se não achar: `401`, sem detalhar o motivo. Registra só "token inválido" e o prefixo, se houver.
4. **Ritmo:** se a última resposta desse restaurante que não foi `429` foi há menos de 20 s, devolve `429`. O `429` fica registrado em `envios` e em `ultimo_erro_em`, mas **não** mexe em `ultimo_envio_em`: se mexesse, um SCC enviando rápido demais nunca mais seria aceito.
5. **JSON** inválido recebe `400`.
6. **Só entra o que está na lista** (D-29, D-51): fica o que o contrato §5 descreve. `NomeCliente`, `RG`, `FoneCliente` e `Sexo` saem em silêncio; qualquer outro campo desconhecido sai e tem **só o nome** registrado em `envios.campos_desconhecidos`. Isso acontece **antes de qualquer outra coisa**. O JSON original nunca é guardado: o que fica em `envios.payload` é remontado só com os campos da lista. A lista vive em `supabase/functions/_shared/campos-permitidos.ts`, e o `processar_envio` a repete como segunda barreira.
   - Valor composto (objeto ou lista) numa coluna ou num extra não passa. No extra, o campo vira nome desconhecido. Na coluna, ele some sem aviso e a validação do passo 7 responde `422`.
   - Um nome de campo só é guardado se começar com letra e tiver até 40 caracteres (letras, números, `_` e `.`). Qualquer outro, como um CPF ou telefone usado como nome, vira `(nome fora do padrão)`. O teste vale em qualquer nível (entrada, envelope, `janela` e `lote`) e é feito no nome como veio, antes de colocar o prefixo `envelope.`, `janela.` ou `lote.`. A lista guarda no máximo 20 nomes.
7. **Validação do envelope** (schema com Zod):
   - `versao_formato = 1`;
   - `modo = "janela"`;
   - `janela.desde ≤ janela.ate`;
   - `lote = 1/1`;
   - até 2.000 entradas;
   - campos obrigatórios das entradas presentes.

   Se falhar: `422` com a lista `erros`, e o envio é guardado como erro.
8. **`processar_envio(restaurante_id, envelope, campos_desconhecidos)`**, numa transação. O terceiro argumento traz os nomes que a recepção descartou no passo 6, e a função junta com os que ela mesma descarta:
   1. trava por restaurante (`pg_advisory_xact_lock`), para que dois envios ao mesmo tempo sejam processados em fila;
   2. **normaliza** cada entrada:
      - corta espaços;
      - converte `Pago` ("Sim/S/true/1" → verdadeiro; "Não/Nao/N/false/0" → falso);
      - junta data e hora no fuso do restaurante;
      - calcula o `dia_operacao`;
      - converte os valores para `numeric`;
      - leva para `extras` só os campos listados como extras no contrato §5;
      - calcula o `hash_origem`;
   3. **upsert** por `(restaurante_id, cod_entrada)`:
      - se o `hash_origem` é igual ao gravado, conta como **inalterada** e não regrava;
      - se a entrada estava removida e voltou, limpa o `removida_em`;
   4. **reconcilia:** marca `removida_em = now()` nas entradas do restaurante que **não vieram** neste envio e que:
      - estão abertas (`fechada_em is null`); ou
      - foram abertas (`aberta_em` local) dentro de `[janela.desde, janela.ate]`; ou
      - foram fechadas (`fechada_em` local) dentro de `[janela.desde, janela.ate]`;
   5. atualiza `sinal_de_vida`: `ultimo_envio_em`, `ultimo_envio_ok_em` e, se for o primeiro, `primeiro_envio_em`;
   6. atualiza `tokens_envio.ultimo_uso_em`;
   7. insere a linha em `envios` (contagens, duração, nomes dos campos descartados e o JSON guardado, remontado só com os campos da lista, nunca o original);
   8. se `restaurantes.pedido_reenvio_desde` está preenchido e `janela.desde ≤ pedido_reenvio_desde`, limpa o pedido, porque o reenvio começou.
9. **Resposta `200`** com:
   - `recebidas`, `gravadas`, `inalteradas`, `removidas`;
   - `janela_confirmada`;
   - `proximo_envio_em_segundos`, que vem de `restaurantes.intervalo_envio_segundos`;
   - `reenviar_desde`, se houver pedido pendente.
10. **Qualquer erro depois do passo 3:** insere em `envios` com `http_status` e uma mensagem **curta e sem dado pessoal**, e atualiza `sinal_de_vida.ultimo_envio_em` e `ultimo_erro_em` (no `429`, só o `ultimo_erro_em`). Erro interno recebe `500`, e o SCC tenta no próximo ciclo.

> **Lição do CRM:** em gravação feita por service role, "zero linhas afetadas" não é sucesso. O `processar_envio` confere as contagens, e os testes cobrem o caso de chave que não bate.

## 4. Testes que precisam existir

### Execução local

Os testes de integração usam o banco local em `127.0.0.1:54322` e a API em `127.0.0.1:54321`. Com o Supabase iniciado, mantenha a função em outro terminal:

```bash
npx supabase functions serve receber-envio
npm run test
```

As fixtures usam IDs exclusivos e a limpeza remove somente esses registros, inclusive em falha parcial. Não use a Casa de Demonstração, `demo-local`, `.env.gerador.local` nem `supabase db reset` para repetir os testes.

| Caso | Esperado |
|---|---|
| Envelope válido, 3 entradas novas | 200; `gravadas = 3` |
| O mesmo envio de novo | 200; `inalteradas = 3`; nenhuma linha nova |
| Entrada aberta volta paga | 200; `gravadas = 1`; `fechada_em` e `pago` atualizados |
| Entrada sumiu da janela | 200; `removidas = 1`; sai das métricas |
| Entrada removida reaparece | `removida_em` volta a vazio |
| Entrada aberta antiga, fora da janela, deixa de vir | Marcada removida (abertas sempre vêm) |
| Envio com `RG` e `FoneCliente` | Nada disso no banco, nem em `entradas`, nem em `envios.payload` |
| Token errado, revogado ou expirado | 401 |
| Token antigo em troca "em 24h" | Aceito até expirar; depois, 401 |
| `versao_formato = 2` | 422 com `erros` |
| 2.001 entradas | 413 |
| Dois envios simultâneos do mesmo restaurante | Os dois processados em sequência; contagens corretas |
| Mesa aberta às 23h30 e fechada à 1h15, com virada às 5h | `dia_operacao` = dia da abertura |
| Restaurante A envia com o token do B | Grava no B (o token é a identidade); nada vaza para o A |
| Envio com campo novo (`CPF`) | Valor em lugar nenhum; nome em `envios.campos_desconhecidos` |
| Extra conhecido com valor composto (objeto ou lista) | Valor descartado; o nome do extra fica em `envios.campos_desconhecidos` |
| Coluna conhecida com valor composto (objeto ou lista) | Descartada em silêncio, sem nome registrado; pela recepção, o envio recebe 422 |
| Nome de campo só com dígitos (um CPF usado como nome), no envelope, na `janela`, no `lote` ou na entrada | Vira `(nome fora do padrão)` em `envios.campos_desconhecidos`; o número em lugar nenhum |
| Segundo envio em menos de 20 s, depois de um `429` | A contagem não reinicia: aceito quando completar 20 s do envio anterior |

## 5. Gerador de dados fictícios

Ele simula o SCC (D-13) e alimenta a demonstração e os testes de ponta a ponta:
- gera meses de entradas realistas no formato exato do JSON do Pedro:
  - almoço e jantar;
  - pico de sexta e sábado;
  - mesas abertas agora;
  - algumas contas esquecidas;
  - descontos;
  - garçons;
- envia pelo **mesmo** `receber-envio`, com o token de um restaurante de teste:
  - carga inicial em janelas de 7 dias;
  - depois, ciclos de 5 minutos;
- tem um modo "parar de enviar", para demonstrar o alarme.

O simulador C++ do Lucas Duarte (`Repply-Food/scc-dashboard`) já faz o envio HTTP. Basta adaptar o envelope e o endereço para ele virar esse gerador, ou reescrever em TypeScript dentro do repositório (decisão do plano).

## 6. Retenção

Rotina diária no pg_cron:
- tira o `payload` de envios `200` com mais de 48 h;
- tira o `payload` de envios com erro com mais de 90 dias.

## 7. Vigia do "sinal de vida"

`atualizar_estados()` roda a cada 5 minutos e calcula, para cada restaurante:

| Estado | Regra |
|---|---|
| `aguardando` | Nunca enviou |
| `fechado` | Agora está fora do horário de funcionamento. Nunca alarma |
| `em_dia` | Atraso ≤ 15 min |
| `atrasado` | Atraso entre 15 e 45 min |
| `parado` | Atraso acima de 45 min |

- **Atraso:** conta do que for mais recente, o último envio sem erro **ou a abertura da casa**. O tempo em que a casa estava fechada não conta: o restaurante que desliga o computador à noite não aparece "parado" no minuto em que abre.
- **Horário de funcionamento:** até **dois intervalos por dia** (D-56), por exemplo almoço e jantar; fora deles o vigia não acusa atraso nem parada. O último do dia pode atravessar a meia-noite (ex.: 11h–2h), e o dia que vale é o da abertura. Dois intervalos colados, ou uma casa 24 horas, contam como uma abertura só. A regra de contagem está na função `aberto_desde`, e o formato é conferido no banco por `horario_funcionamento_valido` (restrição de `restaurantes`).
- **Sem horário cadastrado**, o restaurante conta como sempre aberto: desconhecido não vira "fechado". O formulário do admin **exige pelo menos um dia aberto**, então cadastro novo nunca nasce assim. A lista vazia continua aceita no banco, só para cadastros antigos.
- **Cadastro malformado** (horário ou fuso inválido) agora é **barrado na gravação**, pelas restrições de `restaurantes`. A defesa do vigia fica para linhas antigas: o restaurante malformado não para a rotina, é pulado com um aviso no log do banco, e os outros são calculados.
- **Alarme por e-mail:** ao encontrar `parado`, o vigia cria um incidente e uma saída `pendente`, sem marcar `alarme_enviado_em`. A rotina lê primeiro `net._http_response` e só uma resposta 2xx com `{ "ok": true }` confirma o envio. Depois encaminha pendências por pg_net para `enviar-alerta`, com URL e segredo somente no Vault. A função usa Resend com chave de idempotência por alerta. Falha de rede/provedor mantém a saída repetível; uma casa não para as demais.
- **Volta:** somente a mudança real de `ultimo_envio_ok_em`, gravada após um envio SCC válido, registra a volta. Se a parada já chegou, cria exatamente um aviso `voltou`; se ela ainda estava pendente, cancela o aviso atrasado. Mudar para `fechado` nunca envia “voltou”.
- **O admin e o painel do dono mostram o mesmo estado.** O selo "há X min" do painel (M05) **segue o estado do vigia** (D-53). Ele não recalcula `agora − último envio`: os limites são os da tabela acima, e o tempo mostrado sai de `ultimo_envio_ok_em`. Textos (completos na D-53):
  - `em_dia`: "atualizado há X min";
  - `atrasado`: "atrasado · últimos dados há X min";
  - `parado`: "sem dados há X";
  - `fechado`: "fechado agora · últimos dados às HH:MM" (no fuso da casa; com mais de 24 h, "há N dias");
  - `aguardando` ou sem linha: "aguardando o 1º envio";
  - leitura do sinal falhou: "sem leitura agora".
- **Texto curto no cabeçalho do celular** (D-53), de uma linha, para não quebrar nem cortar o nome da casa: "há X min", "atrasado · há X min", "sem dados há X", "fechado", "aguardando" e "sem leitura". O leitor de tela ouve o texto completo, e a barra lateral do computador mostra o texto completo. Os dois saem de `lib/painel/selo.ts` (`texto` e `textoCurto`).
- O selo é calculado quando a tela carrega. Desde a etapa 5, a tela Hoje se atualiza sozinha a cada ~1 min (`AtualizaHoje` → `router.refresh()`) e o selo anda junto (dívida 26, resolvida).

> Lição do CRM: `succeeded` em `cron.job_run_details` só diz que o pedido foi para a fila. Para saber se a chamada HTTP deu certo, conferir `net._http_response`.
