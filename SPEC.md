# SPEC · repply food.

- **Versão:** 1.0
- **Data:** 08/10/2026
- **Autor:** Lucas Ferreira (produto) + Claude Code (engenharia)
- **Base técnica:** Next.js + Supabase, com peças do Repply Imob (D-04)
- **Marca:** [`identidade-visual/`](identidade-visual/README.md) (brandbook, logos, fontes)
- **Playbook:** `Playbooks e Identidade visual/Playbooks e processos comerciais/repply_playbook_v5.md`

## Índice

1. Visão do produto
2. Quem usa
3. Ponto de partida
4. Módulos
5. Dados
6. Identidade visual
7. Escopo por fase
8. Decisões
9. Riscos
10. Critérios de aceite
11. Pendências com a SCC

---

## 1. Visão do produto

### 1.1 Definição

O repply food. é **o painel do dono de bar e restaurante**. Ele mostra no celular, quase em tempo real, os números da casa: faturamento, mesas abertas, ticket, horários, garçons e descontos. Os dados saem do sistema de caixa que o restaurante já usa, o da SCC Software. Não troca nada que funciona; só tira o número de dentro do balcão.

Frase da marca: **"sua casa, de onde você estiver."**

### 1.2 A dor

O sistema da SCC (Delphi + SQL Server 2008) roda dentro de ~50 restaurantes, por um bom motivo: se a internet cai, o atendimento não para. O preço disso é que o dono só vê os números de três jeitos:
- estando na casa, com a máquina ligada;
- pelo app da SCC, na mesma rede;
- pedindo relatório remoto ao Emerson, o comercial da SCC.

A sexta cheia, a conta esquecida aberta há 4 horas e o desconto que ninguém viu só aparecem no dia seguinte.

### 1.3 O fluxo que define o produto

```
Caixa do restaurante (SCC) ──a cada ~5 min──▶ nuvem da Repply ──▶ celular do dono
              (sem trocar o sistema)        (histórico inteiro)    (Hoje · Resultados)
```

### 1.4 Parceria e modelo de negócio

- **Parceria Repply × SCC Software.**
  - A SCC (Emerson no comercial, Pedro no desenvolvimento) implementa o envio no sistema dela, seguindo o [contrato de dados](docs/integracao-scc/contrato-de-dados.md).
  - A Repply faz a nuvem, o painel e o suporte do painel (D-30).
- **A Repply cobra o restaurante direto** (D-07), na faixa de **R$ 50 a R$ 150 por mês** (D-18). O valor exato e a implantação estão em aberto. A SCC não fica com parte da mensalidade (D-28).
- **Marca de mercado própria** na casa Repply, como o Repply CRM (D-08), fora do site do Hub.
- **Upsell do Hub** (tráfego, vídeo, social media): só pela relação comercial. **Os dados dos restaurantes nunca são usados para preparar propostas** (D-29).
- **Fase 2:** mentor de IA que lê os números e conversa com o dono. O preço é decidido depois do piloto (D-27).

## 2. Quem usa

| Perfil | Como entra | O que precisa |
|---|---|---|
| **A casa** (dono, sócio, gerente) | **Um login por restaurante**, sem cargos (D-10). E-mail + senha criados pela Repply, com troca obrigatória no 1º acesso (D-11) | Abrir o celular e entender em 10 s se a noite está boa, se há conta esquecida e se o mês vai fechar no azul |
| **Admin Repply** (Lucas Ferreira, Lucas Duarte) | Login com permissão de admin da plataforma | Cadastrar restaurante, gerar token, criar acesso, ver quem parou de enviar, olhar o painel do cliente no suporte (D-32, D-38) |
| **SCC** (Pedro) | Não usa o painel. O sistema dele envia com o token | Um contrato de dados claro e um restaurante de teste |

**Celular primeiro, computador sempre funcionando**, inclusive no admin (D-39).

## 3. Ponto de partida

| O que já existe | Onde | Como usamos |
|---|---|---|
| JSON de exemplo da SCC (tabela de entradas) | `_descoberta/Entrada de exemplo vinda do SCC Software.json` | Base do contrato e do gerador de dados fictícios |
| Simulador do envio em C++ (Lucas Duarte) | `github.com/Repply-Food/scc-dashboard` | Pode virar o gerador de dados fictícios. Os 9 relatórios dele inspiraram as métricas |
| Repply Imob (Next.js 16 + Supabase) | `Projetos/Repply Imob` | Peças reaproveitadas: tokens de marca, clientes Supabase, guardas de auth, cabeçalhos de segurança, logger, configuração de Biome e Vitest |
| Repply CRM | `Projetos/Repply CRM/repositorio` | Padrões: webhook que fecha por padrão, idempotência, alarme de "sinal de vida", checklist de RLS |
| Marca completa | [`identidade-visual/`](identidade-visual/README.md) | Brandbook, logos, ícones do app, favicon, fontes |
| Telas aprovadas | [`docs/telas/`](docs/telas/index.html) | Referência visual da implementação |

## 4. Módulos

| Módulo | O que faz | Referência |
|---|---|---|
| **Recepção** (`receber-envio`) | Recebe os envios do SCC: autentica pelo token, valida, descarta dados pessoais, grava sem duplicar, reconcilia o que sumiu | [`recepcao-de-dados.md`](docs/arquitetura/recepcao-de-dados.md), [contrato](docs/integracao-scc/contrato-de-dados.md) |
| **Hoje** | Faturamento até agora × mesmo dia da semana até o mesmo horário, taxa separada, curva, mesas abertas, pessoas, por pessoa, contas esquecidas (até 3 + "ver todas"), meta (D-33) | [`telas/hoje.html`](docs/telas/hoje.html), [`metricas.md`](docs/metricas.md) |
| **Resultados** | Período e comparação; abas Vendas · Horários · Equipe · Descontos; PDF (D-34, D-20) | [`telas/resultados.html`](docs/telas/resultados.html) |
| **Ajustes** | Meta, turnos, senha e tema (o dono edita); dados do restaurante só para leitura (D-35) | [`telas/ajustes.html`](docs/telas/ajustes.html) |
| **Primeiro acesso** | Login → troca de senha → guia da tela inicial (**só no celular**, uma vez por aparelho, nunca no app instalado) (D-36, D-39) | [`telas/primeiro-acesso.html`](docs/telas/primeiro-acesso.html) |
| **Admin** | Restaurantes e estado do envio, cadastro, token (troca na hora ou em 24 h), acesso do cliente, últimos envios, ver o painel do cliente, pedir reenvio (D-32, D-38) | [`telas/admin.html`](docs/telas/admin.html), [`cadastrar-restaurante.md`](docs/operacao/cadastrar-restaurante.md) |
| **Vigia** | Calcula em dia / atrasado / parado / fechado e manda e-mail de alarme e de "voltou" | [`recepcao-de-dados.md` §7](docs/arquitetura/recepcao-de-dados.md) |
| **PWA** | Instalável (ícones do pacote de marca), service worker mínimo, **sem guardar dados** | [design §6](docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md) |
| **Gerador de dados fictícios** | Simula o SCC pelo mesmo caminho; usado na demonstração e nos testes (D-13) | [`recepcao-de-dados.md` §5](docs/arquitetura/recepcao-de-dados.md) |

## 5. Dados

- Um banco para todos os restaurantes, com chave (restaurante, código original) e RLS (D-01). São 10 tabelas e a visão do admin: [`modelo-de-dados.md`](docs/arquitetura/modelo-de-dados.md).
- Histórico: tudo que o SCC tiver (D-21).
- Dados pessoais de clientes do restaurante (nome, RG, telefone, sexo): **não guardados** (D-29).
- Métricas: definição exata, com exemplo de conta, em [`metricas.md`](docs/metricas.md).

## 6. Identidade visual

- **Símbolo:** squircle laranja `#FF5A1F`, "r" branco e **tomate** no lugar do ponto (D-41). **O tomate só aparece no símbolo.** No nome por extenso vai o ponto da casa: "repply food." (D-42).
- **Interface:**
  - laranja é a cor da marca;
  - verde, vermelho e amarelo **só para dizer algo sobre o número** (acima, abaixo, atenção);
  - tema claro como padrão, com escuro opcional (D-12);
  - General Sans nos títulos, Satoshi no texto e JetBrains Mono nos números.
- **Detalhes de implementação** (tokens e regras medidas) no [`CLAUDE.md`](CLAUDE.md) §8.

## 7. Escopo por fase

### MVP (o que precisa existir para a demonstração e o piloto)

- [x] Banco com as 10 tabelas, RLS e testes de isolamento
- [x] `receber-envio` + `processar_envio` (modo A, janela por data) + testes da §4 de `recepcao-de-dados.md`
- [x] Gerador de dados fictícios enviando pelo mesmo caminho
- [x] Login, troca de senha obrigatória, "esqueci a senha"
- [x] Tela Hoje (celular e computador) — etapa 5, no ar
- [x] Tela Resultados com as 4 abas e as comparações (D-22) — etapa 7
- [x] PDF do período (D-20) — etapa 8, entregue junto à etapa 7
- [x] Ajustes (meta, turnos, senha, tema) — etapa 6, no ar
- [x] Guia da tela inicial (regras D-36/D-39) + PWA instalável — etapa 6, no ar
- [x] Admin (D-32/D-38) + pedido de reenvio
- [ ] Vigia + e-mail de alarme e de "voltou" — o vigia existe; o e-mail de alarme é a etapa 9 (dívida 8)
- [x] Publicação no piloto (Supabase Free + Vercel Hobby, D-09)

### Fase 2 (depois do piloto)

- Mentor IA (D-27)
- Métricas dos grupos 2 e 3 (itens, produtos, pagamentos, caixa), quando a SCC mandar as tabelas
- Nomes de garçons e operadores (H11)
- Modo B do envio (Change Tracking), se o volume justificar
- Avisos para o dono (resumo diário, notificação), se o piloto mostrar que fazem falta (D-15)
- Migração para a infra paga, no gatilho D-09

### Descartado

| Ideia | Por quê |
|---|---|
| Uma VPS de US$ 4 com n8n + Postgres por cliente | 50 servidores para manter; o motivo técnico (chaves que colidem) se resolve com chave composta (D-01, D-02) |
| n8n no caminho dos dados | Código versionado e testável no lugar (D-03) |
| App de loja | Custo; o app web instalável resolve |
| Cargos e permissões dentro do restaurante | Um login por casa (D-10) |
| Usar os dados para marketing do Hub | D-29 |

## 8. Decisões

Todas as decisões, numeradas, com data e justificativa: [`docs/decisoes.md`](docs/decisoes.md). **Decisão registrada não se reabre sem falar com o Lucas Ferreira.**

## 9. Riscos

Lista com mitigação no [desenho do MVP §10](docs/superpowers/specs/2026-10-08-repply-food-mvp-design.md). Os três maiores:
1. o HTTPS do Delphi nos computadores dos restaurantes (B9);
2. o tempo do Pedro (B16);
3. regras de negócio que só a SCC conhece (B6, H5–H7).

## 10. Critérios de aceite

**MVP pronto** = um vendedor da Repply consegue rodar este roteiro sem travar, com dados fictícios:

1. No admin, cadastrar o restaurante e gerar o token.
2. Ligar o gerador com esse token; o estado vira "em dia".
3. Entrar como cliente e trocar a senha.
4. Ver o guia de instalação (só no celular).
5. Abrir "Hoje".
6. Abrir "Resultados", nas quatro abas.
7. Exportar o PDF.
8. Definir a meta.
9. Parar o gerador e ver "atrasado", depois "parado", e o e-mail de alarme chegar.

E a verificação obrigatória passa: tipos, lint, testes e build.

**Piloto bem-sucedido** (a fechar com a SCC):
1. O faturamento bate **centavo a centavo** com o fechamento do SCC em todos os dias.
2. Durante o horário de funcionamento, nenhum buraco de mais de 30 min sem dados (fora queda de internet do restaurante).
3. O dono abre o painel em pelo menos 4 dias por semana e para de pedir relatório ao Emerson.
4. Ao fim de 30 a 60 dias, o dono aceita a mensalidade.

## 11. Pendências com a SCC

As perguntas técnicas abertas (blocos B e H) estão no [contrato de dados §11](docs/integracao-scc/contrato-de-dados.md) e na pauta da reunião (`_descoberta/pauta-reuniao-scc.md`, fora do repositório). Até as respostas, as métricas usam as regras provisórias de [`metricas.md`](docs/metricas.md).

---

*Documento vivo. Mudança de escopo é registrada aqui (e em `docs/decisoes.md`) antes de virar código.*
*repply food. · Repply · Grupo MD*
