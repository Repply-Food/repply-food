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
| 14 | **Quem está logado, e quem não está, tem poder demais nas tabelas.** O Supabase entrega por padrão, em todas as tabelas, os privilégios de esvaziar a tabela inteira (`TRUNCATE`) e de criar gatilhos e referências (`TRIGGER`, `REFERENCES`) aos papéis `anon` e `authenticated`; inserir, alterar e apagar linhas também vêm liberados, mas a regra de segurança por restaurante barra. Essa regra **não cobre o `TRUNCATE`**. A API do painel (PostgREST) não expõe esse comando hoje, então não há caminho de ataque conhecido. Recomendação: mudança na estrutura do banco (migration) que retira esses privilégios, com teste | Média | Decidir com o Lucas Ferreira antes da primeira publicação (etapa 4) | Revisão da Tarefa 6 |
| 16 | **Uma falha geral no vigia passaria quase despercebida.** Ele pula o restaurante em **qualquer** erro (`exception when others`), não só em cadastro malformado; se faltasse uma permissão ou alguém apagasse uma função, os estados ficariam parados e só sobraria um aviso no registro do banco. Trocar por `exception when data_exception`, numa migration nova | Média | Não | Revisão da Tarefa 9 |
| 17 | **Ferramentas de teste com vulnerabilidades conhecidas.** `npm audit` acusa 7 (3 críticas), todas no Vitest 2 e nas suas dependências (vite, esbuild, tinypool). Já existiam antes da etapa 1 e não vão para o site publicado. Atualizar o Vitest (o conserto automático instalaria o Vitest 5, uma mudança grande) | Média | Não | Auditoria de dependências pendente desde a fundação |
| 18 | O atalho `npm run supabase:reset` (`supabase db reset`) apaga o banco local inteiro, inclusive a demonstração; o README pede para não usar. Considerar remover o atalho | Baixa | Não | Revisão final |
| 19 | Chamada direta à função `processar_envio` (só a chave de serviço consegue) com valor composto num campo de dinheiro grava 0 sem aviso, e em `Pago` grava "não pago". Pela recepção, o envio recebe 422 | Baixa | Não | Revisão da Tarefa 8 |
| 20 | Os tipos gerados (`types/database.types.ts`) ainda listam funções que agora são fechadas para qualquer login; uma chamada a elas pelo painel compilaria e só falharia ao rodar | Baixa | Não | Revisão da Tarefa 5 |
| 21 | **Pequenas lacunas de teste** registradas nas revisões das Tarefas 1 a 10. Fim de linha: o teste confere só o texto do `.gitattributes`. Tipos: a tabela de falhas não confere que a CLI foi chamada; o teste de recusa cobre só o `&`; o ramo Linux não foi executado no Windows. Travas: faltam `localhost@exemplo.com`, `LOCALHOST`, `[::2]` e `SCC_URL` vazia ou ausente. Isolamento: "zero linhas" em tabela que o cliente nem enxerga; dependência de ordem entre testes. Erro 429: o teste não confere a linha 429 em `envios`. Vigia: faltam domingo→segunda e alarme já preenchido. Senha: um comentário no fim da linha do `config.toml` daria falso alarme | Baixa | Não | Revisões das Tarefas 1–10 |
| 22 | **Documentação com pequenos desencontros.** `docs/operacao/publicar.md` ainda cita a função `enviar-alerta` e a chave do Vault como se existissem (são da etapa 9); o limite de 40 caracteres do nome de campo conta o prefixo (`envelope.`, `janela.`, `lote.`); o README manda renomear o `.env.local` para `.env.nuvem.local` sem avisar que isso sobrescreve um `.env.nuvem.local` que já exista | Baixa | Não | Re-revisão final |
| 23 | **O limite de tentativas por endereço de internet do Supabase Auth vê o endereço do servidor da Vercel, não o de quem tenta.** Uma pessoa errando a senha pode bloquear o login de todos por alguns minutos, e pela D-52 esse limite é a única proteção. Opções: um limitador no banco (não depende de memória do servidor) ou repassar o endereço real de quem tenta | Alta | Decidir com o Lucas Ferreira antes da primeira publicação (etapa 4) | Etapa 2, Tarefa 3 (D-52) |
| 24 | **O login ainda não está configurado na nuvem.** No Supabase da nuvem: liberar `https://food.repplyhub.com.br/**` nos endereços de retorno do login, pôr o `site_url` no domínio, levar o modelo `supabase/templates/recuperar-senha.html` (link com `token_hash`), ligar o envio pelo Resend e conferir a cota de e-mails. Hoje o erro `over_email_send_rate_limit` vira sucesso em silêncio, inclusive quando é a cota geral e não a do usuário: registrar o código no log | Média | Primeira publicação (etapa 4) | Etapa 2, Tarefas 0 e 3 |
| 25 | **Os 800 ms de espera mínima em "esqueci a senha" podem não cobrir o envio real por SMTP.** Se o envio for mais lento, o tempo de resposta denuncia quais e-mails estão cadastrados. Medir com o envio real na nuvem e ajustar | Média | Primeira publicação (etapa 4) | Etapa 2, Tarefa 3 |
| 26 | **O selo "atualizado há X min" é calculado no layout e não se atualiza sozinho entre as abas.** Uma aba esquecida aberta continua com o texto da última carga. Definir a atualização periódica junto com os números do Hoje | Média | Tela Hoje (etapa 5) | Etapa 2, Tarefa 5 |
| 27 | **`obterSessao` e `destinoDe` (`lib/auth/sessao.ts`, `lib/auth/actions.ts`) ignoram o erro da consulta de restaurantes.** Uma falha passageira vira lista vazia e leva o dono ao "acesso pendente". Tratar o erro ("tente de novo") em vez de supor que não há casa | Média | Admin (etapa 3), que mexe nesses arquivos | Etapa 2, Tarefas 3 e 5 |
| 28 | O `TextField` copiado do Imob (`components/forms/form-field.tsx`) não usa o `FormField`: o rótulo não fica vermelho no erro e o `aria-describedby` não aponta para a mensagem (o `role="alert"` cobre o anúncio) | Baixa | Etapa 6 (formulários de Ajustes) | Etapa 2, Tarefa 2 |
| 29 | As fontes OTF são pré-carregadas (cerca de 520 KB). Avaliar woff2 e pré-carregar só os pesos principais | Baixa | Etapa 6 | Etapa 2, Tarefa 1 |
| 30 | **Bibliotecas acima do lock do Imob.** Resolveram mais novas que o `package-lock` do Imob (base-ui 1.9, lucide 1.57, recharts 3.10, zod 4.6.7, shadcn 4.21.5): olhar as diferenças nos componentes copiados. O texto padrão das mensagens do zod mudou ("Required" virou "Invalid input: …") e aparece em `erros[].mensagem` na resposta da recepção. O `npm audit` segue acusando só ferramentas de desenvolvimento (item 17) | Baixa | Não | Etapa 2, Tarefa 1 |
| 31 | `user_banned` no login cai na frase genérica. Se um dia a conta for bloqueada pelo Supabase, mapear para "E-mail ou senha incorretos." (`lib/auth/erros.ts`) | Baixa | Não | Etapa 2, Tarefa 3 |
| 32 | A borda de "atenção" do aviso flutuante (`--warning`) mede cerca de 2:1 de contraste. O ícone e o texto informam o tipo, então a cor não é o único canal | Baixa | Etapa 6 (acabamento) | Etapa 2, Tarefa 2 |
| 33 | Na troca voluntária de senha, a senha atual vazia só é recusada no servidor ("A senha atual não confere."): o formulário aceita o campo vazio porque serve também ao primeiro acesso (`senhaAtual` em `lib/auth/schemas.ts`) | Baixa | Não | Etapa 2, Tarefa 4 |
| 34 | **O `next dev` do Next 16.4 reescreve `AGENTS.md` e `next-env.d.ts`.** Não commitar essas mudanças: rodar `git checkout -- AGENTS.md next-env.d.ts` antes de commitar | Baixa | Não | Etapa 2, Tarefa 3 |
| 35 | **Pequenas lacunas de teste da etapa 2.** O teste do `SeloDados` não confere o tom (verde, amarelo, vermelho, cinza); a ligação do layout de `/r/[slug]` com `seloDaLeitura` não tem teste; a condição de erro da leitura do sinal está em dois lugares (layout e `seloDaLeitura`); o título de um teste de `tests/painel/selo-da-leitura.test.ts` promete mais do que ele confere | Baixa | Não | Revisões das Tarefas 2 e 5 |
| 36 | **Pequenos acabamentos da etapa 2.** Depois de trocar a senha, `refreshSession` e `signOut({ scope: "others" })` rodam sem conferir o resultado; o redirecionamento relativo de `/auth/confirmar` existe por causa do Next 16.4, que troca `127.0.0.1` por `localhost` (só afeta o ambiente local; rever ao atualizar o Next); com a troca de senha pendente, quem abre o link do e-mail num aparelho já logado vai para `/trocar-senha` antes de ver a explicação de `/entrar`; `--color-border` está no `@theme` e em `tokens.css` (frágil à ordem dos imports); a área de toque do olho da senha vale também no computador (4 px além do campo); o comentário de `input-group.tsx` diz "um pouco menor" para 5 px contra 10 px | Baixa | Não | Revisões das Tarefas 2, 3 e 4 |

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
| O cadastro fechado era testado só pelo arquivo de configuração. Agora há teste de comportamento: quem tenta se cadastrar é recusado (`signup_disabled`), em `tests/auth/nucleo.test.ts` (item 12) | 14/10/2026 | `7319e40` |
| As bibliotecas do Food estavam uma geração atrás das do Repply Imob (gráficos, validação, login). Alinhadas, com `react-is` 19 para o Recharts, `shadcn` nas devDependencies e Node e Deno na mesma versão (item 13) | 14/10/2026 | `09a24ae` e `8c467e4` |
| O selo "há X min" podia ficar vermelho na hora em que a casa abre, enquanto o admin mostrava "em dia". Agora segue o estado do vigia (D-53; item 15) | 14/10/2026 | `0a9554a`, `44fc2b8`, `d743ac3` e `3122535` |
