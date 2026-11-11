# Mentor Fase 3 — Memória e contexto — desenho

**Data:** 11/11/2026
**Status:** aprovado por Lucas Ferreira (partes 1–3, em conversa)
**Decisões:** D-72, D-73, D-74, D-75; sem número novo (regras novas cabem nas existentes)
**Relacionado:** roadmap Fase 3 (issue #4), desenho da Fase 2 (`2026-11-10-mentor-fase-2-sessoes.md` plano; sessões na main)

## 1. Objetivo

O mentor passa a lembrar do contexto entre conversas: fatos que o dono contou (nome, preferências, pontos da casa) e um resuminho do que já foi conversado. Na pergunta seguinte, ele usa essas lembranças junto com os números das ferramentas. Continua valendo tudo da v1: número só de ferramenta, trilhos fixos, cartilha global, limite de 50 usos por dia, RLS por casa.

## 2. Decisões vinculantes

1. O que se guarda: **fatos + resumo** (abordagem A, aprovada). Nada de resumão único nem busca vetorial nesta fase.
2. Cada lembrança é uma **ficha separada**, com texto curto, tipo e origem.
3. O dono **vê e apaga**: tela "O que o mentor lembra", com apagar por ficha e "esquecer tudo".
4. Conversa excluída mata na hora as fichas nascidas dela ("morre junto"). A cópia de 60 dias da conversa (D-75) continua só para segurança e **não alimenta respostas**.
5. Gerar fichas **não gasta** os 50 usos do dia (é trabalho interno, não pergunta do dono).
6. O admin **não vê as fichas** nesta fase (menos dado circulando).

## 3. Dados

Tabela nova, por migration aditiva, RLS no mesmo arquivo, sem `FORCE ROW LEVEL SECURITY`:

```sql
mentor_memorias (
  id uuid primary key,
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 200),
  tipo text not null check (tipo in ('fato','resumo')),
  conversa_id uuid null references mentor_conversas(id) on delete cascade,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
)
```

- `conversa_id` nulo = fato que o dono contou direto (sem conversa de origem) ou resumo que juntou várias conversas.
- Teto: **50 fichas por casa** (constante, como o limite diário). Chegou no teto, a mais antiga (por `atualizada_em`) sai — sem erro para o dono.
- Dono: SELECT nas fichas da casa dele. Sem escrita direta do navegador (sem INSERT/UPDATE/DELETE para `authenticated`): nascer, atualizar (deduplicar), apagar por ficha e "esquecer tudo" passam por função do servidor, que confere a casa da sessão e escreve com a chave de serviço (padrão do apagar-de-verdade das sessões).
- Sem DELETE direto para `authenticated` (padrão das conversas); quem apaga de verdade é o dono pelo botão (via função), a faxina e o suporte se preciso.
- Tipos regenerados com `npm run types`, sem inventar à mão.

## 4. Ciclo de vida

1. O mentor responde normal (ferramentas + trilhos + cartilha + **fichas atuais** injetadas no pedido, marcadas como lembranças).
2. Depois da resposta pronta, o servidor faz **uma chamada separada** ao provedor: "disso que acabou de acontecer, o que vale guardar como fato ou resumo? Nada? Responda o JSON ou vazio".
3. A resposta passa por validação rígida antes de gravar: texto 1–200 letras, tipo válido, sem dado pessoal de cliente de restaurante (que nem existe no banco), sem segredo, sem repetir ficha igual (atualiza a existente em vez de duplicar).
4. Falha nessa chamada **nunca quebra a conversa**: o dono já recebeu a resposta; o erro vai para o log só como código.
5. Excluir conversa apaga na hora as fichas com aquele `conversa_id` (na mesma ação de excluir, junto da marca). Faxina (pg_cron, junto da existente): apaga fichas com `atualizada_em` de mais de 12 meses; ficha de conversa excluída já saiu no passo anterior, não espera.

## 5. Telas

- **"O que o mentor lembra"**, ligada à página do Mentor: lista cada ficha com tipo, texto e data; botão de apagar em cada uma; botão "esquecer tudo" com confirmação (texto claro: o mentor para de usar na hora).
- Abaixo do campo do chat, um aviso curto: "o mentor lembra do que vocês já conversaram; veja e apague em 'O que ele lembra'".
- Celular primeiro, computador funcionando; claro/escuro; casa sem ficha mostra estado vazio (não erro).
- Admin: sem tela de fichas nesta fase.

## 6. Privacidade e limites

- Ficha é sempre da casa da sessão (`restaurante_id` da sessão, nunca do modelo). RLS barra cruzamento; teste de isolamento A/B obrigatório.
- Nada de ficha vaza para o log (só código de falha). Teste prova que texto de ficha não aparece em log/resposta de erro.
- Custo sob controle: 1 chamada extra por resposta no máximo, pedido curto, teto de 50 fichas, sem reprocessar o histórico ("sem reprocessar tudo a cada pergunta", roadmap).
- Uso do dia: só a pergunta conta; geração e injeção de fichas não contam.

## 7. Testes obrigatórios

- Isolamento A/B (ler, apagar, esquecer-tudo cruzado é negado).
- Nascer/atualizar/deduplicar ficha a partir de resposta fictícia (provedor dublê).
- Validação rígida recusa texto longo, tipo inválido e repetida.
- Excluir conversa mata as fichas dela na hora; resto intacto.
- Teto de 50: a 51ª aposenta a mais velha sem erro.
- Falha na geração não quebra a resposta do dono.
- Fichas entram no pedido marcadas como lembrança (fato separado de conselho).
- Tela: lista, apagar, esquecer-tudo, aviso, vazio; admin sem acesso.
- Regressão: chat, sessões, limite, cartilha e trilhos intactos (Fase 1 do sócio não quebra).
- `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`; visual 390 px + computador, claro/escuro.

## 8. Critérios de aceite

1. Pergunta nova usa ficha de conversa passada (provado com dublê + teste).
2. Dono vê, apaga por ficha e esquece tudo; efeito imediato nas respostas.
3. Excluir conversa mata as fichas dela na hora; cópia de 60 dias não alimenta resposta.
4. Nenhuma casa lê ficha de outra; nada de ficha em log.
5. Teto e limite do dia respeitados; falha de geração invisível ao dono.
6. Nenhuma migration, função ou dado de produção alterado nesta etapa.

## 9. Fora do escopo

- Anexos (Fase 4, issue #5).
- Busca vetorial/embeddings; resumão único.
- Tela de fichas no admin; edição de texto da ficha (só apagar).
- Cartilha por casa; memória compartilhada entre casas.
- Publicar em produção (passo à parte, com autorização).
