# Prompts para trabalhar com IA no repply food.

*Textos prontos para colar no Claude Code ou no Codex, no estilo do Repply Imob. Abra a sessão na pasta `Projetos/Repply Food/` (a ponte `CLAUDE.md` de lá carrega as regras deste repositório).*

---

## 🚀 1. Primeira sessão de desenvolvimento (fundação)

```
Vamos começar o desenvolvimento do repply food. Antes de qualquer coisa, leia nesta ordem:
repositorio/AGENTS.md, repositorio/CLAUDE.md, repositorio/SPEC.md, repositorio/docs/decisoes.md
e o desenho repositorio/docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md.

O desenho já foi aprovado na descoberta. Não reabra decisões registradas em docs/decisoes.md.
Use a skill writing-plans para escrever o plano da FUNDAÇÃO em
repositorio/docs/superpowers/plans/, cobrindo:
1) o projeto Next.js + Supabase com as peças do Repply Imob listadas no CLAUDE.md §2
   (tokens de marca, clientes Supabase, guardas de auth, cabeçalhos de segurança, logger,
   Biome, Vitest, teste de contraste de tokens);
2) as 8 tabelas de docs/arquitetura/modelo-de-dados.md, com RLS e testes de isolamento;
3) a função receber-envio + processar_envio, com os testes de docs/arquitetura/recepcao-de-dados.md §4;
4) o gerador de dados fictícios enviando pelo mesmo caminho.

Telas, admin, vigia, PWA e PDF ficam para planos seguintes. Me mostre o plano antes de executar.
```

## 📋 2. Planejar a próxima parte

```
Leia repositorio/AGENTS.md e repositorio/CLAUDE.md. Use a skill writing-plans para planejar
<TEMA: telas Hoje e Resultados | admin | vigia e alarme | PWA e guia de instalação | PDF>,
seguindo o desenho do MVP, docs/telas/ e docs/metricas.md. Celular e computador (D-39).
Me mostre o plano antes de executar.
```

## 🔧 3. Executar um plano

```
Execute o plano repositorio/docs/superpowers/plans/<ARQUIVO>.md com a skill
subagent-driven-development. Teste antes do código (test-driven-development).
Ao fim de cada tarefa, rode a verificação do CLAUDE.md §9 e me diga o que passou, com evidência.
Commits em PT-BR, direto no main, sem git add -A; git push depois da verificação.
Não publique (Vercel, Supabase de produção) sem me perguntar.
```

## 🐛 4. Algo não funciona

```
<DESCREVA O QUE ACONTECEU, ONDE E COMO REPETIR>
Use a skill systematic-debugging antes de propor conserto. Explique a causa em linguagem simples
antes de mexer no código.
```

## ✅ 5. Antes de publicar

```
Use requesting-code-review e verification-before-completion no que mudou desde o último
commit publicado. Confira as telas em largura de celular e de computador, a regra do tomate
(D-42), o guia de instalação (D-36/D-39) e os testes de isolamento entre restaurantes.
Depois me diga se está pronto para publicar, e só publique quando eu autorizar.
```

## 🧭 Contexto rápido (colar quando a IA perder o fio)

```
repply food. = painel web/PWA do dono de bar e restaurante. Dados vêm do sistema de caixa da
SCC Software (Delphi + SQL Server 2008) via POST a cada ~5 min para a Edge Function
receber-envio (Supabase), com token por restaurante. Banco central multi-restaurante com RLS,
chave (restaurante_id, cod_entrada). Next.js + Supabase, base do Repply Imob. Um login por
restaurante, sem cargos. Telas: Hoje, Resultados (Vendas/Horários/Equipe/Descontos), Ajustes,
Admin da Repply. Celular primeiro, computador sempre funcionando. Taxa de serviço sempre separada.
Tomate só no símbolo. Regras: repositorio/CLAUDE.md. Decisões: repositorio/docs/decisoes.md.
```
