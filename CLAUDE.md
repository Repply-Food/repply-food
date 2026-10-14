@AGENTS.md

# CLAUDE.md · repply food.

**Leitura obrigatória antes de escrever qualquer código.** O `AGENTS.md` (acima) liga as skills e resume as regras. Este é o manual completo.

---

## 1. O que é este projeto

O **repply food.** é o painel do dono de bar e restaurante: os números da casa no celular, quase em tempo real, vindos do sistema de caixa da SCC Software que o restaurante já usa. É uma marca de mercado própria da Repply (D-08), feita em parceria com a SCC.

```
SCC (Delphi, no restaurante) ──POST a cada ~5 min──▶ receber-envio (Supabase) ──▶ Postgres + RLS ──▶ painel (Next.js, PWA)
```

| Documento | Para quê |
|---|---|
| [`SPEC.md`](SPEC.md) | O produto: dor, quem usa, módulos, escopo por fase, critérios de aceite |
| [`docs/decisoes.md`](docs/decisoes.md) | As decisões numeradas (D-xx). **Não reabrir sem falar com o Lucas Ferreira** |
| [`docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md`](docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md) | O desenho técnico do MVP |
| [`docs/README.md`](docs/README.md) | Índice de tudo o que está em `docs/` |

## 2. Stack

| Camada | Escolha | Observação |
|---|---|---|
| App | **Next.js (App Router) + React + TypeScript estrito** | Mesma base do Repply Imob (D-04) |
| UI | **Tailwind CSS 4** (configuração no CSS) + **shadcn** (estilo base-nova, sobre `@base-ui/react`) + lucide | Slot com `render={<X />}`, **não** `asChild` (padrão do Imob) |
| Gráficos | Recharts, via o `ChartContainer` do shadcn | Como o dashboard do Imob |
| Formulários | react-hook-form + Zod | Zod sem `.default()` (padrão do Imob) |
| Banco, Auth, funções | **Supabase**: Postgres + RLS, Auth, Edge Functions (Deno), pg_cron, pg_net, Vault | Piloto no plano Free; no 1º cliente pagante vai para a org Pro (D-09) |
| E-mail | Resend | Alarme do vigia e e-mails de senha |
| Testes | Vitest | Unidade e integração com o banco local do Supabase |
| Lint/formato | Biome | Mesma configuração do Imob |
| Hospedagem | **Vercel Hobby no piloto**, deploy manual pela CLI | Proíbe uso comercial: sair no gatilho D-09 |

**Peças do Repply Imob a reaproveitar** (copiar e adaptar, não reinventar):
- `app/styles/tokens.css` e `app/styles/brand.css`: tokens de marca em 3 camadas, `signature-dot`, `label-mono`, ilhas `.scheme-ink`/`.scheme-paper`;
- `tests/design-tokens.test.ts`: mede o contraste lendo o CSS de verdade;
- `lib/supabase/` (os 3 clientes);
- `lib/auth/guards.ts`;
- os cabeçalhos de segurança do `next.config.ts`;
- `lib/logger.ts` (`logError`, sem dado pessoal);
- `biome.json` e `vitest.config.ts`;
- `app/(app)/app/[orgSlug]/dashboard/` (gráficos e filtros pela URL) como referência das telas de métricas.

**Do Imob que NÃO serve aqui:**
- `instrumentation.ts` com `setInterval`;
- o limitador de tentativas em memória.

Na Vercel não existe servidor sempre ligado. Rotinas vão para o **pg_cron**, e o limite de tentativas fica no banco.

**Padrões do Repply CRM a seguir na recepção e no vigia:**
- webhook que fecha por padrão;
- idempotência pela chave;
- `config.toml` comentando cada `verify_jwt`;
- "sinal de vida" com alarme;
- pg_cron + pg_net + Vault.

## 3. Como pedem as coisas

Há duas pessoas pedindo, e o jeito de responder muda:

- **Lucas Ferreira**, dono do produto. **Não programa**; pede tudo via IA. Toda mensagem para ele vai em **PT-BR coloquial**, com a **consequência antes do mecanismo**. Jargão técnico só dentro do código.
- **Lucas Duarte**, desenvolvedor. Pode receber linguagem técnica. Na dúvida sobre quem está pedindo, use a linguagem simples.

| Em vez de | Diga |
|---|---|
| "schema", "migration" | "tabela do banco", "mudança na estrutura do banco" |
| "Server Action" | "função do servidor" |
| "RLS denied" / "PostgREST error" | "a regra de segurança do banco bloqueou essa consulta" |
| "Edge Function" | "a função na nuvem que recebe os dados do SCC" |
| "upsert idempotente" | "se o mesmo dado chegar de novo, não duplica" |
| "hydration mismatch" | "o servidor mostrou uma coisa e o navegador esperava outra" |
| "deploy" | "publicar" |
| "cron" | "rotina automática" |

## 4. Vocabulário do produto (não ignore)

| Na tela | No banco | No SCC | Observação |
|---|---|---|---|
| a casa, o restaurante | `restaurantes` | — | "Casa" é a palavra do setor |
| conta, mesa | `entradas` | Entrada | Uma sessão de mesa ou cartão, da abertura ao fechamento |
| faturamento da casa | `valor_consumido − taxa_servico` das pagas | `ValorConsumido`, `TaxaServico` | **Taxa sempre separada** (D-14) |
| taxa de serviço, "os 10%" | `taxa_servico` | `TaxaServico` | Costuma ir para os garçons |
| dia (de operação) | `dia_operacao` | — | Começa na hora de virada (padrão 5h). Mesa da madrugada conta no dia da abertura |
| contas esquecidas | abertas há mais de `limite_conta_esquecida` | `DataSaida` vazia | Padrão: 4 h (M04) |
| atualizado há X min | `sinal_de_vida` | — | Verde ≤ 15 min, amarelo ≤ 45, vermelho acima |
| envio | `envios` | o POST | O que o SCC manda a cada ciclo |
| janela | `janela.desde/ate` | `UltimaDataConfirmada` | Período coberto por um envio (contrato §6) |
| token de envio | `tokens_envio` | `Token` no .ini | Identifica o restaurante. Mostrado uma vez |
| admin | `admins_repply` | — | Equipe Repply. **Não é cargo do restaurante** |
| ver o painel do cliente | RLS de leitura do admin | — | Só leitura (D-38) |

**Códigos do SCC** (`cod_garcom`, `cod_operador_*`, `cod_cartao_mesa`) aparecem como "Garçom 27" até a SCC mandar os cadastros (H11).

## 5. Convenções

- **Idioma:**
  - interface em português do setor;
  - **domínio em português em tudo**: tabelas, colunas, tipos e funções (`entradas`, `faturamentoDaCasa`, `metrica_faturamento_casa`);
  - termos técnicos genéricos podem ficar em inglês (`createClient`, `middleware`).
- **Arquivos:**
  - nomes em `kebab-case`;
  - componentes em `PascalCase`;
  - SQL em `snake_case`;
  - migrations em `supabase/migrations/AAAAMMDDHHmmss_<tema>.sql`.
- **Funções do servidor** devolvem `{ ok: true, data? } | { ok: false, error: string }`, e o `error` é uma frase do produto, nunca o `error.message` do Postgres.
- **Rotas:** o restaurante vai na URL (`/r/[slug]/hoje`), como o `[orgSlug]` do Imob. Toda página começa pelo guarda de acesso.
- **Métricas:**
  - **só pelas funções SQL `metrica_*`**, definidas em [`docs/metricas.md`](docs/metricas.md);
  - a tela, o PDF e o admin chamam as mesmas funções;
  - nunca recalcule uma métrica em TypeScript.
- **Dinheiro:** `numeric` no banco e `string`/`Decimal` no código. Nunca `number` para somar centavos. Formatação `R$ 1.234,56` num utilitário só.
- **Datas e horas:** gravadas como `timestamptz`; a exibição e o "dia" usam o **fuso do restaurante**, nunca o do servidor nem o do navegador.
- **Filtros de tela** ficam na URL (`?periodo=7d&aba=vendas`), como no Imob.

## 6. Regras absolutas (violar = bug crítico)

**Banco e segurança** (detalhe em [`docs/arquitetura/seguranca-e-isolamento.md`](docs/arquitetura/seguranca-e-isolamento.md)):
1. Toda tabela nova nasce **por migration**, com RLS **no mesmo arquivo**. Nunca crie tabela pelo painel.
2. Toda tabela de dado de restaurante tem `restaurante_id`, e a política usa `tem_acesso(restaurante_id)`.
3. **Proibido `FORCE ROW LEVEL SECURITY`.** As funções auxiliares usam `security definer` + `set row_security = off`.
4. O `restaurante_id` vem do token (recepção) ou da sessão + `acessos` (painel). **Nunca do corpo da requisição nem da URL sem conferir.**
5. Código com chave de serviço filtra `restaurante_id` explicitamente.
6. Zero linhas afetadas numa escrita **não é sucesso**.
7. Migrations só se **acrescentam**.
8. Nenhuma credencial no git. A chave de serviço nunca tem prefixo `NEXT_PUBLIC_`.

**8.1.** Função nova no banco nasce fechada. O `grant execute` para `authenticated` é dado de propósito, na própria migration, e a função entra na lista de `tests/isolamento/funcoes-fechadas.test.ts` (`seguranca-e-isolamento.md` §2, item 12).

**Dados:**

9. **Nome, RG, telefone e sexo** de clientes do restaurante são descartados na recepção. Só é gravado o que está na lista do contrato §5 (D-29, D-51).
10. Os dados do restaurante **nunca** são usados para nada além do painel dele, nem para propostas do Hub (D-29).
11. Entrada do SCC nunca é apagada de verdade: vira `removida_em`.
12. Dado real nunca entra em teste, plano, desenho ou migration. Use o gerador de dados fictícios.

**Interface:**

13. **Celular primeiro, computador sempre funcionando**, em todas as telas, inclusive o admin (D-39). Confira as duas larguras antes de dizer "feito".
14. **O guia "coloque na tela inicial"** aparece **só no celular**, **uma vez por aparelho**, e **nunca** dentro do app instalado (`display-mode: standalone` / `navigator.standalone`) (D-36, D-39).
15. **Taxa de serviço sempre separada** do faturamento da casa (D-14).
16. **Um login por restaurante, sem cargos**: não crie tela de permissões (D-10).
17. **O tomate só aparece no símbolo.** O nome escrito é "repply food." com o ponto laranja (D-42).
18. Contas esquecidas: **no máximo 3 visíveis** + "ver todas (N)" (D-33).

**TypeScript:**

19. **Nunca `any`.** Tipos do banco gerados por `npm run types`.

## 7. Regras do domínio de restaurante

- A comparação do "Hoje" é contra a **média das últimas 4 ocorrências do mesmo dia da semana até o mesmo horário**, nunca contra o dia inteiro ([`metricas.md` §4](docs/metricas.md)).
- O "dia" vira na **hora de virada** do restaurante (padrão 5h). Mudar a virada exige `recalcular_dia_operacao`.
- "Atrasado" e "parado" só existem **dentro do horário de funcionamento**. Restaurante fechado nunca alarma.
- As regras de cortesia, fiado e dia de operação são **provisórias** até a SCC responder (B6, H5–H7). Não "conserte" sem conversar.

## 8. Identidade visual

**Fonte da verdade da marca: [`identidade-visual/`](identidade-visual/README.md)**, dentro deste repositório (D-48):
- [`brandbook.html`](identidade-visual/brandbook.html);
- [`logos/`](identidade-visual/logos/README.md). Os ícones do app ficam em `logos/app/` e são copiados para `public/`;
- [`fontes/`](identidade-visual/fontes/), que entram por `next/font/local`;
- [`gerador/`](identidade-visual/gerador/), que recria logos e brandbook.

**Telas aprovadas:** [`docs/telas/`](docs/telas/index.html).

| Elemento | Valor |
|---|---|
| Cor da marca | Repply Orange `#FF5A1F` |
| Preto / branco | `#0A0A0A` / `#FFFFFF` |
| Tomate (só no símbolo) | `#E8371F` (corpo), `#2F9E44` (folhas) |
| Cores de dado (só com significado) | acima `#1E9E5A` · abaixo `#D64545` · atenção `#E8A33D` |
| Fontes | General Sans (títulos e números grandes), Satoshi (texto), JetBrains Mono (números, com `tabular-nums`) |
| Tema | **Claro é o padrão**, com escuro opcional (D-12). Barra lateral do computador sempre escura |

**Medido no Imob, e contraria o instinto. Vale aqui também:**
1. **Texto sobre botão laranja é quase-preto, não branco.** Branco sobre `#FF5A1F` dá 3,12:1 e reprova.
2. **Laranja nunca é cor de texto pequeno** sobre branco (3,12:1). Ênfase vem de preenchimento laranja com texto escuro, do ponto ou do micro-rótulo mono.
3. **A legenda não usa o `#737373` do brandbook sobre fundo cinza** (4,35:1 reprova). Use os tokens do Imob.
4. **Cor nunca é o único canal.** Verde e âmbar têm a mesma luminância; acompanhe sempre de seta (▲▼) ou texto.

Copie o `tests/design-tokens.test.ts` do Imob. **`tsc` e `build` não pegam regressão de cor**; esse teste é a única rede.

## 9. Verificação obrigatória antes de dizer "feito"

Os comandos exatos entram aqui quando o projeto tiver `package.json`. O padrão herdado do Imob:

```bash
npx tsc --noEmit     # 0 erros
npm run check        # Biome
npm run test         # Vitest verde
npm run build        # build completa
```

**Mudou tela?** Abra no navegador em largura de **celular (390 px)** e de **computador**, e confira:
- o tema claro e o escuro;
- o estado vazio (restaurante sem dados).

**Mudou recepção ou métrica?** Rode os testes de `recepcao-de-dados.md` §4 e o exemplo de conta de `metricas.md` §2.

**Não afirme "funciona" sem evidência** (`verification-before-completion`).

## 10. Anti-padrões (proibido)

- Recalcular métrica em TypeScript em vez de chamar a função SQL.
- Confiar em `restaurante_id` vindo do navegador.
- Mostrar `error.message` do banco para o usuário.
- `setInterval` ou estado em memória para rotina ou limite (Vercel).
- Guardar dado pessoal de cliente do restaurante "só por enquanto".
- Tela feita só para celular ou só para computador.
- Rodar `npx shadcn add` num componente que já foi personalizado: sobrescreve as decisões de marca (Imob).
- O micro-rótulo `/ nome-da-seção` acima do título. O Imob baniu por parecer "gerado por IA".
- `git add -A`, `--force`, `--no-verify`.

## 11. Quando parar e perguntar

Veja o `AGENTS.md` §4. **Escalar não é falha, é disciplina.** Trabalho ruim é pior que trabalho não feito.

## 12. Git

- **Fluxo:**
  - direto no `main`, sem PR, como no CRM;
  - desenho → plano → execução por tarefas;
  - commits pequenos em **PT-BR, no imperativo** ("Cria a tabela de entradas com RLS").
- **Cuidados ao commitar:**
  - antes de commitar, `git status --short` num comando separado;
  - **nunca `git add -A`**: liste os arquivos;
  - a migration vai no mesmo commit da funcionalidade que a usa.
- **Remoto:**
  - o repositório é **`github.com/Repply-Food/repply-food`**, privado (D-47);
  - antes de commitar, `git fetch` e confira se entrou commit de outra pessoa (o Lucas Duarte também trabalha aqui);
  - `git push` para o `main` só depois da verificação do §9. **Publicar** (Vercel, Supabase) é outra coisa e pede autorização;
  - o `github.com/Repply-Food/scc-dashboard` é o **simulador em C++** do Lucas Duarte, um repositório separado. Não misture os dois.
- **Trailer de coautoria** nos commits feitos com IA: o que a ferramenta indicar.

## 13. Estrutura (planejada)

```
repositorio/
├── AGENTS.md · CLAUDE.md · SPEC.md · README.md · PROMPTS.md
├── app/                      # Next.js: (auth)/entrar, trocar-senha · r/[slug]/{hoje,resultados,ajustes} · admin/
├── components/               # ui/ (shadcn personalizado) · painel/ · admin/
├── lib/                      # supabase/ · auth/ · metricas/ (chamadas às funções SQL) · formato/ (dinheiro, data)
├── supabase/
│   ├── migrations/
│   ├── functions/receber-envio/ · enviar-alerta/
│   └── config.toml
├── tests/                    # recepção, isolamento, métricas (exemplo de conta), design-tokens
├── scripts/                  # gerador de dados fictícios, sincronizar-skills.mjs
├── public/                   # ícones do app (copiados de identidade-visual/logos/app/)
├── identidade-visual/        # marca: brandbook, logos, fontes, gerador (fonte da verdade)
├── .claude/skills/ · .agents/skills/
└── docs/                     # ver docs/README.md
```

## 14. Quando estiver perdido

1. Releia o `SPEC.md` §4 (módulos) e o desenho do MVP.
2. Procure a decisão em `docs/decisoes.md`.
3. Veja a tela em `docs/telas/`.
4. Para métrica, `docs/metricas.md`. Para envio, `docs/integracao-scc/contrato-de-dados.md`.
5. Ainda em dúvida? Pergunte. Não invente regra de negócio.
