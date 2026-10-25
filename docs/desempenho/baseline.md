# Baseline - Repply Food

**Status:** BLOQUEADO  
**Data:** 2026-10-24  
**Commit:** 422eaef (Registra o início do piloto com cliente real)

## Razão do Bloqueio

**SERVIÇO LOCAL INDISPONÍVEL** - Supabase local não está inicializado/running neste ambiente.

Não é possível:
- Coletar métricas reais de banco local
- Executar medições com `EXPLAIN (ANALYZE, BUFFERS)`
- Rodar app com `npm run build && npm run start` contra banco local funcional
- Medir performance real de RPCs/consultas

## Ambiente Registrado

| Campo | Valor |
|--------|-------|
| SO | Linux |
| Node | (verificar) |
| Branch | correcao-rpcs-resultados-nulas |
| Working Tree | Limpo ou com alterações? Verificar |
| Migrations aplicadas | Não verificável sem banco local |
| Portas | Não verificável sem serviço |

## Cenários Planejados

| Cenário | Status | p50 | p95 | Amostras | Notas |
|---------|--------|-----|-----|----------|-------|
| vazio | BLOQUEADO | - | - | 0 | Aguardando banco local |
| 90d_x100 | BLOQUEADO | - | - | 0 | Aguardando banco local |
| 365d_x500 | BLOQUEADO | - | - | 0 | Aguardando banco local |
| 730d_x1000_estresse | BLOQUEADO | - | - | 0 | Opcional - aguardando recursos |

## Travamento de Nuvem

**Implementado e testado:**
- `scripts/desempenho/trava-nuvem.ts` - validadores fail-closed
- `tests/desempenho/trava-nuvem-benchmark.test.ts` - testes de guarda
- Recusa HTTP/Postgres remoto SEM exceções
- Ignora `PERMITIR_NUVEM_NO_DEV`, `NODE_ENV=production`

## Próximos Passos

1. Inicializar Supabase local: `supabase start` (se Docker disponível)
2. Aplicar migrations
3. Rodar medições com ambiente funcional
4. Atualizar este documento com valores reais

**NUNCA** inventar métricas. Baseline permanece BLOQUEADO até que medições reais sejam possíveis.
