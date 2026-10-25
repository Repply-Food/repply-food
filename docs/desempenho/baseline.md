# Baseline - Repply Food

**Status:** BLOQUEADO  
**Data:** 2026-10-24  
**Commit:** 422eaef (Registra o início do piloto com cliente real)

## Razão do Bloqueio

**SERVIÇO LOCAL INDISPONÍVEL / SEM AUTORIZAÇÃO PARA TOCAR NO DB COMPARTILHADO**

Não foi autorizada a inicialização/reset/migração do banco local compartilhado. Não há medições reais disponíveis neste ambiente. Nenhuma métrica foi inventada.

## Ambiente Registrado

| Campo | Valor |
|--------|-------|
| SO | Linux |
| Node | (verificar) |
| Branch | correcao-rpcs-resultados-nulas |
| Working Tree | Alterações nesta tarefa |
| Migrations aplicadas | Não verificável sem banco local autorizado |
| Portas | Não verificável sem serviço |

## Cenários (sintéticos - não medições)

| Cenário | Tipo | p50 | p95 | Amostras | Notas |
|---------|------|-----|-----|----------|-------|
| vazio | sintético/projetado | - | - | 0 | Sem dados; sem medição real |
| 90d_x100 | sintético/projetado | - | - | 0 | Parâmetros projetados, não medidos |
| 365d_x500 | sintético/projetado | - | - | 0 | Parâmetros projetados, não medidos |
| 730d_x1000_estresse | sintético/projetado (opcional) | - | - | 0 | Opcional, reduzir se faltar recurso; sem medição real |

## Travamento de Nuvem

**Implementado nesta tarefa:**
- `scripts/desempenho/trava-nuvem.ts` - validadores fail-closed (protocolo + host local-only)
- `tests/desempenho/trava-nuvem-benchmark.test.ts` - testes de guarda
- Recusa HTTP/Postgres remoto SEM exceções
- Mensagens sem vazar URL/credenciais
- Aceita apenas `http:`/`https:` locais e `postgres:`/`postgresql:` locais

## Próximos Passos

1. Com autorização explícita, iniciar Supabase local e aplicar migrations
2. Rodar medições com ambiente funcional
3. Atualizar este documento com valores reais (p50/p95, amostras, EXPLAIN etc)

**NUNCA** inventar métricas. Baseline permanece BLOQUEADO.
