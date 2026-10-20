# Etapa 6 — Ajustes e instalar no celular · Desenho

**Data:** 2026-10-20
**Objetivo:** dar ao dono uma tela de **Ajustes** onde ele muda sozinho a **meta do mês**, os **turnos** (corte almoço/jantar), a **senha** e o **tema**; e tornar o painel **instalável no celular** (PWA), com o **guia "coloque na tela inicial"** seguindo as regras D-36/D-39/D-40.

> Este desenho vira um plano em `docs/superpowers/plans/` e é executado por desenvolvimento guiado por subagentes, como as etapas anteriores.

---

## 1. Contexto: o que já existe (não reinventar)

| Peça | Onde | Estado |
|---|---|---|
| Tabela `metas` | `supabase/migrations/20261009120000_fundacao_esquema.sql` | **Existe.** `(restaurante_id, mes date [dia 1], valor numeric(12,2) > 0, atualizado_em)`, PK `(restaurante_id, mes)`. RLS: cliente lê/escreve a dele; admin só lê. Escrita endurecida com `and not public.eh_admin_repply()` em `20261011201500`. |
| Leitura da meta | `metrica_meta_do_mes` (`20261019120000_metricas_hoje.sql`) | **Existe.** Herda o mês anterior na exibição (`mes <= início do mês atual`, mais recente). A tela Hoje já mostra andamento e projeção (D-68). |
| Campo `turnos` | `restaurantes.turnos jsonb` default `{"almoco_ate":"17:00"}` | **Existe.** Escrito pelo dono via `atualizar_turnos(p_restaurante_id, p_turnos jsonb)` (SECURITY DEFINER, confere `tem_acesso`). |
| Troca de senha | `app/(entrada)/trocar-senha/` + `trocarSenhaAction` (`lib/auth/actions.ts`) + `trocarSenhaSchema` (`lib/auth/schemas.ts`) | **Existe e é reaproveitável.** Aceita `?voltar=`. Confere a senha atual na troca voluntária (D-65). |
| Seletor de tema | `components/painel/seletor-tema.tsx` (next-themes) | **Existe.** Botões Claro/Escuro, persistido no aparelho, claro como padrão (D-12). |
| Ajustes (placeholder) | `app/r/[slug]/ajustes/page.tsx` | **Existe, só a conta** (etapa 2): e-mail, "Trocar senha", `<SeletorTema/>`, "Falar com a Repply", "Sair". Já trata o modo admin (D-58). |
| Manifesto + ícones | `app/manifest.webmanifest`, `public/icon-*.png` | **Existem.** `display: standalone`, `theme_color #ff5a1f`. |
| Padrões de formulário | `components/forms/form-field.tsx` (`TextField`), `use-hidratado.ts`; exemplos em `app/admin/restaurantes/` | react-hook-form + Zod (sem `.default()`) + Server Action `{ ok } | { ok:false, error }`. |

**Não existe ainda** (trabalho da etapa 6): a edição de meta e turnos na tela; o service worker e a página "sem conexão"; o guia "coloque na tela inicial" e a detecção de aparelho/app instalado.

## 2. Decisões que mandam aqui (não reabrir)

- **D-35** — Ajustes: o dono muda meta, turnos, senha, tema; nome, CNPJ, horário de funcionamento e hora de virada são **só leitura** (muda a Repply).
- **D-36** — o guia "coloque na tela inicial" aparece **uma vez por aparelho**, logo após o 1º login, e **nunca dentro do app já instalado**; continua disponível em Ajustes; iPhone pelo Compartilhar, Android pelo botão "Instalar" do navegador (com passo manual de reserva); reconhece o aparelho.
- **D-39 / D-40** — celular primeiro, computador sempre funcionando; o guia **nunca aparece no computador**; no computador, Ajustes é em **duas colunas, sem a seção "tela inicial"**, e o 1º acesso pelo computador pula o guia.
- **D-12** — tema claro padrão, escuro opcional.
- **D-56** — horário de funcionamento (até dois por dia) é do **admin**; não é editado pelo dono.
- **D-65** — a troca de senha por Ajustes confere a senha atual (`senhaConfere`); "Secure password change" do Supabase fica desligado.
- **D-22 / D-68** — a meta é definida pelo dono; a projeção usa dias de calendário decorridos (já na tela Hoje).

## 3. A tela de Ajustes

**Layout:** no computador, **duas colunas** (D-40); no celular, uma coluna empilhada. Seções, nesta ordem no celular:

1. **Meta do mês** — ver §4.
2. **Turnos** — ver §5.
3. **Sua conta** — e-mail (só mostra), "Trocar senha" (link para `/trocar-senha?voltar=/r/[slug]/ajustes`, já funciona), `<SeletorTema/>`, "Sair" (`sairAction`).
4. **Dados da casa (só leitura)** — nome, CNPJ, horário de funcionamento (formatado), hora da virada; com o aviso "esses dados mudam com a Repply" (D-35). Lê de `restaurantes` pela sessão.
5. **Colocar na tela inicial** — ver §6. **Só no celular** (D-40); some no computador e no app já instalado.
6. **Falar com a Repply** — WhatsApp (`WHATSAPP_REPPLY.link`), como hoje.

**Modo admin (D-58):** quando a Repply está vendo o painel do cliente, a seção "Sua conta" some (sem trocar senha nem sair; mostra "Login do cliente" com link ao admin, como hoje) e a edição de meta e turnos fica **bloqueada** (as ações do servidor já recusam o admin: a RLS da `metas` tem `and not eh_admin_repply()`, e `atualizar_turnos` confere `tem_acesso`). A tela deve **esconder os botões de salvar** no modo admin (não mostrar um botão que vai falhar).

## 4. Meta do mês (a parte nova, inspirada no "plano de vendas" do CRM)

**Conceito (como o CRM, enxuto):** um valor por mês, guardado em reais; **sem** meta anual rateada. O Food já tem exatamente esse modelo na tabela `metas`.

**UX:**
- Um seletor de mês com setas **‹ outubro de 2026 ›**. Abre no **mês atual** da casa (mesmo fuso/virada da tela Hoje, via `dia_operacao_de`).
- Um campo **"Meta de faturamento"** com máscara de reais. Mostra o valor **daquele mês exato** se houver (vazio se não houver).
- Botão **"copiar do mês anterior"** — preenche o campo com o valor do mês anterior mais recente já salvo (conveniência manual, como no CRM). Fica desabilitado se não houver mês anterior com meta.
- **Salvar** explícito. Se o dono mudar o valor e tentar sair/trocar de mês sem salvar, **avisa** ("alterações não salvas — salvar / descartar").
- Limpar o campo e salvar **remove** a meta daquele mês (volta a herdar o anterior na tela Hoje).

**Leitura para a tela:** a página (componente de servidor) carrega **todas as metas da casa** (são poucas linhas — uma por mês definido) e passa ao componente de meta; a navegação entre meses é no cliente, sobre esse conjunto já carregado. Depois de salvar, `router.refresh()` recarrega.

**Gravação — pelo servidor, nunca pelo navegador:**
- Nova Server Action `salvarMetaAction(mes, valor)` em `lib/painel/ajustes-actions.ts` (ou similar). Deriva o `restaurante_id` **da sessão** (`exigirCasa`), nunca do cliente (armadilha "restaurante_id vem do servidor").
- Usa o cliente Supabase da **sessão do usuário** (não a chave de serviço), para a **RLS garantir o isolamento**. `insert ... on conflict (restaurante_id, mes) do update set valor=..., atualizado_em=now()`; remoção = `delete` quando o valor vier vazio.
- **Confere a contagem de linhas afetadas** (armadilha "salvo quando a RLS recusou"): zero linhas → devolve erro, não sucesso.
- Validação Zod: `valor` numérico `> 0` (em reais, com a máscara convertida para `numeric(12,2)`); `mes` é o dia 1 de um mês. Schema próprio em `lib/painel/ajustes-schemas.ts`.
- Rodar no servidor mantém tudo fora do navegador e **não aciona** a dívida 58 (CSP `connect-src`).

**Fora de escopo nesta tela:** barra de progresso / "meta × realizado" por mês. A tela Hoje já mostra o andamento e a projeção do mês atual; Ajustes é só para **definir** a meta (meses futuros nem têm realizado). (YAGNI.)

## 5. Turnos

- Um campo **"almoço até ___"** (hora `HH:MM`), pré-preenchido com o `turnos.almoco_ate` atual (padrão 17:00). + **Salvar**.
- Nova Server Action `salvarTurnosAction(almocoAte)` que chama a RPC **`atualizar_turnos`** já existente (deriva o `restaurante_id` da sessão; a RPC confere `tem_acesso`). Confere o resultado.
- Validação Zod: `HH:MM` válido. Escreve só a chave `almoco_ate` no jsonb.
- Texto de ajuda: "antes desse horário conta como almoço; depois, como jantar. Usado na tela Resultados."

## 6. Instalar no celular (PWA) e o guia

**Service worker mínimo** (regra do desenho: "sem guardar dados"):
- Novo `public/sw.js` registrado no cliente após o carregamento. Única função: quando o aparelho estiver **offline** e a navegação falhar, mostrar uma página **"sem conexão"** (`app/offline/` ou um HTML estático em `public/`). **Não** faz cache de dados nem de páginas do painel.
- Confirmar que o `<link rel="manifest">` está sendo injetado (convenção do Next com `app/manifest.webmanifest`); se não, declarar no `metadata`.

**O guia "coloque na tela inicial"** (D-36/D-39/D-40):
- Aparece **uma vez por aparelho**, **logo após o 1º login**, **só no celular**, **fora do app já instalado** e **nunca no computador**.
- **Detecção:**
  - "é celular" — largura/entrada de toque (mesmo critério já usado no painel para celular × computador);
  - "é o app já instalado" — `display-mode: standalone` (e `navigator.standalone` no iOS);
  - "já vi neste aparelho" — uma marca no **`localStorage`** do aparelho (o login é compartilhado, por isso é por aparelho e não por login — D-36). Envolver leitura/escrita em try/catch (pode faltar em aba privada).
- **Conteúdo** (reconhece o aparelho):
  - **iPhone:** passo a passo pelo botão **Compartilhar → "Adicionar à Tela de Início"**.
  - **Android:** botão **"Instalar"** usando o evento `beforeinstallprompt` do navegador; se o evento não vier, um passo manual de reserva (menu ⋮ → "Adicionar à tela inicial").
- **Onde aparece:** um cartão dispensável no painel (sobre a tela Hoje) logo após o 1º login, no celular. E **sempre disponível** na seção "Colocar na tela inicial" de Ajustes (celular).

## 7. Isolamento, erros e testes

- **Isolamento:** as Server Actions de meta e turnos usam o cliente da sessão; a RLS garante que uma casa não escreve na outra e que o admin não grava. **Teste de isolamento obrigatório** (dono A não grava meta/turnos da casa B; admin não grava em nenhuma).
- **"Salvo" só com linhas afetadas > 0** (conferir a contagem nas duas ações).
- **Testes:**
  - meta: salvar cria/atualiza a linha do mês; copiar-do-anterior; limpar remove; validação (valor ≤ 0, mês inválido); `salvarMetaAction` feliz e de erro.
  - turnos: salvar grava `almoco_ate`; validação de `HH:MM`.
  - guia: a lógica de "mostrar?" devolve **não** no computador, **não** no app instalado, **não** se já visto, **sim** no celular, 1º acesso, fora do app — testada como função pura (sem depender do DOM).
  - a tela: seções certas no celular × computador (duas colunas, sem "tela inicial" no computador — D-40); modo admin esconde os salvares.
- **Verificação antes de "feito":** tipos, lint, testes e build limpos; conferir no navegador em largura de celular **e** de computador, claro **e** escuro (parte adiável para a nuvem, como combinado nas etapas anteriores).

## 8. Fora de escopo (YAGNI)

- Editar o horário de funcionamento pelo dono (é do admin, D-56).
- Janelas completas de almoço/jantar (só o corte `almoco_ate`).
- Barra de progresso de meta dentro de Ajustes (a tela Hoje já tem).
- Cache de dados offline no service worker (regra "sem guardar dados").
- Seguir o tema do sistema automaticamente (é escolha manual persistida — já é assim).

## 9. Perguntas em aberto

Nenhuma de produto. Decisões de implementação (nome exato dos arquivos de ação/esquema, formato da página "sem conexão") ficam para o plano.
