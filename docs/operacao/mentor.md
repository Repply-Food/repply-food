# Mentor de IA: operação

*Como a equipe Repply opera o mentor: editar a cartilha, ler as conversas, configurar o provedor, entender o limite diário e a retenção. Decisões: D-72 (escopo, cartilha, leitura das conversas, 12 meses) e D-73 (provedor). Desenho: [`2026-10-29-agente-mentor-ia-design.md`](../superpowers/specs/2026-10-29-agente-mentor-ia-design.md); plano: [`2026-10-29-agente-mentor-ia-v1-chat.md`](../superpowers/plans/2026-10-29-agente-mentor-ia-v1-chat.md).*

> **Estado: v1 (chat) construído e testado no banco local, na branch `mentor-ia`. Ainda não foi publicado** (nem o banco da nuvem nem a Vercel). O que falta para publicar está em "Antes de publicar", no fim. É a **Fase 2** do produto (SPEC §7).

## 1. O que é

Um chat para o **dono** dentro do painel (`/r/[slug]/mentor`, 4º item do menu: Hoje · Resultados · Ajustes · Mentor). O dono pergunta em português; o mentor **consulta os números reais da casa na hora** e responde, interpretando e dando sugestões de gestão.

Como funciona por baixo:

- **Os números vêm de ferramentas.** O modelo não "sabe" nada da casa: ele pede ao servidor para rodar uma das 14 ferramentas, que são as mesmas funções SQL `metrica_*` de Hoje e Resultados (faturamento de hoje, comparação, mesas abertas, curva, contas esquecidas, meta do mês, resumo do período, vendas por dia, mesa e balcão, faturamento por hora, mapa de calor, almoço e jantar, equipe, descontos por operador). A lista fica em `lib/mentor/ferramentas.ts`.
- **O `restaurante_id` vem da sessão**, nunca do que o modelo diz. A RLS é a segunda camada.
- **Só vão para o provedor de IA** a cartilha, os trilhos, as mensagens do dono e os números devolvidos pelas ferramentas. Nenhum dado pessoal de cliente do restaurante existe no banco (D-29, D-51).
- **Trilhos fixos no código** (`lib/mentor/trilhos.ts`), enviados a cada chamada, acima da cartilha: fica no assunto do restaurante; separa fato (vem de ferramenta) de conselho (rotulado como sugestão); não faz papel de advogado nem de contador; se não tem o dado, diz que não tem.
- **Erros nunca viram texto técnico para o dono.** Provedor fora do ar ou sem chave: "o mentor está indisponível agora, tente de novo". Passou do limite do dia: "você já usou bastante o mentor hoje; ele volta amanhã". O motivo real vai para o log só como código (`falha_mentor_provedor`, `falha_mentor_limite`, `falha_mentor_geral`, `falha_ferramenta_mentor`, `falha_leitura_mentor`). Na tela da cartilha do admin há mais dois: `falha_leitura_cartilha` (não leu a cartilha ativa nem o histórico; a tela cai na tela de erro, nunca mostra a lista vazia por engano) e `falha_salvar_cartilha` (não gravou a versão nova, ou gravou e não conseguiu desativar a anterior; neste caso a nova já vale e o próximo salvamento limpa a sobra).
- O chat mostra ao dono, abaixo do campo, o aviso: *"A equipe da Repply pode ler esta conversa para dar suporte, e ela também ajuda a melhorar a inteligência artificial."* (transparência, LGPD: as duas coisas que acontecem com a conversa). O admin que abre o chat do cliente em modo leitura não vê o campo nem o aviso.

## 2. Como a Repply edita a cartilha

A cartilha é o texto que afina o jeito do mentor responder. **É uma só, global** (vale para todas as casas), e o dono nunca a vê.

- **Onde:** `/admin/mentor`, logado como admin da Repply. Chegue pelo cartão **Mentor** da home do admin (`/admin`), logo abaixo da lista de restaurantes (§3).
- **Como:** editar o texto e salvar. Cada salvamento **cria uma versão nova ativa** e desativa a anterior; as versões antigas ficam guardadas na própria tela (só leitura, para conferir e copiar de volta). Nada é sobrescrito.
- **Vale a partir da próxima resposta** do mentor, em qualquer casa.
- **Sem cartilha ativa**, o mentor responde só com os trilhos fixos.
- A migration `20261030110000_mentor_cartilha_uso.sql` já entrega uma cartilha-semente.
- **Quem pode:** só o admin (a RLS barra o dono em leitura e escrita, e a função que entrega a cartilha ao servidor só executa com a chave de serviço).

A cartilha **afina**; os trilhos **mandam**. Não tente relaxar um trilho pela cartilha: ele é reenviado a cada turno, acima dela.

## 3. Onde a Repply lê as conversas

- **Lista:** `/admin/mentor/conversas`: as conversas de **todas as casas**, da mais recente para a mais antiga, com a casa de cada uma.
- **Detalhe:** `/admin/mentor/conversas/<id>`: a conversa inteira, com o que o dono perguntou e o que o mentor respondeu.
- **Só leitura**, como "ver o painel do cliente" (D-38): o admin não escreve conversa nem mensagem (a RLS barra).
- **Para quê:** suporte ("o mentor respondeu errado para a casa X") e melhorar a cartilha (D-72).
- Conversa sem nenhuma mensagem (a gravação faz a conversa e as mensagens em dois comandos) não aparece.

**Como chegar nessas telas:**

1. Na home do admin (`/admin`), abaixo da lista de restaurantes, está o cartão **Mentor** ("Cartilha e conversas dos donos com o mentor"). Ele leva ao editor da cartilha (`/admin/mentor`). O topo do admin não mudou.
2. As duas telas têm, no alto, uma faixa com "‹ Restaurantes" (volta à home do admin) e o link para a tela irmã: da cartilha vai-se às conversas ("Conversas do mentor ›"), e das conversas volta-se à cartilha ("Cartilha do mentor ›").
3. Dentro de uma conversa, "‹ Conversas do mentor" volta à lista, e o nome da casa leva ao detalhe do restaurante.

Os endereços diretos continuam valendo. Resolveu o item 67 de [`divida-tecnica.md`](../divida-tecnica.md).

## 4. O provedor de IA e as variáveis de ambiente

O "cérebro" roda no **servidor do painel** (função do servidor do Next), não no Supabase. As variáveis ficam, então, na **Vercel** em produção e no `.env.local` no desenvolvimento. Nenhuma tem prefixo `NEXT_PUBLIC_` e nenhuma vai para o git (o `.env.example` lista as três, sem valor).

| Variável | Para quê | Padrão |
|---|---|---|
| `MENTOR_IA_CHAVE` | Chave da API do provedor (segredo). **Sem ela o mentor não responde**: o dono vê "indisponível agora" e o log registra `falha_mentor_provedor`. Importar o código ou fazer a build sem a chave não quebra nada | nenhum |
| `MENTOR_IA_PROVEDOR` | Qual provedor usar. Hoje só existe `gemini`. Outro valor falha ao usar, com o motivo no log | `gemini` |
| `MENTOR_IA_MODELO` | Qual modelo do provedor. **Em produção, fixe um modelo concreto**: o padrão é o apelido `gemini-flash-latest`, que a Google move sozinha, e o comportamento do mentor mudaria sem ninguém mexer | `gemini-flash-latest` |

- O provedor é uma interface trocável (`lib/mentor/provedor/`): trocar para Claude ou GPT é escrever outra implementação e mudar `MENTOR_IA_PROVEDOR`, sem mexer no resto (D-73).
- **A conta de IA do produto é separada da conta do Claude Code** que usamos para desenvolver. É uma conta nova, paga por uso, em nome da Repply.
- Hoje o código fala com a **API do Gemini por chave** (`@google/genai`), e **no piloto é assim que segue** (decisão confirmada pelo Lucas Ferreira em 03/11/2026, D-73): os números do negócio vão para a Google. O desenho preferia o Vertex AI em São Paulo (dado processado no Brasil, D-50); ele fica **adiado, como melhoria futura**, e **não bloqueia a publicação** ([`divida-tecnica.md`](../divida-tecnica.md), item 69). Confirmar nos termos do provedor que a API paga não treina com os nossos dados.
- **Nunca rode teste com a chave real.** Os testes usam um provedor dublê; a API do Gemini nunca é chamada pela suíte.

## 5. O limite diário por casa

- **50 usos por casa por dia de operação** (`TETO_DIARIO`, em `lib/mentor/limite.ts`). Um "uso" é uma pergunta enviada ao mentor.
- O contador vive **no banco** (tabela `mentor_uso`, uma linha por casa e dia), não em memória (lição da Vercel, como a trava de senha, D-64). Só anda por duas funções do banco: `mentor_registrar_uso` soma 1, chamada com o login do dono (ele não consegue zerar o próprio contador, e o admin em modo leitura não gasta o limite do cliente), e `mentor_devolver_uso` tira 1, **só o servidor executa** (se o dono pudesse, baixaria o próprio contador).
- O **dia é o dia de operação da casa** (fuso e hora de virada dela), não o do servidor.
- **O uso é contado antes de chamar a IA** (é o que impede dois pedidos ao mesmo tempo de furar o teto). Se o contador falhar, o mentor fecha ("indisponível"); nunca libera por falta de resposta.
- **Uma tentativa barrada pelo teto conta.**
- **Uma tentativa em que a IA não foi alcançada não consome a cota.** Provedor fora do ar, sem resposta ou com resposta vazia (`falha_mentor_provedor`): o servidor devolve o uso que acabou de contar e o dono pode tentar de novo, em vez de travar o dia por uma falha nossa. Falha de outro tipo (a IA respondeu e a conversa não pôde ser concluída) mantém o uso contado, porque a IA gastou. Se a própria devolução falhar, a tentativa fica contada e o log leva `falha_mentor_limite`.
- **Para mudar o teto:** trocar a constante e publicar. O banco não guarda teto por casa.
- A tabela `mentor_uso` é o único lugar para ver o consumo (o admin lê de todas as casas).

## 6. Retenção: 12 meses

- As conversas e as mensagens ficam **12 meses** e depois são apagadas (D-72).
- **Quem apaga:** a função `public.limpar_conversas_mentor()`, chamada pela rotina `rf-limpa-mentor` do pg_cron, **todo dia às 06:00 UTC** (03:00 em Brasília), depois das outras limpezas (05:00 a 05:45). Migration `20261103120000_mentor_retencao.sql`.
- **A regra:** cada **mensagem** é apagada pela própria data (`criada_em` com mais de 12 meses). A **conversa** só é apagada quando também tem mais de 12 meses e **ficou sem nenhuma mensagem**. Assim, uma conversa antiga que o dono retomou ontem não perde as mensagens de ontem.
- É **global** (todas as casas) e a função é fechada: só o `service_role` executa; o pg_cron roda como `postgres`.
- **Conferir que está rodando** (é SQL puro, sem `pg_net`, então o `succeeded` aqui vale):

  ```sql
  select j.jobname, j.schedule, j.active, d.status, d.return_message, d.start_time
    from cron.job j
    left join cron.job_run_details d on d.jobid = j.jobid
   where j.jobname = 'rf-limpa-mentor'
   order by d.start_time desc limit 3;
  ```

- Apagar uma casa (`restaurantes`) apaga as conversas dela na hora, em cascata.

## 7. Privacidade, em uma tela

| Pergunta | Resposta |
|---|---|
| O que o provedor de IA recebe? | A cartilha, os trilhos, as perguntas do dono e os números de negócio das ferramentas. Nenhum dado pessoal de cliente do restaurante |
| Quem lê as conversas? | O dono da casa (as dele) e o admin da Repply (todas, só leitura, para suporte e para melhorar o mentor, D-72) |
| Por quanto tempo? | 12 meses (§6) |
| O dono é avisado? | Sim, no chat, abaixo do campo: a equipe da Repply pode ler a conversa para dar suporte, e ela ajuda a melhorar a inteligência artificial (§1; resolveu o item 68 de [`divida-tecnica.md`](../divida-tecnica.md)). Fica por decidir, sem pressa, se entra também uma linha na política de privacidade |
| O dono vê a cartilha? | Não na tela (ela não existe para o dono e o banco barra a leitura), mas isso é garantia da **interface e da RLS, não da saída do modelo**: um dono insistente poderia fazer o mentor repetir o texto da cartilha. Ela é guia de tom, sem segredo e sem dado de outra casa; não ponha nela nada que a Repply não aceitaria ver vazar (nota na D-72) |
| Para onde vão os dados na IA? | Para a API do Gemini (Google), por chave, no piloto: a cartilha, os trilhos, as perguntas e os números de negócio vão para fora do Brasil, sem dado pessoal. O Vertex AI em São Paulo fica adiado, como melhoria futura (D-73, item 69) |
| Uma casa vê a conversa de outra? | Não. RLS em `mentor_conversas` e `mentor_mensagens`, com teste de isolamento, e a mensagem só entra em conversa da mesma casa |

## 8. Antes de publicar

Nada abaixo foi feito. Cada passo na nuvem pede o ok do Lucas Ferreira na hora (`AGENTS.md` §4).

1. **Aplicar as migrations do mentor na nuvem, ANTES do deploy do painel:** `20261030100000_mentor_conversas.sql`, `20261030110000_mentor_cartilha_uso.sql`, `20261030120000_mentor_limite_protegido.sql`, `20261103120000_mentor_retencao.sql` e `20261106120000_modulos_por_casa.sql` (cria `restaurantes.modulos`). Sem as quatro primeiras, toda pergunta cai em `falha_mentor_limite` (o mentor fecha, educadamente, mas fica fora do ar). Sem a última, o cartão "Módulos" do admin e a leitura de `casa.modulos` quebram em produção.
2. **Conta de IA e chave:** criar a conta do produto no provedor e pôr `MENTOR_IA_CHAVE`, e `MENTOR_IA_MODELO` com um modelo concreto, nas variáveis da Vercel.
3. **Teste manual com o Gemini de verdade** (a suíte não chama a API): conferir uma pergunta com ferramenta, uma pergunta fora do assunto, uma pergunta fiscal, o limite e o tempo de resposta.
4. Os dois itens de produto que estavam pendentes (acesso do admin às telas e aviso de privacidade do dono) **foram feitos em 03/11/2026**: [`divida-tecnica.md`](../divida-tecnica.md) itens 67 e 68, em "Resolvidos". Nada a fazer aqui. O Vertex AI em São Paulo **não** é pré-requisito: o Lucas Ferreira confirmou o Gemini no piloto (D-73, item 69).
5. Conferir no celular (390 px) e no computador, com tema claro e escuro, o chat vazio e o chat com conversa.
6. Conferir que a rotina `rf-limpa-mentor` aparece no `cron.job` da nuvem (consulta do §6).

## 9. Ligar o mentor numa casa

Por padrão o mentor vem **desligado em toda casa**, as que já existem e as novas (D-74). Enquanto está desligado, a aba some do menu do dono e o endereço do chat responde 404.

Para ligar: admin, abra a casa (detalhe do restaurante), cartão **"Módulos"**, botão **"Ligar o Mentor"**. Vale na hora para aquela casa e só para ela.

- Desligar de novo **não apaga as conversas**: elas ficam guardadas (até os 12 meses do §6) e voltam a aparecer se o mentor for religado.
- A casa de demonstração é a 1ª exceção: ela não vem ligada sozinha; o admin liga o mentor nela na publicação, como em qualquer casa.
- Esconder a aba é só conforto; a trava de verdade está no servidor, que recusa a pergunta de quem está com o módulo desligado.
