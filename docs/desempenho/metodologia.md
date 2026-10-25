# Metodologia de Medição - Baseline Repply Food

**Data:** 2026-10-24  
**Objetivo:** Produzir baseline reproduzível para guiar otimizações sem regressão

## Princípios

1. **Reprodutibilidade**: Sementes fixas, relógio controlado quando possível
2. **Fail-closed**: Benchmarks só rodam em ambiente local. Proibido HTTP/Postgres remoto
3. **Separação clara**: Massa sintética para medição ≠ ingestão real
4. **Medição realista**: Perfis reais (dono/autenticado), não superusuário como substituto
5. **Sem dados sensíveis**: Nunca logar JWT, SQL corpo completo com dados, payloads reais

## Ambiente

- **Modo**: `npm run build && npm run start` para medições UI (produção-like). Dev tem custos não representativos.
- **Banco**: Supabase local via Docker (127.0.0.1). Service role apenas para preparação de massa em ambiente descartável.
- **Rede**: Normal e 4G simulada. Observar em 390px (mobile) e desktop.
- **Cold/warm**: Separados. Primeira consulta local ≠ cold start Vercel.

## Cenários

| Cenário | Descrição | Uso |
|---------|-----------|-----|
| vazio | Sem dados | Caso base |
| 90d_x100 | 90 dias × ~100 contas/dia | Típico |
| 365d_x500 | 365 dias × ~500 contas/dia | Médio-grande |
| 730d_x1000_estresse | 730 × 1000/dia | Opcional, reduzir se faltar recurso |

Distribuição real observada: abertas/removidas/pagas, códigos, lacunas.

## Medição

### Amostragem
- 5 aquecimentos + ≥30 amostras medidas (buscar 100 para p95 confiável)
- Alternar A/B, repetir séries
- Registrar mediana (p50), p95, dispersão, tamanho amostra
- Partida fria em grupo separado

### Métricas
- **Tempo total HTTP**, **tempo SQL**, **autenticação**, **configuração**, **montagem React**, **PDF**
- **Tempo até números úteis e gráfico** (não só TTFB skeleton)
- **LCP/CLS**, latência interação (INP não representativo local)
- **EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)** em leitura local autenticada
- **Chamadas, linhas/loops/buffers, bytes, erros**

### Concorrência
- 1/5/20 telas simultâneas
- Mesma casa e casas distintas
- Se fila/timeout → parar escala e registrar

## Ingestão
- Caminho real via `receber-envio`, lotes 10/500/2000
- Respeitar 2MB, ritmo, datas, reconciliação
- Não dividir janela incompletamente entre lotes
- Testar repetição idêntica, alteração parcial, reaparecimento

## Travas de Segurança
- **HTTP remoto**: Recusado sempre (sem exceções)
- **Postgres remoto**: Recusado sempre (sem exceções)
- **Flags ignoradas**: `PERMITIR_NUVEM_NO_DEV`, `NODE_ENV=production` não permitem exceção
- **URLs do app build produção** também validadas
