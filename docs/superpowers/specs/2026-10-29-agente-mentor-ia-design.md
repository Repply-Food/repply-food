# Agente mentor de IA — desenho (v1: chat)

**Data:** 2026-10-29 · **Estado:** desenho aprovado no brainstorming, aguardando revisão do Lucas Ferreira antes do plano de execução.

**O que é:** um mentor de IA para o **dono** do restaurante, dentro do painel. Ele conversa em português, **lê os números de verdade** da casa e **interpreta e aconselha**. É a Fase 2 do produto (SPEC §7; D-27 já previa "mentor que lê os números e conversa com o dono"; D-21: "o histórico longo é a matéria-prima do mentor"). Desenhado durante a etapa 11 (piloto).

**Escopo deste desenho:** a **v1 é só o chat** (o dono pergunta, o mentor responde e aconselha). Os **avisos proativos** (o mentor cutuca sozinho) ficam para a **v2** e estão descritos em "Fora de escopo (v1)".

---

## 1. Decisões deste desenho (para virar D-xx)

1. **Público:** mentor para o **dono** (o cliente da Repply). O dono só conversa; não configura o agente.
2. **Até onde vai:** **intérprete + consultor** — lê e compara os números E dá recomendação de gestão, com trilhos (seção 4).
3. **Modos:** chat (v1) **e** avisos proativos (v2). Mesmo cérebro, gatilho diferente.
4. **Controle:** **uma cartilha só** (o prompt do mentor), global, escrita e ajustada pela **Repply** no admin. A Repply também **lê as conversas**, só leitura, para melhorar o mentor e dar suporte.
5. **Como enxerga os números:** **consulta de verdade, na hora** (tool-use) — o modelo chama as funções `metrica_*` que já alimentam Hoje e Resultados. Nunca "chuta"; se não tem ferramenta, diz que não sabe.
6. **Provedor de IA:** **Gemini (Google)** como padrão do piloto, rodando preferencialmente em São Paulo (Vertex, dado no Brasil — alinha com D-50/LGPD). **O código é trocável** (abstração de provedor): dá para mudar para Claude/GPT sem refazer. *O Claude Code que usamos para DESENVOLVER é conta separada; não é a IA do produto, que é uma conta nova paga por uso.*
7. **Privacidade da conversa:** para o modelo vão só **números de negócio** (via ferramentas) — **nenhum dado pessoal** de cliente do restaurante (já descartado na recepção, D-29/D-51). As conversas ficam no banco (Supabase, São Paulo), com aviso ao dono *"esta conversa pode ser utilizada para aprimorar a inteligência artificial"* e **guarda de 12 meses**.
8. **Onde aparece:** **4º item no menu** do painel — "Mentor" (Hoje · Resultados · Mentor · Ajustes). Reverte em um item o enxugamento recente do Duarte (3 destinos); coordenar com ele.
9. **Limite de uso:** teto por restaurante (ex.: 50 mensagens/dia, configurável), guardado **no banco** — não em memória, pela lição da Vercel (igual à trava de senha, D-64).

---

## 2. Arquitetura e fluxo

```
DONO (celular/computador)
  │  pergunta em PT
  ▼
Aba "Mentor"  →  função do servidor (o "cérebro")
                   │  monta: cartilha (ativa) + trilhos + histórico + ferramentas
                   ▼
                 PROVEDOR DE IA (Gemini, trocável)
                   │  pede um número? → o servidor roda a metrica_* correspondente
                   │                      com o restaurante_id DA SESSÃO (nunca do modelo)
                   ◄──────────────────────── número real
                   ▼
                 resposta final → mostrada ao dono e GRAVADA (conversa + mensagens)

REPPLY (admin)
  • edita a cartilha (uma, global)
  • lê as conversas (só leitura, como "ver o painel do cliente", D-38)
```

**Ponto de segurança central:** o `restaurante_id` usado nas ferramentas vem **sempre da sessão** (login + `acessos`), **nunca** de nada que o modelo diga. O modelo não consegue pedir número de outro restaurante; a RLS é a segunda camada.

---

## 3. Componentes (unidades com responsabilidade única)

- **Banco (migration + RLS):** as tabelas da seção 5.
- **Provedor de IA (`lib/mentor/provedor/`):** uma interface `ProvedorIA` (uma função: "dada a conversa + ferramentas, devolva a próxima resposta/o pedido de ferramenta"), com uma implementação **Gemini** (padrão). Trocar de provedor = outra implementação, sem mexer no resto.
- **Cérebro / laço do agente (`lib/mentor/conversa.ts`):** monta o pedido (cartilha ativa + trilhos fixos + histórico + ferramentas), chama o provedor, executa os pedidos de ferramenta (mapeando para as `metrica_*` com o `restaurante_id` da sessão), repete até a resposta final, grava tudo. Aplica o limite antes de chamar o provedor.
- **Ferramentas (`lib/mentor/ferramentas.ts`):** o catálogo de funções que o modelo pode chamar = as `metrica_*` de Hoje e Resultados (faturamento, mesas abertas, contas esquecidas, comparação, curva, meta; e as de Resultados por período). Cada ferramenta tem nome, descrição e parâmetros (ex.: período), e roda a função SQL correspondente. (Os relatórios do Duarte podem virar ferramentas depois, quando homologados.)
- **Tela do chat (`app/r/[slug]/mentor/`):** lista de mensagens + campo de envio; estado vazio; o aviso de privacidade; celular e computador (D-39); segue a marca.
- **Admin (`app/admin/mentor/` ou dentro do admin atual):** editor da cartilha (salvar = nova versão ativa) + visualizador de conversas (lista por restaurante, leitura).
- **Limite (`lib/mentor/limite.ts`):** conta e barra por `restaurante_id`/dia, no banco.

---

## 4. Os trilhos (qualidade e segurança do conselho)

Fixos no código + reforçados pela cartilha:
- **Fica no assunto do restaurante;** fora disso, recusa com educação.
- **Separa fato de conselho:** o número vem sempre de ferramenta (dado real); a recomendação vem rotulada como sugestão ("uma ideia pra testar: …").
- **Não faz papel de advogado/contador:** em questão jurídica, trabalhista ou fiscal, orienta procurar um profissional.
- **Quando não tem o dado, diz que não tem** — não inventa número.

---

## 5. Modelo de dados

Todas por migration, com RLS no mesmo arquivo. Dado de restaurante usa `restaurante_id` + `tem_acesso(...)`.

- **`mentor_cartilhas`** (global, só admin): `id`, `texto`, `ativa boolean`, `criada_em`, `criada_por` (admin). Editar = inserir nova ativa e desativar a anterior (histórico preservado). O cérebro usa a ativa.
- **`mentor_conversas`** (por restaurante): `id`, `restaurante_id`, `titulo`, `criada_em`, `ultima_em`. RLS: `tem_acesso(restaurante_id)`; admin lê.
- **`mentor_mensagens`** (por restaurante): `id`, `conversa_id`, `restaurante_id`, `papel` (`dono`|`mentor`), `texto`, `criada_em`, `ferramentas_usadas jsonb` (quais números o mentor puxou — transparência/auditoria). RLS idem.
- **`mentor_uso`** (limite): `restaurante_id`, `dia date`, `contagem int`. Conta por dia; barra ao estourar.
- **Retenção:** rotina `pg_cron` apaga conversas/mensagens com mais de 12 meses (como as retenções que já existem).

---

## 6. Privacidade e segurança

- Para o provedor vão **só números de negócio** (resultados das ferramentas) + a cartilha + as mensagens do dono. **Nenhum dado pessoal** (não existe no banco pós-recepção, D-29/D-51).
- Provedor pela **API paga não treina** com os nossos dados (confirmar nos termos ao contratar). Gemini via **Vertex São Paulo** mantém o processamento no Brasil (LGPD, D-50).
- **Isolamento:** `restaurante_id` da sessão nas ferramentas; RLS em todas as tabelas; **teste de isolamento obrigatório** (um restaurante nunca vê conversa de outro).
- **Admin só leitura** das conversas (D-38).
- **Aviso ao dono** no chat: *"esta conversa pode ser utilizada para aprimorar a inteligência artificial"*. Guarda 12 meses.

---

## 7. Tratamento de erro (nunca erro técnico na cara do dono)

- Provedor fora do ar/lento → "o mentor está indisponível agora, tente de novo".
- Uma ferramenta/número falha → o mentor diz que não conseguiu puxar aquele dado.
- Passou do limite do dia → avisa com educação.
- Funções do servidor devolvem `{ ok, data } | { ok:false, error }` com frase de produto (padrão §5 do CLAUDE.md); log só com código.

---

## 8. Fora de escopo (v1) — fica para a v2

- **Avisos proativos** (resumo semanal, alertas "suas terças caíram"). Canal provável: **e-mail (Resend) + aviso no app**; **WhatsApp automático** só quando valer o investimento (API oficial da Meta, custo por mensagem). Mesmo cérebro, disparado por rotina.
- **Cartilha por restaurante** (hoje é uma só, global).
- **Relatórios como ferramenta** (entram quando homologados pela SCC).

---

## 9. Testes

- **Isolamento (obrigatório):** um restaurante nunca lê conversa de outro; as ferramentas só puxam número da casa da sessão.
- **Trilhos:** recusa fora do assunto; não inventa número (sem ferramenta → "não sei"); separa fato de conselho; manda ao profissional em jurídico/fiscal.
- **Limite:** barra ao estourar o teto diário.
- **Admin:** lê a conversa (só leitura); edita a cartilha (nova versão ativa).
- **Provedor trocável:** o cérebro funciona com um provedor dublê nos testes (sem chamar a API de verdade).
- **Padrões do projeto:** tipos, lint, build; conferir no celular e no computador (D-39).

---

## 10. A confirmar na execução (padrões configuráveis, não bloqueiam)

- **Modelo exato do Gemini** (ex.: Flash para o dia a dia; Pro para perguntas mais difíceis) — configurável.
- **Valor inicial do limite** diário (começa folgado, ex.: 50/dia).
- **Streaming** da resposta (ver a resposta "digitando") ou resposta de uma vez — decidir na tela.
