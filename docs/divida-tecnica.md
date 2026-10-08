# Dívida técnica e pendências

*Lista numerada do que ficou para depois, com gravidade. Quando resolver, mova o item para "Resolvidos" com a data e o commit. Nunca apague.*

**Gravidade:**
- **Alta:** pode mostrar número errado ou expor dado.
- **Média:** atrapalha a operação.
- **Baixa:** melhoria.

## Abertos

| # | Item | Gravidade | Bloqueia? | Origem |
|---|---|---|---|---|
| 1 | Regras de cortesia, fiado e "dia de operação" são provisórias até a SCC responder (B6, H5, H6, H7) | Alta | Piloto: o número precisa bater com o SCC | `metricas.md` |
| 2 | HTTPS a partir do Delphi nos computadores dos restaurantes não testado (B9) | Alta | Integração real | Contrato §3 |
| 3 | Lista de valores de `TipoOcupacao`, `TipoCartao` e o significado dos campos "extras" (H3, H4) | Média | Não | Contrato §5 |
| 4 | Nomes de garçons e operadores dependem de a SCC enviar os cadastros (H11) | Baixa | Não | M24, M25 |
| 5 | Projeção da meta é linear (não pesa dia da semana) | Baixa | Não | `metricas.md` §4 |
| 6 | Transferência Free → Pro do Supabase: confirmar que o endereço não muda (testar com projeto de teste) | Média | Gatilho D-09 | `migrar-para-pro.md` |
| 7 | Retenção da tabela `envios`: rever quando passar de 1 GB | Baixa | Não | `modelo-de-dados.md` |

## Resolvidos

*(nenhum ainda)*
