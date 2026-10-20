# Etapa 9 — Alarme de sinal de vida · Desenho

**Data:** 2026-10-20  
**Objetivo:** avisar a equipe Repply por e-mail quando o SCC de uma casa ficar parado durante o expediente e quando ela voltar a enviar dados, sem avisos automáticos ao dono do restaurante, sem marcar um aviso como enviado antes da confirmação real e sem misturar dados entre restaurantes.

> Este desenho vira um plano em `docs/superpowers/plans/` e é executado em commits pequenos, enviados à branch `etapa-9-alarme`. Nada desta etapa publica no `main`, aplica migration na nuvem, altera segredos ou dispara e-mail real sem uma operação autorizada separadamente.

---

## 1. Contexto: o que já existe (não reinventar)

| Peça | Onde | Estado |
|---|---|---|
| Vigia | `public.atualizar_estados()` em `20261013140000_vigia_resiliente.sql` | **Existe.** Roda a cada 5 min e calcula `aguardando`, `em_dia`, `atrasado`, `parado` e `fechado`, isolando falha de cadastro de uma casa das demais. |
| Sinal de vida | `public.sinal_de_vida` | **Existe.** Guarda os últimos envios e o estado visível no painel/admin. `alarme_enviado_em` ainda não é alterado pelo vigia. |
| Recepção válida | `public.processar_envio(...)` e `supabase/functions/receber-envio/` | **Existe.** Atualiza `ultimo_envio_ok_em` somente depois de validar e gravar o envelope. É a prova de que o SCC voltou de verdade. |
| Rotinas | `rf-vigia` e pg_cron | **Existe.** O cron já roda o vigia localmente e na nuvem a cada 5 min. |
| Resend | dependência `resend` e domínio/remetente da D-63 | **Existe para Auth.** O uso da API de runtime e os segredos específicos do alarme ainda não existem. |
| Chamada banco → HTTP | pg_net + Vault | **Ainda não configurado.** É a superfície prevista para a etapa 9; a migração resiliente removeu o esboço inseguro anterior. |

## 2. Decisões que mandam aqui (não reabrir)

- **D-15:** o dono do restaurante não recebe resumo nem aviso automático por e-mail, WhatsApp ou notificação no MVP. Estes alertas vão somente para a equipe Repply.
- **D-38:** `parado` só conta dentro do horário de funcionamento; o admin mostra o mesmo estado do vigia. O e-mail de alarme sai quando a casa vira `parado`.
- **Recepção §7:** o alarme de “voltou” só sai quando chegam dados válidos de novo; uma casa fechar não conta como volta.
- **D-29 / D-51:** nenhum dado pessoal de cliente pode ir para banco, log ou e-mail. O alerta nunca inclui envelope, entradas, token, senha, e-mail de login ou chave.
- **Segurança:** toda tabela nova nasce na migration com RLS. `FORCE ROW LEVEL SECURITY` é proibido. A identidade do restaurante vem do banco, nunca do corpo HTTP.
- **Operação:** `main` publica automaticamente na Vercel. O desenvolvimento fica na branch `etapa-9-alarme`; cada commit é enviado a ela, sem push forçado, rebase destrutivo ou publicação por consequência.

## 3. Resultado para quem opera

O destinatário configurado em `ALERTA_EMAIL_PARA` recebe dois tipos de mensagem:

1. **“SCC parado”** — uma vez por incidente, quando o vigia calculou `parado` (mais de 45 min sem envio válido enquanto a casa está aberta).
2. **“SCC voltou a enviar”** — uma vez para aquele mesmo incidente, somente depois de um envio válido ter sido gravado e somente se o e-mail de parada havia sido efetivamente entregue.

O corpo traz apenas:

- nome da casa;
- qual dos dois eventos ocorreu;
- horário do último envio válido, convertido para o fuso da casa;
- link para o detalhe daquele restaurante no admin.

Não entra no corpo nem no assunto: token SCC, senha, dados de clientes, conteúdo recebido do SCC, mensagem de erro do provedor, chave de API ou e-mails dos usuários do restaurante.

## 4. Arquitetura: banco registra, função envia, banco confirma

### 4.1 Incidente e caixa de saída

A migration nova cria duas tabelas internas, ambas com RLS habilitada e **sem** política para `anon` ou `authenticated`:

| Tabela | Responsabilidade | Dados permitidos |
|---|---|---|
| `incidentes_sinal` | Um ciclo de parada de uma casa, do instante em que ela para até sua volta/cancelamento. Há no máximo um incidente aberto por restaurante. | IDs, instantes e estado operacional; nenhum conteúdo SCC. |
| `alertas_sinal` | Caixa de saída de um e-mail (`parado` ou `voltou`) ligada a um incidente. | ID, tipo, estado da entrega, tentativas, horário, ID da requisição pg_net e código curto de erro. |

Cada incidente tem no máximo um alerta de cada tipo, garantido por `unique (incidente_id, tipo)`. Um índice único parcial impede dois incidentes abertos para a mesma casa. A caixa de saída é a fonte da verdade da entrega; `sinal_de_vida.alarme_enviado_em` passa a espelhar apenas a confirmação do alerta de parada, nunca a simples fila ou chamada HTTP.

Estados da caixa de saída:

- `pendente`: pronto para encaminhar ou repetir;
- `em_transito`: pg_net aceitou a chamada e a rotina ainda aguarda a resposta HTTP real;
- `enviado`: resposta HTTP válida da função confirmou que a Resend aceitou o e-mail;
- `cancelado`: a casa voltou antes de o e-mail de parada ter sido entregue, portanto não há motivo para mandar um aviso atrasado.

Não existe estado de “sucesso” baseado apenas no retorno de `net.http_post`: esse retorno só informa que a solicitação entrou na fila. A confirmação vem de `net._http_response`.

### 4.2 Geração do incidente

`atualizar_estados()` continua responsável exclusivamente por calcular o estado, mas ganha uma pequena integração transacional:

- ao encontrar uma casa em `parado` sem incidente aberto, cria o incidente e o alerta `parado` como `pendente`;
- reexecuções do cron e duas execuções concorrentes não duplicam incidente nem alerta, graças às restrições do banco;
- mudar para `fechado`, `atrasado` ou `em_dia` não gera por si só um “voltou”; fechar a casa nunca limpa nem dispara o alerta;
- erro de horário/fuso de uma casa continua sendo contido no bloco daquela casa e não para o vigia das outras.

`processar_envio()` é o único caminho que registra a volta: depois de concluir um envio válido e atualizar o sinal, identifica o incidente aberto daquela casa.

- se a parada já foi entregue, registra `voltou_em` e coloca um alerta `voltou` na caixa;
- se a parada ainda está `pendente`, cancela esse aviso e encerra o incidente sem mandar e-mail algum;
- se a parada está `em_transito`, registra a volta e aguarda a resposta: se a entrega for confirmada, cria a volta; se falhar, cancela o alerta atrasado. Assim não há “voltou” sem que alguém tenha recebido o “parado”.

### 4.3 Encaminhamento e confirmação

Uma nova função privilegiada, chamada pelo cron após o vigia, faz dois passes curtos:

1. **confirmação:** lê somente as respostas pendentes de `net._http_response`; HTTP 2xx com `{ "ok": true }` muda o alerta para `enviado`. Erro HTTP, corpo inválido ou falha de rede devolve o alerta para `pendente`, registra só um código curto e agenda a próxima tentativa;
2. **encaminhamento:** reserva alertas `pendente` elegíveis, consulta a URL e o segredo de chamada exclusivamente no Vault e chama `net.http_post`. O ID retornado pela fila é gravado no alerta antes de ele virar `em_transito`.

O cron mantém o ritmo de cinco minutos. A seleção usa trava por linha (`FOR UPDATE SKIP LOCKED`) e limite explícito, para que duas execuções nunca encaminhem a mesma linha. Se Vault, pg_net ou a URL ainda não estiverem configurados, a rotina mantém o alerta pendente e registra somente o código operacional; o vigia continua calculando estados normalmente.

As tentativas reutilizam a mesma chave de idempotência da Resend derivada do UUID do alerta. A Resend deduplica repetições desta chave por 24 horas. Se uma chamada ficar ambígua além dessa janela, o alerta não é marcado como entregue sem confirmação e fica visível como pendência operacional; a operação decide sua retomada, em vez de inventar sucesso ou assumir silêncio.

## 5. Edge Function `enviar-alerta`

A nova função Supabase Edge não recebe nome de restaurante, texto de e-mail nem destinatário do banco. Ela aceita exclusivamente `{ "alerta_id": "uuid" }` e:

1. exige o cabeçalho interno `x-rf-alerta-secret`, igual ao segredo configurado no ambiente da função; chamadas sem ele recebem resposta genérica 401;
2. usa `SUPABASE_SERVICE_ROLE_KEY` somente no servidor para ler o alerta, o incidente, a casa e o último envio válido;
3. recusa alerta inexistente, já cancelado ou já enviado;
4. monta o HTML/texto seguro e chama a API da Resend com `RESEND_API_KEY`, `ALERTA_EMAIL_DE`, `ALERTA_EMAIL_PARA` e a chave de idempotência do alerta;
5. responde apenas `{ "ok": true }` ou `{ "ok": false, "codigo": "..." }`, sem vazar texto de resposta do provedor, destinatário ou segredos.

Ela será implantada com validação JWT desligada **somente** porque o chamador é pg_net. Isso não a torna pública: o segredo interno continua obrigatório e fica no Vault para o banco e no ambiente secreto da função, nunca no código, no `config.toml`, no navegador ou no log.

O e-mail não altera o banco. Quem altera a caixa de saída é a rotina privilegiada depois de observar a resposta HTTP. Isso impede que uma resposta perdida entre a função e o banco vire “enviado” por suposição.

## 6. Falhas e limites explícitos

| Situação | Comportamento |
|---|---|
| Resend retorna erro | alerta volta a `pendente`; tenta de novo no próximo ciclo, com código curto. |
| Função indisponível / pg_net falha | alerta fica ou volta a `pendente`; vigia e outros restaurantes seguem normais. |
| pg_net só enfileirou a chamada | fica `em_transito`; não marca envio. |
| Resposta HTTP 2xx e `{ok:true}` | marca `enviado` e atualiza os marcos do incidente/sinal. |
| Casa fecha depois de parar | não gera “voltou”; o incidente continua até um envio válido. |
| Casa volta antes de o alerta sair | cancela a parada pendente; não manda e-mails fora de contexto. |
| Casa volta após alerta entregue | cria exatamente um “voltou” para o incidente. |
| Dois restaurantes | cada incidente, fila e consulta é filtrado pelo `restaurante_id`; um não lê, bloqueia ou confirma o outro. |

## 7. Configuração e operação posterior (fora do commit de código)

A etapa produz o código e os testes locais. Aplicar na nuvem exige uma operação autorizada posterior, com backup e checklist próprio. Nela, o operador:

- confirma que `pg_net`, `pg_cron` e Vault estão disponíveis no projeto correto;
- cria no Vault a URL da função e o segredo interno, sem imprimi-los;
- configura na Edge Function `RESEND_API_KEY`, `ALERTA_EMAIL_DE`, `ALERTA_EMAIL_PARA` e o mesmo segredo interno, sem colocá-los no Next/Vercel;
- implanta `enviar-alerta` com a proteção interna ativa;
- aplica a migration nova, confere os jobs e testa uma casa de demonstração controlada;
- consulta `net._http_response`, além de `cron.job_run_details`, antes de considerar um alerta entregue.

Nenhuma chave, destinatário real, senha, token, arquivo privado ou chamada de produção entra no repositório ou aparece no terminal compartilhado.

## 8. Testes e aceite

O desenvolvimento precisa cobrir no Supabase local:

- parada cria um incidente e uma única saída `parado`, mesmo com várias rodadas do vigia;
- confirmação real de resposta marca o alerta e o marco correspondente, sem depender de “succeeded” do cron;
- falha HTTP/rede mantém o alerta repetível, sem marcá-lo entregue;
- envio válido depois de parada entregue cria um único `voltou`;
- fechamento não cria `voltou`;
- volta antes da entrega cancela o aviso atrasado;
- duas casas têm incidentes/filas independentes e roles de cliente não leem nem escrevem as tabelas internas;
- função HTTP recusa método/corpo/segredo inválidos, não vaza segredos e usa a chave idempotente esperada;
- renderização dos dois e-mails não expõe dado pessoal e inclui o link correto do admin.

Antes de concluir: tipos, lint, todos os testes e build; depois conferência no navegador em largura de celular e computador para garantir que o selo/Admin existente não regrediu. A prova de e-mail real pertence somente à operação autorizada posterior.

## 9. Fora de escopo (YAGNI)

- avisar o dono do restaurante por e-mail, WhatsApp, push ou SMS;
- criar uma tela nova de histórico de alertas para cliente ou admin;
- mudar os limites do vigia, horário de funcionamento ou o selo do painel;
- enviar resumo diário/semanal;
- expor `alertas_sinal` pela API do navegador;
- aplicar a migration, implantar função, criar segredos, alterar Resend, Vercel ou enviar e-mail real nesta etapa de desenvolvimento.

## 10. Perguntas em aberto

Nenhuma de produto. Os nomes finais de funções SQL, limites de lote e layout interno dos e-mails são decisões de implementação do plano, desde que preservem este contrato.
