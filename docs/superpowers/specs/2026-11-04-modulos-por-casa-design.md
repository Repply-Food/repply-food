# Módulos por casa (padrão desligado + exceção) — desenho

**Data:** 2026-11-04
**Autor:** Lucas Ferreira (produto) + IA
**Relacionado:** D-29 (dado do restaurante só serve ao painel dele), D-73 (Gemini no piloto), dívida 69 (Vertex-SP/LGPD), o mentor v1 (branch `mentor-ia`, commit `ab37b4f`).

## 1. Problema

O mentor v1 está pronto, mas publicá-lo hoje o deixaria visível para **todas** as casas, inclusive o cliente real do piloto. No nível grátis do Gemini, os números que o dono perguntar são usados pelo Google para treinar (e revisores podem ler) — o que esbarra na **D-29**. Precisamos de um jeito de **nascer desligado para todos** e ligar só onde quisermos (começando pela casa de demonstração), controlado no admin.

Inspiração: no Repply CRM, o admin usa "presets" (um padrão para clientes novos) e cria exceções por conta. Aqui adotamos a forma mínima disso.

## 2. Decisão

**Padrão desligado embutido + exceção por casa** (a opção "A" aprovada em 04/11/2026):

- Toda casa — as que já existem e as novas — **nasce sem nenhum módulo opcional**.
- O admin **liga/desliga por casa**. A casa de demonstração é a primeira exceção (mentor ligado).
- **Não** há, por ora, tela para editar o "padrão" (ele é simplesmente "desligado"). Virar o padrão para "ligado" quando o billing estiver ativo será uma mudança pequena, registrada depois.
- Presets nomeados (vários planos) ficam **fora de escopo** (YAGNI: um módulo só, um padrão só).

Esta decisão deve ser registrada em `docs/decisoes.md` (próximo número livre) na implementação.

## 3. Modelo de dados

Coluna nova em `restaurantes`, por migration **aditiva**:

```sql
alter table public.restaurantes
  add column modulos text[] not null default '{}';
```

- `modulos` é a lista de módulos **opcionais** ligados na casa. `'{}'` (o default) = nenhum. As casas existentes recebem `'{}'` na aplicação da migration → **mentor desligado para todas**, inclusive o cliente real.
- Sem mudança de RLS: a coluna herda a política da tabela `restaurantes` (o dono lê a própria casa por `tem_acesso`; só o admin escreve; o admin lê qualquer uma por `eh_admin_repply`).
- Módulos **centrais** do MVP (Hoje, Resultados, Ajustes) **não** entram aqui: estão sempre ligados. `modulos` governa só os **opcionais**.

No código, um registro dos módulos conhecidos evita texto solto:

```ts
// lib/painel/modulos.ts (nome a confirmar na implementação)
export const MODULOS_OPCIONAIS = ["mentor"] as const;
export type ModuloOpcional = (typeof MODULOS_OPCIONAIS)[number];
export function casaTemModulo(modulos: string[], modulo: ModuloOpcional): boolean;
```

## 4. O guarda (3 camadas, defesa em profundidade)

1. **Menu** (conforto): o [menu-painel.tsx](../../../components/painel/menu-painel.tsx) passa a receber os módulos ligados da casa e **esconde a aba "Mentor"** quando `mentor` não está em `modulos`. Hoje/Resultados/Ajustes seguem sempre visíveis.
2. **Rota** (trava real): `app/r/[slug]/mentor/page.tsx`, depois do `exigirCasa`, chama `notFound()` (404) se a casa não tem o módulo. Esconder o menu não protege nada sozinho; o 404 sim.
3. **Ação do servidor** (trava real): `lib/mentor/enviar-action.ts` confere o módulo **antes de qualquer coisa** (como já confere o modo leitura e o limite). Sem o módulo, recusa com uma frase do produto. Assim ninguém usa o mentor chamando a ação direto.

A verificação lê o módulo da **casa da sessão** (`exigirCasa`), nunca de algo vindo do cliente.

## 5. Integração com a sessão e o layout

- `lib/auth/sessao.ts`: o tipo `CasaDoLogin` ganha `modulos: string[]`; as duas leituras de casa (`obterSessao`, para o dono, e `casaPeloEndereco`, para o admin) passam a selecionar `modulos`.
- `app/r/[slug]/layout.tsx` / `components/painel/moldura-painel.tsx`: entregam `casa.modulos` ao `MenuPainel` (e ficam disponíveis para a guarda da rota).
- A rota e a ação do mentor leem `casa.modulos` do `exigirCasa`.

## 6. Admin

- Na página da casa no admin (`app/admin/restaurantes/[id]`, seguindo o padrão dos formulários do admin), uma seção **"Módulos"** com um liga/desliga do **"Mentor de IA"**.
- Salvar atualiza `restaurantes.modulos` pelo caminho de escrita do admin (RLS: só o admin escreve). A função do servidor devolve `{ ok }` como as demais e usa frase de produto no erro.
- **Ligar/desligar não apaga conversa**: só mostra/esconde a aba e libera/barra o uso. Religar devolve o acesso às conversas que já existiam.
- `demonstracao` e `modulos` são **independentes**: ligar o mentor é um ato explícito do admin, não automático por a casa ser de demonstração.

## 7. Cliente real × demonstração

- Com o padrão desligado, **o cliente real do piloto fica protegido**: não manda número ao Gemini grátis sem o admin ligar. Resolve o conflito com a D-29 enquanto o nível for grátis.
- A **casa de demonstração** entra como exceção: o admin liga o mentor nela (em produção, depois do deploy; no banco local, pelo seed de teste).

## 8. Testes

- **Isolamento/guarda:** casa sem o módulo → a rota responde 404 **e** a ação recusa; casa com o módulo → funciona.
- **Menu:** a aba "Mentor" some quando desligada e aparece quando ligada; Hoje/Resultados/Ajustes sempre presentes.
- **Admin:** o toggle grava em `modulos`; só o admin escreve (um não-admin é barrado pela RLS); ligar/desligar não apaga conversas.
- **Padrão:** casa nova nasce com `modulos = '{}'` (mentor desligado).

## 9. Fora de escopo (v2+)

- Presets nomeados (vários planos).
- Tela no admin para editar o padrão dos clientes novos (hoje o padrão é "desligado", embutido).
- Gating de outros módulos (ex.: Relatórios): o mecanismo já serve, mas só o `mentor` entra agora.

## 10. Como encaixa na publicação do mentor

Construímos este gating **primeiro**; só então publico o mentor (merge `mentor-ia` → main → migrações na nuvem → push). O mentor já nasce **desligado para todos** e é **ligado só na demo**. A publicação segue pausada até o gating estar pronto e verificado.
