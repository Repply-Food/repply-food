# Task 0 - Relatório: Produzir baseline reproduzível

**Data:** 2026-10-24  
**Branch:** correcao-rpcs-resultados-nulas  
**Commit base:** 422eaef (Registra o início do piloto com cliente real)  
**Status:** CONCLUÍDO (arquivos criados/corrigidos; baseline BLOQUEADO por serviço local indisponível e sem autorização para tocar no DB compartilhado)

## Arquivos criados nesta tarefa (somente T0)

### Scripts
- `scripts/desempenho/medir-metricas.ts` (CLI ESM-funcional, valida guardas antes de conectar, retorna BLOQUEADO com probe real sem reset/migration)
- `scripts/desempenho/cenarios.ts` (config determinística, sem RNG não utilizado, sem Date.now)
- `scripts/desempenho/trava-nuvem.ts` (fail-closed: protocolo + host local-only, sem vazar URL/credenciais)

### Documentação
- `docs/desempenho/metodologia.md` (distingue sintético/projetado vs medições reais)
- `docs/desempenho/baseline.md` (BLOQUEADO com motivo real; sem placeholders falsos)

### Testes
- `tests/desempenho/trava-nuvem-benchmark.test.ts` (validam protocolos, recusa remoto sem flags/exceções, não vazam dados em erros)

## Correções aplicadas (findings)
1. **Sem vazamento**: mensagens de erro não incluem `dbUrl`/`httpUrl`/credenciais
2. **Protocolos validados**: HTTP apenas `http:`/`https:` local; Postgres apenas `postgres:`/`postgresql:` local
3. **Medidor funcional**: CLI com args/env, valida guardas antes de conectar, probe real mantem BLOQUEADO se indisponível (sem reset/migration), sem stub que finge sucesso
4. **Cenários limpos**: removidos RNG não utilizado e `Date.now`; apenas configuração determinística
5. **Sem @ts-nocheck**: TypeScript estrito, `npx tsc --noEmit` limpo
6. **Sem imports test-only em runtime**; reutiliza utilidades válidas
7. **Docs/relatório**: distinguem cenário sintético vs real; não afirma que não houve commit

## TDD
Testes ajustados/criados para as novas regras. Foram executados focados (RED observado nas asserções antes de corrigir mensagens/protocolos; depois GREEN).

```bash
$ npx vitest run tests/desempenho/trava-nuvem-benchmark.test.ts
✓ tests/desempenho/trava-nuvem-benchmark.test.ts (23 tests) 16ms
Test Files  1 passed (1)
Tests  23 passed (23)
```

```bash
$ npx vitest run tests/gerador/trava-nuvem.test.ts tests/supabase/trava-nuvem.test.ts
✓ tests/supabase/trava-nuvem.test.ts (10 tests) 63ms
✓ tests/gerador/trava-nuvem.test.ts (17 tests) 44ms
Test Files  2 passed (2)
Tests  27 passed (27)
```

## Verificações
```bash
$ npx tsc --noEmit
(no output)
```
```bash
$ npm run check
Checked 295 files in 1044ms. No fixes applied.
```

## Baseline
**BLOQUEADO** - Serviço local indisponível e usuário não autorizou tocar no DB compartilhado (sem reset/migration). Nenhuma métrica inventada.

## Restrições respeitadas
- ✅ Não resetou/migrou/iniciou DB nem acessou endpoint remoto
- ✅ Não usou dado real
- ✅ Não alterou guards existentes (app/gerador)
- ✅ Apenas arquivos T0
- ✅ Sem benchmark fictício/dado de produção
- ✅ Sem suíte completa, app/deps/scripts inseguros, subagentes
- ✅ Commit local sem push

## Commit
Será feito após este relatório.
