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
| 8 | **Alarme por e-mail não existe.** O vigia calcula o estado, mas ninguém é avisado quando um restaurante vira "parado". Regras para quando for feito: marcar como avisado só depois de confirmar que o e-mail saiu (`net._http_response`); avisar "voltou" só quando os dados voltam, nunca porque a casa fechou; a chamada da rotina para a função leva um segredo guardado no Vault | Média | Demonstração (passo 9 do roteiro) | Etapa 1, Tarefa 9 |
| 9 | Restaurante sem horário de funcionamento conta como sempre aberto e apareceria "parado" toda madrugada. O admin precisa exigir o horário, e o banco precisa validar o formato do horário e o fuso na gravação | Média | Admin (etapa 3) | Etapa 1, Tarefa 9 |
| 10 | O ambiente de desenvolvimento não tem trava no código contra apontar para a nuvem com a chave de serviço; hoje a proteção é o `.env.local` local e a documentação. Decidir a trava quando a nuvem tiver dados | Média | Primeira publicação (etapa 4) | Etapa 1, Tarefa 3 |
| 11 | No banco local do Lucas Duarte as migrations da fundação foram aplicadas à mão. Antes de `npx supabase migration up --local`, ele precisa marcar as quatro como aplicadas (`npx supabase migration repair --local --status applied <versão>`) | Baixa | Não | Fundação |
| 12 | O cadastro fechado é testado só pelo arquivo de configuração. O teste de comportamento (tentar se cadastrar e ser recusado) entra com os testes de login | Baixa | Não | Etapa 1, Tarefa 10 |
| 13 | As bibliotecas do Food estão uma geração atrás das do Repply Imob (gráficos, validação, login). Alinhar antes de copiar as peças do Imob | Média | Telas (etapa 2) | Estudo de 13/10/2026 |
| 14 | **Quem está logado, e quem não está, tem poder demais nas tabelas.** O Supabase entrega por padrão, em todas as tabelas, os privilégios de esvaziar a tabela inteira (`TRUNCATE`) e de criar gatilhos e referências (`TRIGGER`, `REFERENCES`) aos papéis `anon` e `authenticated`; inserir, alterar e apagar linhas também vêm liberados, mas a regra de segurança por restaurante barra. Essa regra **não cobre o `TRUNCATE`**. A API do painel (PostgREST) não expõe esse comando hoje, então não há caminho de ataque conhecido. Recomendação: mudança na estrutura do banco (migration) que retira esses privilégios, com teste | Média | Decidir com o Lucas Ferreira antes da primeira publicação (etapa 4) | Revisão da Tarefa 6 |
| 15 | **O selo "há X min" (M05) pode ficar vermelho na hora em que a casa abre, enquanto o admin mostra "em dia".** O vigia não conta atraso enquanto a casa está fechada, mas o selo, como está definido em `docs/metricas.md`, é `agora − último envio sem erro`. Decisão de produto: o selo passar a usar o estado calculado pelo vigia | Média | Tela Hoje (etapa 5) | Revisão da Tarefa 9 |
| 16 | **Uma falha geral no vigia passaria quase despercebida.** Ele pula o restaurante em **qualquer** erro (`exception when others`), não só em cadastro malformado; se faltasse uma permissão ou alguém apagasse uma função, os estados ficariam parados e só sobraria um aviso no registro do banco. Trocar por `exception when data_exception`, numa migration nova | Média | Não | Revisão da Tarefa 9 |
| 17 | **Ferramentas de teste com vulnerabilidades conhecidas.** `npm audit` acusa 7 (3 críticas), todas no Vitest 2 e nas suas dependências (vite, esbuild, tinypool). Já existiam antes da etapa 1 e não vão para o site publicado. Atualizar o Vitest (o conserto automático instalaria o Vitest 5, uma mudança grande) | Média | Não | Auditoria de dependências pendente desde a fundação |
| 18 | O atalho `npm run supabase:reset` (`supabase db reset`) apaga o banco local inteiro, inclusive a demonstração; o README pede para não usar. Considerar remover o atalho | Baixa | Não | Revisão final |
| 19 | Chamada direta à função `processar_envio` (só a chave de serviço consegue) com valor composto num campo de dinheiro grava 0 sem aviso, e em `Pago` grava "não pago". Pela recepção, o envio recebe 422 | Baixa | Não | Revisão da Tarefa 8 |
| 20 | Os tipos gerados (`types/database.types.ts`) ainda listam funções que agora são fechadas para qualquer login; uma chamada a elas pelo painel compilaria e só falharia ao rodar | Baixa | Não | Revisão da Tarefa 5 |
| 21 | **Pequenas lacunas de teste** registradas nas revisões das Tarefas 1 a 10. Fim de linha: o teste confere só o texto do `.gitattributes`. Tipos: a tabela de falhas não confere que a CLI foi chamada; o teste de recusa cobre só o `&`; o ramo Linux não foi executado no Windows. Travas: faltam `localhost@exemplo.com`, `LOCALHOST`, `[::2]` e `SCC_URL` vazia ou ausente. Isolamento: "zero linhas" em tabela que o cliente nem enxerga; dependência de ordem entre testes. Erro 429: o teste não confere a linha 429 em `envios`. Vigia: faltam domingo→segunda e alarme já preenchido. Senha: um comentário no fim da linha do `config.toml` daria falso alarme | Baixa | Não | Revisões das Tarefas 1–10 |
| 22 | **Documentação com pequenos desencontros.** `docs/operacao/publicar.md` ainda cita a função `enviar-alerta` e a chave do Vault como se existissem (são da etapa 9); o limite de 40 caracteres do nome de campo conta o prefixo (`envelope.`, `janela.`, `lote.`); o README manda renomear o `.env.local` para `.env.nuvem.local` sem avisar que isso sobrescreve um `.env.nuvem.local` que já exista | Baixa | Não | Re-revisão final |

## Resolvidos

| Item | Resolvido em | Commit |
|---|---|---|
| A verificação não fechava no Windows (fim de linha, caminho fixo de Linux no teste de tipos, `npm run types`) | 13/10/2026 | `a2dfa0d` e `e37055b` |
| Não havia prova de que as migrations montam um banco do zero | 14/10/2026 | `8dde6f9` |
| `npm run supabase:migrate` mudava o banco da nuvem; o gerador enviava para qualquer endereço | 14/10/2026 | `ca9da22` |
| Função nova no banco nascia aberta para qualquer login | 14/10/2026 | `c9911f1` |
| Testes de isolamento cobriam só 2 das 8 tabelas | 14/10/2026 | `6b09fbd` e `2856f54` |
| O `429` reiniciava a contagem dos 20 s, e o contrato não avisava do intervalo | 14/10/2026 | `1694425` |
| Dado pessoal barrado por 4 nomes exatos de campo (D-51) | 14/10/2026 | `5a9de82`, `1d6eb07` e `2856f54` |
| O vigia parava para todos se um restaurante tivesse horário ou fuso malformado; alarmava na abertura; o esboço do alarme marcava "avisado" sem enviar | 14/10/2026 | `f085b0b` |
| Cadastro público aberto e senha mínima 6 no `config.toml` | 14/10/2026 | `ba4c5f2` |
| A CLI do Supabase não tinha versão fixa (em 14/10 uma versão nova saiu sem o programa para Windows por algumas horas) | 14/10/2026 | `1ba4ec2` |
