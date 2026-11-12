# Mentor de IA: operação

*Como a equipe Repply opera o mentor: editar a cartilha, ler as conversas, configurar o provedor, entender o limite diário e a retenção. Decisões: D-72 (escopo, cartilha, leitura das conversas, 12 meses), D-73 (provedor) e D-75 (conversa excluída, 60 dias). Desenho: [`2026-10-29-agente-mentor-ia-design.md`](../superpowers/specs/2026-10-29-agente-mentor-ia-design.md); plano: [`2026-10-29-agente-mentor-ia-v1-chat.md`](../superpowers/plans/2026-10-29-agente-mentor-ia-v1-chat.md).*

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
- **Só leitura**, como "ver o painel do cliente" (D-38): o admin não edita conversa nem mensagem (a RLS barra).
- Conversa excluída pelo dono continua na lista do admin, marcada como **excluída**, enquanto durar a cópia de segurança. No pedido do cliente ao suporte, o admin usa **"Apagar de verdade"** para removê-la na hora.
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
| `MENTOR_IA_MODELO` | Qual modelo do provedor. **Em produção, fixe um modelo concreto**: o padrão é o apelido `gemini-flash-latest`, que a Google move sozinha, e o comportamento do mentor mudaria sem ninguém mexer. **No nível grátis do Gemini, o `gemini-flash-latest` vive sobrecarregado e devolve 503 ("high demand") — o dono vê "indisponível"; use `gemini-flash-lite-latest`, que responde** | `gemini-flash-latest` |

- O provedor é uma interface trocável (`lib/mentor/provedor/`): trocar para Claude ou GPT é escrever outra implementação e mudar `MENTOR_IA_PROVEDOR`, sem mexer no resto (D-73).
- **A conta de IA do produto é separada da conta do Claude Code** que usamos para desenvolver. É uma conta nova, paga por uso, em nome da Repply.
- Hoje o código fala com a **API do Gemini por chave** (`@google/genai`), e **no piloto é assim que segue** (decisão confirmada pelo Lucas Ferreira em 03/11/2026, D-73): os números do negócio vão para a Google. O desenho preferia o Vertex AI em São Paulo (dado processado no Brasil, D-50); ele fica **adiado, como melhoria futura**, e **não bloqueia a publicação** ([`divida-tecnica.md`](../divida-tecnica.md), item 69). Confirmar nos termos do provedor que a API paga não treina com os nossos dados.
- **Nunca rode teste com a chave real.** Os testes usam um provedor dublê; a API do Gemini nunca é chamada pela suíte.
- **Mudou uma variável na Vercel? Faça um _Redeploy_.** A Vercel só injeta as variáveis de runtime num deploy NOVO: adicionar ou alterar uma variável **não** afeta o deploy que já está no ar até você republicar (Deployments → ⋯ → Redeploy). Foi o que derrubou o primeiro teste em produção (10/11/2026): a chave estava na Vercel, mas o `MENTOR_IA_MODELO` foi adicionado **depois** do deploy e, sem redeploy, o mentor seguiu no `gemini-flash-latest` → 503 → "indisponível".

## 5. O limite diário por casa

- **50 usos por casa por dia de operação** (`TETO_DIARIO`, em `lib/mentor/limite.ts`). Um "uso" é uma pergunta enviada ao mentor.
- O contador vive **no banco** (tabela `mentor_uso`, uma linha por casa e dia), não em memória (lição da Vercel, como a trava de senha, D-64). Só anda por duas funções do banco: `mentor_registrar_uso` soma 1, chamada com o login do dono (ele não consegue zerar o próprio contador, e o admin em modo leitura não gasta o limite do cliente), e `mentor_devolver_uso` tira 1, **só o servidor executa** (se o dono pudesse, baixaria o próprio contador).
- O **dia é o dia de operação da casa** (fuso e hora de virada dela), não o do servidor.
- **O uso é contado antes de chamar a IA** (é o que impede dois pedidos ao mesmo tempo de furar o teto). Se o contador falhar, o mentor fecha ("indisponível"); nunca libera por falta de resposta.
- **Uma tentativa barrada pelo teto conta.**
- **Uma tentativa em que a IA não foi alcançada não consome a cota.** Provedor fora do ar, sem resposta ou com resposta vazia (`falha_mentor_provedor`): o servidor devolve o uso que acabou de contar e o dono pode tentar de novo, em vez de travar o dia por uma falha nossa. Falha de outro tipo (a IA respondeu e a conversa não pôde ser concluída) mantém o uso contado, porque a IA gastou. Se a própria devolução falhar, a tentativa fica contada e o log leva `falha_mentor_limite`.
- **Para mudar o teto:** trocar a constante e publicar. O banco não guarda teto por casa.
- A tabela `mentor_uso` é o único lugar para ver o consumo (o admin lê de todas as casas).

## 6. Retenção: 60 dias para excluídas, 12 meses para o resto

- Quando o dono exclui uma conversa, ela some da lista dele, mas fica como cópia de segurança da empresa por até **60 dias**, para segurança e suporte. A tela avisa esse prazo ao excluir. Depois, a rotina a apaga de verdade sozinha (D-75).
- Se o cliente pedir pelo suporte, o admin pode usar **"Apagar de verdade"** e removê-la na hora, sem esperar os 60 dias.
- Arquivar é diferente de excluir: só tira a conversa da lista principal do dono, e ele pode trazê-la de volta.
- As conversas e mensagens que não foram excluídas pelo dono ficam **12 meses** e depois são apagadas (D-72).
- **Quem apaga:** a função `public.limpar_conversas_mentor()`, chamada pela rotina `rf-limpa-mentor` do pg_cron, **todo dia às 06:00 UTC** (03:00 em Brasília), depois das outras limpezas (05:00 a 05:45). Migration `20261103120000_mentor_retencao.sql`. As fichas da memória entram na mesma faxina (§10), e as fichas dos anexos também (§11).
- **A regra:** conversa excluída pelo dono é apagada inteira ao completar 60 dias. Nas demais, cada **mensagem** é apagada pela própria data (`criada_em` com mais de 12 meses). A **conversa** só é apagada quando também tem mais de 12 meses e **ficou sem nenhuma mensagem**. Assim, uma conversa antiga que o dono retomou ontem não perde as mensagens de ontem.
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
| Por quanto tempo? | 60 dias quando o dono exclui; 12 meses nos demais casos (§6) |
| O dono é avisado? | Sim, no chat, abaixo do campo: a equipe da Repply pode ler a conversa para dar suporte, e ela ajuda a melhorar a inteligência artificial (§1; resolveu o item 68 de [`divida-tecnica.md`](../divida-tecnica.md)). Fica por decidir, sem pressa, se entra também uma linha na política de privacidade |
| O dono vê a cartilha? | Não na tela (ela não existe para o dono e o banco barra a leitura), mas isso é garantia da **interface e da RLS, não da saída do modelo**: um dono insistente poderia fazer o mentor repetir o texto da cartilha. Ela é guia de tom, sem segredo e sem dado de outra casa; não ponha nela nada que a Repply não aceitaria ver vazar (nota na D-72) |
| Para onde vão os dados na IA? | Para a API do Gemini (Google), por chave, no piloto: a cartilha, os trilhos, as perguntas e os números de negócio vão para fora do Brasil, sem dado pessoal. O Vertex AI em São Paulo fica adiado, como melhoria futura (D-73, item 69) |
| Uma casa vê a conversa de outra? | Não. RLS em `mentor_conversas` e `mentor_mensagens`, com teste de isolamento, e a mensagem só entra em conversa da mesma casa |

## 8. Antes de publicar

Nada abaixo foi feito. Cada passo na nuvem pede o ok do Lucas Ferreira na hora (`AGENTS.md` §4).

1. **Aplicar as migrations do mentor na nuvem, ANTES do deploy do painel:** `20261030100000_mentor_conversas.sql`, `20261030110000_mentor_cartilha_uso.sql`, `20261030120000_mentor_limite_protegido.sql`, `20261103120000_mentor_retencao.sql`, `20261106120000_modulos_por_casa.sql` (cria `restaurantes.modulos`) e `20261111090000_mentor_memorias.sql` (cria `mentor_memorias` e põe as fichas na faxina, §10) e `20261112090236_mentor_anexos.sql` (cria o cofre `mentor-anexos` e a tabela `mentor_anexos`, e põe os anexos na faxina, §11). Sem as quatro primeiras, toda pergunta cai em `falha_mentor_limite` (o mentor fecha, educadamente, mas fica fora do ar). Sem a dos módulos, o cartão "Módulos" do admin e a leitura de `casa.modulos` quebram em produção. Sem a das fichas, o mentor responde sem memória e a tela de lembranças cai na tela de erro. Sem a dos anexos, a pergunta com arquivo responde sem analisar o arquivo (aviso `anexosFalharam`, sem derrubar a resposta); a pergunta sem arquivo segue normal.
2. **Conta de IA e chave:** criar a conta do produto no provedor e pôr `MENTOR_IA_CHAVE`, e `MENTOR_IA_MODELO` com um modelo concreto (**no grátis, use `gemini-flash-lite-latest`** — o padrão `gemini-flash-latest` dá 503), nas variáveis da Vercel. **Depois de adicionar ou alterar qualquer variável, faça um _Redeploy_** — a Vercel só aplica env novo num deploy novo.
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

## 10. A memória do mentor (fichas)

O mentor lembra fatos e resumos curtos sobre a casa e o dono entre conversas ("o dono prefere conselho direto"). Cada lembrança é uma **ficha** na tabela `mentor_memorias`: `texto` (1 a 200 letras), `tipo` (`fato` ou `resumo`) e `conversa_id` (onde o mentor soube; nulo = ficha geral da casa). Migration `20261111090000_mentor_memorias.sql`.

- **Teto: 50 fichas por casa.** Ficha nova com a casa cheia aposenta a mais antiga (pela `atualizada_em`). Texto igual ao de uma ficha existente renova a ficha em vez de duplicar.
- **O que alimenta:** após cada resposta com sucesso, uma chamada separada ao provedor recebe a pergunta e a resposta e devolve até 5 fichas novas em JSON (o código corta em 5 e valida tudo; número que vem de ferramenta nunca vira ficha). É auxiliar: se falhar, vira só o código `falha_memoria_mentor` no log e a resposta segue. **Não gasta a cota do dia** (§5).
- **Como entra na resposta:** as fichas vão no pedido depois do "dia de hoje", marcadas como lembranças (podem estar desatualizadas). Fato de ficha nunca substitui número de ferramenta. Sem ficha, o pedido é igual ao de hoje.
- **Telas do dono:** `/r/[slug]/mentor/lembrancas` ("O que o mentor lembra", com link no cabeçalho do mentor e uma linha abaixo do campo do chat). Dá para apagar uma ficha ou esquecer tudo (confirmação dupla: o mentor para de usar na hora, sem volta). Falha de leitura cai na tela de erro, nunca mostra a lista vazia por engano.
- **Retenção e morte-junto:** ficha sem mexer há **12 meses** aposenta na faxina do §6 (vale o `atualizada_em`: confirmar a ficha renova o prazo) e entra no contador de mensagens sem mudar o formato. Excluir a conversa apaga na hora as fichas **dela** (as gerais da casa ficam); apagar a casa ou o "apagar de verdade" do admin leva as fichas junto, em cascata.
- **Excluir não é atômico (limitação conhecida, lado seguro):** as fichas saem antes da marca de excluída; se a marca falhar depois, a conversa continua visível sem as fichas, e excluir de novo resolve. O inverso seria pior (ficha fantasma alimentando resposta).
- **Cascata dos 60 dias não conta na faxina:** a ficha que some junto com a conversa apagada de verdade (pelo caminho dos 60 dias ou pelo admin) não entra no contador — só contam as aposentadas pelo corte dos 12 meses. Na prática, as fichas da conversa excluída já morreram no excluir.
- **O admin não tem tela de fichas** (no `/admin`, só as conversas, §3). Abrindo as lembranças de uma casa em modo leitura, ele vê a lista sem botões. E o navegador nunca escreve ficha direto (não há política de escrita): quem grava ou apaga é a função do servidor, com a chave, sempre com a casa da sessão — outra casa nunca aparece.

## 11. Os anexos do mentor (arquivos)

O dono pode mandar até **5 arquivos por pergunta, de no máximo 10 MB cada**: imagem (png, jpeg, webp), PDF e planilha (xlsx, csv). O mentor recebe os bytes junto da pergunta e analisa junto do texto. Fora da regra, a recusa sai com frase do produto **sem gastar a cota do dia** e sem chamar o provedor (a validação acontece antes de contar o uso, §5).

- **Cofre privado:** os arquivos vão para o bucket `mentor-anexos`, fechado de propósito (sem política nenhuma em `storage.objects`: o navegador nunca toca direto). Cada arquivo tem uma **ficha** na tabela `mentor_anexos` (nome, tipo, tamanho real em bytes e caminho no cofre; `conversa_id` nulo = geral da casa, antes de vincular). A ficha vale pela casa (`restaurante_id` explícito em tudo, com RLS de leitura igual às conversas, §3); o navegador nunca escreve ficha direto — só a função do servidor, com a chave de serviço. Migration `20261112090236_mentor_anexos.sql`.
- **Esquecer-tudo não mexe em anexo:** o "esquecer tudo" das lembranças apaga só as fichas da memória (`mentor_memorias`). Anexo é conteúdo da conversa: sai com ela (abaixo), nunca com o esquecer-tudo. Travado em teste.
- **Excluir apaga os arquivos na hora:** excluir a conversa apaga os arquivos do cofre e as fichas antes da marca de excluída (mesma ordem das fichas: falha fecha sem marcar). A conversa excluída passa os 60 dias do §6 só como linha, sem arquivo. Apagar a casa leva as fichas em cascata, também sem arquivo.
- **Retenção:** a ficha com mais de **12 meses** sai na faxina do §6 (vale a `criada_em`; entra no contador de mensagens sem mudar o formato). O arquivo no cofre fica para a varredura abaixo.
- **Órfãos (a janela e a varredura):** o vínculo sobe para `pendente/` e só depois move para a pasta da conversa — primeiro o `move` no cofre, depois o `update` da ficha. Um tombo nesse intervalo deixa o arquivo novo sem ficha. A faxina de 12 meses e o apagar da casa também deixam arquivo sem ficha (apagam só a linha). O script `scripts/limpar-arquivos-orfaos-mentor.ts` lista o cofre pela chave de serviço e apaga o que não tem ficha: roda em **dry-run por padrão** (só lista) e **só contra o banco local**; `--executar` apaga de verdade. Rode quando o cofre crescer sem explicação (o dry-run mostra o tamanho do problema antes de mexer).
- **O que o admin vê:** o admin **não tem tela de fichas** (como nas lembranças, §10), mas **vê os anexos dentro da conversa** (`/admin/mentor/conversas/<id>`: nome, tipo, tamanho e o link temporário para baixar, que expira em 120 s). Só leitura, como o resto do modo leitura (D-38): sem enviar, sem apagar, sem mexer.
- **Semáforo de custo:** cada anexo segue como `inlineData` na primeira chamada ao provedor (só nela, não nas rodadas de ferramenta) — os bytes contam como entrada. O teto de 5×10 MB por pergunta limita o gasto; anexo recusado não chama a IA nem gasta a cota. A extração das fichas continua sendo 1 chamada auxiliar por resposta (§10).
