# Recepção de dados (`receber-envio`) e vigia

*Como a nuvem recebe o que o SCC manda. O lado do SCC está no [contrato de dados](../integracao-scc/contrato-de-dados.md). Os padrões vêm do Repply CRM: webhook que fecha por padrão, idempotência pela chave e alarme de "sinal de vida".*

## 1. Peças

| Peça | Onde roda | Faz |
|---|---|---|
| `receber-envio` | Supabase Edge Function (Deno) | Autentica, valida, tira dados pessoais e chama o banco |
| `processar_envio()` | Função no Postgres (plpgsql) | Grava, reconcilia e atualiza o sinal de vida, **numa transação só** |
| `atualizar_estados()` | Função no Postgres, pg_cron a cada 5 min | O vigia: em dia, atrasado, parado ou fechado |
| `enviar-alerta` | Supabase Edge Function | Manda o e-mail de alarme e o de "voltou" (Resend) |

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
4. **Ritmo:** se o mesmo restaurante teve um envio analisado há menos de 20 s, devolve `429`. O `429` fica registrado em `envios` e em `ultimo_erro_em`, mas **não** mexe em `ultimo_envio_em`: se mexesse, um SCC enviando rápido demais nunca mais seria aceito.
5. **JSON** inválido recebe `400`.
6. **Só entra o que está na lista** (D-29, D-51): fica o que o contrato §5 descreve. `NomeCliente`, `RG`, `FoneCliente` e `Sexo` saem em silêncio; qualquer outro campo desconhecido sai e tem **só o nome** registrado em `envios.campos_desconhecidos`. Isso acontece **antes de qualquer outra coisa**, inclusive antes de guardar o JSON original. A lista vive em `supabase/functions/_shared/campos-permitidos.ts`, e o `processar_envio` a repete como segunda barreira.
7. **Validação do envelope** (schema com Zod):
   - `versao_formato = 1`;
   - `modo = "janela"`;
   - `janela.desde ≤ janela.ate`;
   - `lote = 1/1`;
   - até 2.000 entradas;
   - campos obrigatórios das entradas presentes.

   Se falhar: `422` com a lista `erros`, e o envio é guardado como erro.
8. **`processar_envio(restaurante_id, envelope)`**, numa transação:
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
   7. insere a linha em `envios` (contagens, duração, JSON original sem os dados pessoais);
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
- **Horário de funcionamento:** pode atravessar a meia-noite (ex.: 11h–2h), e o dia que vale é o da abertura. Dois intervalos colados, ou uma casa 24 horas, contam como uma abertura só. A regra está na função `aberto_desde`.
- **Sem horário cadastrado**, o restaurante conta como sempre aberto: desconhecido não vira "fechado". Por isso o admin precisa exigir o horário no cadastro (etapa 3).
- **Cadastro malformado** (horário ou fuso inválido) em um restaurante não para a rotina: ele é pulado, com um aviso no log do banco, e os outros são calculados.
- **Alarme por e-mail:** ainda **não existe**. O vigia só calcula o estado e não mexe em `alarme_enviado_em`. O envio do e-mail de "parado" e de "voltou" é uma rotina própria, da etapa do alarme (ver `docs/divida-tecnica.md`), com duas regras: só marca como avisado depois de confirmar que o e-mail saiu, e só avisa "voltou" quando os dados voltam, nunca porque a casa fechou.
- **O admin mostra o estado e o painel do dono usa as mesmas faixas** no selo "há X min" (M05).

> Lição do CRM: `succeeded` em `cron.job_run_details` só diz que o pedido foi para a fila. Para saber se a chamada HTTP deu certo, conferir `net._http_response`.
