# Contrato de dados SCC → repply food.

- **Versão:** 0.2, proposta da Repply, de 13/10/2026. **A validar com o Pedro (SCC).**
- **Para quem:** o desenvolvedor da SCC que implementa o envio no sistema do restaurante.
- **Escopo:** como o sistema SCC manda as entradas (mesas e contas) para a nuvem da Repply. O fluxo é só de ida: a Repply nunca escreve no SCC.

> **Mudou em relação ao teste com o n8n?** Pouco. Continua sendo um `POST` com JSON para um endereço na internet, com o mesmo componente HTTP já usado. Mudam três coisas: o endereço, o cabeçalho com o token do restaurante e o "envelope" em volta da lista de entradas. A parte realmente nova é guardar **até que data a nuvem já confirmou** e só avançar quando ela responder "ok".

---

## 1. Em 30 segundos

1. Cada restaurante recebe da Repply um **endereço** e um **token**, que ficam num **arquivo de configuração** do SCC.
2. A cada **5 minutos** (o intervalo está no arquivo), e também no **fechamento do caixa**, o SCC manda:
   - todas as entradas **abertas**;
   - todas as entradas **abertas ou fechadas** a partir da data já confirmada.
3. A nuvem responde `200` com a janela que ela confirmou. O SCC guarda a data e, no próximo ciclo, começa dali.
4. Se der erro ou a internet cair, o SCC **não avança a data** e simplesmente tenta no próximo ciclo. Nada se perde.
5. Uma vez por dia, ele reenvia os **últimos 7 dias**, para pegar estornos e reaberturas antigas.

## 2. Arquivo de configuração no restaurante

Endereço, token e intervalo **não podem ficar dentro do executável**. Assim, a troca de endereço ou de token não exige uma nova versão do SCC. Exemplo de seção num `.ini` (o formato fica a critério da SCC):

```ini
[RepplyFood]
Ativo=1
Url=https://<id-do-projeto>.supabase.co/functions/v1/receber-envio
Token=rf_8f3kQ2...            ; gerado no admin da Repply, mostrado uma única vez
IntervaloSegundos=300
UltimaDataConfirmada=2026-10-08   ; controlado pelo próprio SCC (ver §6)
```

**Cuidados com o token:**
- Nunca grave o token em log.
- O arquivo deve ser legível só pelo usuário do Windows que roda o SCC.
- Se a máquina for roubada, a Repply revoga o token pelo admin e gera outro.

## 3. A requisição

```
POST {Url}
Authorization: Bearer {Token}
Content-Type: application/json; charset=utf-8
```

- **HTTPS obrigatório, TLS 1.2 ou mais novo.** Não desligue a verificação de certificado.
- **Tempo limite sugerido:** 10 s para conectar e 30 s para a resposta. Se estourar, conta como falha.
- **O envio roda em segundo plano** (thread, serviço do Windows ou um programa pequeno separado, ver pergunta B19). O caixa nunca pode travar esperando a internet.
- **Os ciclos nunca se sobrepõem.** Se o envio anterior ainda não terminou, o novo ciclo é pulado.
- **No máximo um envio a cada 20 segundos por restaurante.** Abaixo disso a nuvem responde `429` e não grava nada. A contagem parte do último envio que a nuvem aceitou analisar: uma tentativa recusada com `429` **não** reinicia a contagem. Isso vale também para o envio extra do fechamento do caixa: se ele cair a menos de 20 s do ciclo anterior, espere completar os 20 s antes de mandar.

> **Dica sobre HTTPS no Delphi (a conferir pelo Pedro, pergunta B9):**
> - O `THTTPClient` (System.Net.HttpClient) usa o HTTPS do próprio Windows. No Windows 7, o TLS 1.2 depende de atualização do sistema.
> - O Indy depende das DLLs do OpenSSL, que precisam ser de uma versão com suporte a TLS 1.2.
> - O teste que conta é um `POST` HTTPS do computador de um restaurante real para um endereço na internet.

## 4. O envelope (versão 1 do formato)

```json
{
  "versao_formato": 1,
  "versao_scc": "5.2.1",
  "enviado_em": "2026-10-08T21:15:00",
  "modo": "janela",
  "janela": { "desde": "2026-10-07", "ate": "2026-10-08" },
  "lote": { "numero": 1, "total": 1 },
  "entradas": [
    { "codEntrada": 86775, "codCartaoMesa": 15, "DataEntrada": "2026-10-08", "HoraEntrada": "12:46:06", "...": "..." }
  ]
}
```

| Campo | Tipo | Obrigatório | O que é |
|---|---|---|---|
| `versao_formato` | inteiro | sim | Sempre `1` nesta versão do contrato |
| `versao_scc` | texto | sim | Versão do sistema SCC instalado no restaurante |
| `enviado_em` | data-hora local `AAAA-MM-DDTHH:MM:SS` | sim | Quando o envio foi montado, na hora do restaurante |
| `modo` | texto | sim | `"janela"` (modo A). O modo `"mudancas"` (B) fica para o futuro (§9) |
| `janela.desde` / `janela.ate` | data `AAAA-MM-DD` | sim | Período coberto por este envio (ver §6) |
| `lote.numero` / `lote.total` | inteiro | sim | **Sempre `1/1` na versão 1.** Cada envio leva a janela inteira; um dia de restaurante não chega a 2.000 contas. Campo reservado para o futuro |
| `entradas` | lista | sim | Pode ser **vazia**: é o "sinal de vida" quando não houve movimento |

**O restaurante não vai no corpo.** Quem identifica o restaurante é o token.

## 5. As entradas

Cada item da lista é uma **entrada** (sessão de mesa ou cartão), no mesmo formato do JSON de exemplo que o Pedro já gerou.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `codEntrada` | inteiro | **sim** | Identificador único **dentro do restaurante**. É a chave |
| `DataEntrada` / `HoraEntrada` | `AAAA-MM-DD` / `HH:MM:SS` | **sim** | Hora local do restaurante |
| `DataSaida` / `HoraSaida` | idem ou `null` | sim (pode ser `null`) | `null` = entrada aberta |
| `ValorItens`, `ValorDescontos`, `ValorAcrescimos`, `TaxaServico`, `Complemento`, `ValorConsumido` | número com no máximo 2 casas (ponto decimal) | `ValorConsumido` **sim**, os outros sim (podem ser `0`) | A nuvem converte para valor exato |
| `Pago` | `"Sim"` / `"Não"` (também aceita `true`/`false`) | **sim** | |
| `codCartaoMesa`, `CodGarcon`, `codOperadorHab`, `codOperadorDesab`, `codCliente` | inteiro ou `null` | sim (podem ser `null`) | Códigos do próprio SCC |
| `NumeroOcupantes` | inteiro | sim | Pessoas na mesa |
| `TipoOcupacao`, `TipoCartao` | texto | sim | Lista de valores possíveis: pergunta H4 |
| `Reabilitado`, `Flyer`, `ConferenciaDeMesa`, `HabilitacaoAutomatica`, `DesabilitacaoAutomatica`, `LimiteMinimo`, `LimiteMaximo`, `ECF`, `CER`, `COO` | como vierem | não | Guardados como "extras" até o significado ser confirmado (H3, B17) |

**Não envie** os campos abaixo. Mesmo que cheguem, a nuvem descarta antes de gravar. São dados pessoais sem finalidade no produto (LGPD):

- `NomeCliente`
- `RG`
- `FoneCliente`
- `Sexo`

**Campo fora das duas tabelas acima não é guardado.** Se o SCC passar a mandar um campo novo, a nuvem descarta o valor e registra só o nome do campo, que aparece para a Repply no admin. Para um campo novo passar a valer, combine antes: ele entra nesta lista numa versão nova do contrato.

Textos com espaço sobrando no fim ("Masculino ") são aceitos, porque a nuvem corta. Mas, se der, mande já sem.

## 6. O que entra em cada envio (modo A, janela por data)

O SCC guarda **`UltimaDataConfirmada`**. Em cada ciclo:

```
hoje   = data local de hoje
desde  = o menor entre UltimaDataConfirmada e (hoje − 1 dia)
ate    = hoje

entradas = todas as entradas em que
             DataSaida IS NULL                    -- abertas, de qualquer data
          OR DataEntrada BETWEEN desde AND ate     -- abertas no período
          OR DataSaida   BETWEEN desde AND ate     -- fechadas no período
```

- **Deu `200`?** Grave `UltimaDataConfirmada = janela_confirmada.ate`, que vem na resposta.
- **Qualquer outra resposta, ou sem resposta?** Não mexa em `UltimaDataConfirmada`; o próximo ciclo cobre o mesmo período.
- **Varredura diária:** no primeiro ciclo depois das 6h, use `desde = hoje − 7 dias`. Isso pega estorno, reabertura e cancelamento feitos em dias anteriores.
- **Envio extra:** dispare um ciclo fora de hora no **fechamento do caixa ou do dia**, para o número do dia fechar completo na hora.
- **Sem movimento?** Mande mesmo assim, com a lista vazia. É assim que a Repply distingue "restaurante sem venda" de "SCC parou de enviar".

**Por que "todas as abertas" sempre vão junto:** a nuvem precisa saber quando uma mesa aberta há dias foi fechada ou apagada. Se uma entrada que estava aberta deixa de vir, ela foi fechada (e então chega pela data de saída) ou foi apagada (e a nuvem marca como removida).

**O que a nuvem faz com a janela:**
- grava ou atualiza cada entrada pela chave (restaurante, `codEntrada`);
- uma entrada que estava no banco, pertencia àquela janela (ou estava aberta) e **não veio**, é marcada como **removida**: sai dos relatórios, mas não é apagada.

Por isso cada envio precisa conter **a janela completa**, nunca só uma parte.

## 7. Respostas

| Código | Significa | O que o SCC faz |
|---|---|---|
| **200** | Recebido e gravado | Grava `UltimaDataConfirmada = janela_confirmada.ate`. Se vier `proximo_envio_em_segundos`, usa como intervalo. Se vier `reenviar_desde`, ver §8 |
| **401** | Token ausente, errado ou revogado | Registra no log local e continua tentando no ciclo normal. A Repply vê o restaurante como "parado" e entra em contato |
| **400** | JSON inválido | Bug: registra e continua |
| **413** | Envio grande demais (mais de **2 MB** ou de **2.000 entradas**) | Divide a janela ao meio e manda cada metade separada (§8) |
| **422** | Formato errado (versão desconhecida, campo obrigatório faltando) | Registra a lista `erros` da resposta e continua. A Repply também recebe e guarda o envio |
| **429** | Envios rápidos demais: menos de 20 s desde o envio anterior | Não avança a data. Espera pelo menos 20 s (ou o próximo ciclo) e manda de novo a mesma janela |
| **5xx** ou sem resposta | Problema do lado da Repply ou da rede | Espera o próximo ciclo. Nada se perde |

Exemplo de `200`:

```json
{
  "ok": true,
  "recebidas": 212,
  "gravadas": 8,
  "inalteradas": 203,
  "removidas": 1,
  "janela_confirmada": { "desde": "2026-10-07", "ate": "2026-10-08" },
  "proximo_envio_em_segundos": 300
}
```

## 8. Carga inicial do histórico e "recomeçar do zero"

- **Carga inicial.** Na instalação, o SCC manda todo o histórico que tiver (D-21), da data mais antiga até hoje:
  - envia em **janelas de 7 dias**, uma por vez, e só manda a próxima depois do `200` da anterior;
  - se uma janela passar do limite (`413`), divide ao meio, até chegar a um dia por envio;
  - pode rodar devagar, em segundo plano, por horas, sem atrapalhar o caixa;
  - terminada a carga, passa ao ciclo normal com `UltimaDataConfirmada = hoje`.
- **Recomeçar do zero.** Se a Repply precisar de tudo de novo (correção de conversão, troca de conta), o `200` traz `"reenviar_desde": "AAAA-MM-DD"`. O SCC volta `UltimaDataConfirmada` para essa data e refaz a carga a partir dela. Assim a Repply pede o reenvio sem precisar de ninguém no computador do restaurante.

## 9. Modo B: só o que mudou (futuro, opcional)

Se o volume justificar e a SCC puder alterar o banco dos clientes, o SQL Server 2008 tem o **Change Tracking**. Ele registra o que foi inserido, alterado **e apagado** desde a última versão lida, sem mudar a estrutura da tabela (só exige chave primária).

O envelope ganharia `"modo": "mudancas"`, `"cursor": { "ate": <versão> }` e uma lista `"removidos": [codEntrada, ...]`. **Não é necessário para o MVP.** Fica registrado para quando fizer sentido (pergunta B3).

## 10. Como testar

1. A Repply entrega um **restaurante de teste** no admin, com endereço e token.
2. Teste mínimo, de qualquer computador com `curl`:

```bash
curl -X POST "$URL" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"versao_formato":1,"versao_scc":"teste","enviado_em":"2026-10-08T21:15:00","modo":"janela","janela":{"desde":"2026-10-08","ate":"2026-10-08"},"lote":{"numero":1,"total":1},"entradas":[]}'
```

3. Depois, o mesmo teste **a partir do Delphi, no computador de um restaurante de verdade**. É esse teste que valida o HTTPS (B9).
4. No admin, o restaurante de teste aparece "em dia", e a lista "últimos envios" mostra cada chamada com as contagens e os erros.

## 11. Perguntas em aberto que afetam este contrato

Estão em `_descoberta/2026-10-05-banco-de-perguntas.md`, blocos B e H.

| # | Pergunta | Afeta |
|---|---|---|
| B1/B2 | Todos os clientes usam SQL Server 2008 e a mesma versão do SCC? | Consulta do §6 |
| B4/B5 | Entrada muda depois de fechada? Cancelada é apagada ou marcada? | Reconciliação do §6 |
| B6 | O dia de operação é pela abertura, pelo fechamento ou pelo caixa? | Métricas (a nuvem usa abertura com virada às 5h até a resposta) |
| B7/H11 | Que outras tabelas podem vir (itens, pagamentos, garçons, operadores)? | Versão 2 do formato |
| B9/B19 | O HTTPS funciona no Delphi do restaurante? Onde roda o envio? | §3 |
| B10 | O envio roda em segundo plano sem travar o caixa? | §3 |
| B12 | Dá para não enviar nome, RG, telefone e sexo? | §5 |
| B14 | Tamanho do histórico do maior cliente | §8 |
| B20 | O SCC consegue filtrar por "abertas + abertas ou fechadas desde X"? | §6 |
| H1 | O envelope deste contrato serve? | §4 |
| H3/H4/H5/H7 | Significado dos campos, valores possíveis, fórmula do `ValorConsumido`, fiado e cortesia | §5 e métricas |
| H10 | Datas sempre na hora local e dinheiro com até 2 casas? | §5 |

## 12. Histórico do contrato

| Versão | Data | Mudança |
|---|---|---|
| 0.1 | 08/10/2026 | Proposta inicial da Repply, para a reunião com a SCC |
| 0.2 | 13/10/2026 | Intervalo mínimo de 20 s entre envios explicado no §3 e no §7; o `429` não reinicia a contagem; campo fora da lista do §5 é descartado (D-51) |
