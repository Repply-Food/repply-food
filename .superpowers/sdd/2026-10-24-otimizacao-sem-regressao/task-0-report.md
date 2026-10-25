# Task 0 - Relatório: Produzir baseline reproduzível

**Data:** 2026-10-24  
**Branch:** correcao-rpcs-resultados-nulas  
**Commit base:** 422eaef (Registra o início do piloto com cliente real)  
**Status:** INCOMPLETA/BLOQUEADA (sem benchmark funcional, sem medições reais)

## Arquivos criados/corrigidos nesta tarefa (somente T0)

### Scripts
- `scripts/desempenho/medir-metricas.ts` (CLI ESM executável com args/env, valida guardas antes de conectar, sanitiza erros sem vazar credenciais; retorna BLOQUEADO quando sem probe bem-sucedido)
- `scripts/desempenho/cenarios.ts` (determinístico, sem RNG não utilizado, sem Date.now)
- `scripts/desempenho/trava-nuvem.ts` (fail-closed: APENAS loopback literal 127.0.0.1/localhost/[::1]; http/https e postgres/postgresql; sem *.test/*.localhost)

### Documentação
- `docs/desempenho/metodologia.md`
- `docs/desempenho/baseline.md`

### Testes
- `tests/desempenho/trava-nuvem-benchmark.test.ts`

## Correções round 2 (findings)
1. **Sem vazamento**: erros da CLI e das travas não incluem URL/credenciais
2. **Somente loopback literal**: removidos `*.test`, `*.localhost` e hosts derivados; apenas 127.0.0.1/localhost/[::1]
3. **Medidor realista**: valida antes de conectar, probe real mantem BLOQUEADO se indisponível; sem no-op que finge medição
4. **CLI ESM funcional**: entrypoint por `import.meta.url`, aceita `--http-url`/`--db-url` ou env; sem `require.main`
5. **Cenários determinísticos**: semente fixa, sem `Date.now`
6. **TDD**: testes para CLI/ESM, recusa `*.test` e sanitização de erro escritos/ajustados, RED observado, depois GREEN
7. **Sem inventar benchmark**: T0 não marcada completa

## Saídas literais

### Testes focados (travas + referências)
```bash
$ npx vitest run tests/desempenho/trava-nuvem-benchmark.test.ts
✓ tests/desempenho/trava-nuvem-benchmark.test.ts (25 tests) 18ms
Test Files  1 passed (1)
Tests  25 passed (25)
```

```bash
$ npx vitest run tests/gerador/trava-nuvem.test.ts tests/supabase/trava-nuvem.test.ts
✓ tests/supabase/trava-nuvem.test.ts (10 tests) 63ms
✓ tests/gerador/trava-nuvem.test.ts (17 tests) 44ms
Test Files  2 passed (2)
Tests  27 passed (27)
```

### CLI ESM
```bash
$ node --experimental-strip-types scripts/desempenho/medir-metricas.ts --http-url http://127.0.0.1:54321 --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
{ "bloqueado": true, ..., "motivoBloqueio": "Serviço local indisponível ou não autorizado a iniciar/resetar/migrar DB compartilhado. Nenhuma métrica foi inventada." }

$ node --experimental-strip-types scripts/desempenho/medir-metricas.ts --http-url https://evil.com --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
{"erro":"[Benchmark] Falha na validação ou execução."}

$ node --experimental-strip-types scripts/desempenho/medir-metricas.ts --http-url http://127.0.0.1:54321 --db-url postgresql://user:senha-secreta@db.test:5432/postgres
{"erro":"[Benchmark] Falha na validação ou execução."}
```

### Verificações
```bash
$ npx tsc --noEmit
(no output)
```
```bash
$ npm run check
Checked 295 files in 742ms. No fixes applied.
```

## Dependências / Bloqueios
- **Sem benchmark funcional**: não há probe bem-sucedido com conexão real; `medirMetricas` valida guardas e retorna BLOQUEADO.
- **DB compartilhado não autorizado**: sem reset/migration/início; baseline real permanece BLOQUEADO por escolha do usuário.
- **Sem acesso remoto**: não utilizado.

## Restrições respeitadas
- ✅ Apenas arquivos T0
- ✅ Sem alterar/resetar/migrar DB nem acessar redes remotas
- ✅ Sem inventar métricas/dados
- ✅ Sem suíte completa, app/deps/scripts inseguros, subagentes
- ✅ Commit local sem push
- ✅ TDD observado (RED/GREEN)
