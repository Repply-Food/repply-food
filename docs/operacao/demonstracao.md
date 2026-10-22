# Roteiro de demonstração do repply food.

*Como mostrar o painel para a SCC ou para um dono de bar/restaurante, no site de
verdade (`https://food.repplyhub.com.br`), com uma casa de demonstração e dados
fictícios. Linguagem simples, de propósito: é para qualquer pessoa da Repply
conseguir demonstrar sozinha.*

> **A casa de demonstração é marcada no sistema** (aparece com a pílula
> "demonstração" no admin). Por ser de demonstração, ela **não dispara o e-mail
> de alarme** para a equipe quando fica parada — mas o **selo** dela (em dia /
> atrasado / parado) **continua mudando na tela** normalmente, então dá para
> mostrar isso ao vivo.

## Antes de demonstrar: deixar os números recentes (o "retoque")

Dado fictício envelhece. Para a casa de demonstração aparecer "em dia" e com
números bonitos, rode o gerador **pouco antes** da demonstração. Isso é um
**envio real para a nuvem** — portanto é uma operação autorizada (o Lucas
Ferreira autoriza na hora).

1. Crie um arquivo `.env.gerador.demo.local` (o Git ignora esse arquivo; nunca
   coloque o token em arquivo versionado) com:

   ```bash
   SCC_URL=https://klwpfltvtaltzcjxfmxf.supabase.co/functions/v1/receber-envio
   SCC_FUSO=America/Fortaleza
   SCC_TOKEN=<token da casa de demonstração, gerado no admin>
   ```

2. Rode o retoque (com `--confirmo-nuvem`, porque é a nuvem):

   ```bash
   node --env-file=.env.gerador.demo.local --import tsx scripts/gerador-dados-ficticios.ts --fuso America/Fortaleza --historico-dias 21 --confirmo-nuvem
   ```

3. Abra o admin e confira: a casa de demonstração vira **"em dia"** e "Últimos
   envios" mostra as contagens. Se quiser, defina/ajuste a **meta do mês** da
   casa (entrando como ela, em Ajustes) para a tela Hoje e a Resultados
   mostrarem o andamento.

## O roteiro (o que mostrar, em ordem)

1. **No admin, cadastre a casa** (ou abra a casa de demonstração já criada) e
   mostre o **token de envio** — é assim que o caixa do restaurante manda os
   dados.
2. **Ligue o gerador** (o retoque acima); a casa fica **"em dia"**. Explique: os
   dados chegam do caixa a cada ~5 minutos, quase em tempo real.
3. **Entre como o dono** (login do cliente) e mostre a **troca de senha** na
   primeira vez.
4. **No celular**, mostre o **guia "coloque na tela inicial"** (instalar como
   app). Só aparece no celular, uma vez por aparelho.
5. **Abra o "Hoje":** o faturamento do dia **sem a taxa de serviço** (a taxa
   aparece à parte — é dos garçons), comparado com a **média do mesmo dia da
   semana**, as mesas abertas, as contas esquecidas, e a **meta do mês** com
   projeção. Aponte o selo **"atualizado há X min"**.
6. **Abra o "Resultados":** escolha um período (Hoje · 7 dias · Mês · escolher)
   e passe pelas **quatro abas** — Vendas, Horários, Equipe, Descontos. Destaque
   a comparação justa (contra período anterior ou mesmo dia da semana).
7. **Exporte o PDF** do período — sai igual em qualquer aparelho.
8. **Mostre os Ajustes:** o dono define a **meta do mês** sozinho, o corte
   almoço/jantar, a senha e o tema.
9. **Pare o gerador** (Ctrl+C) e mostre o selo ir de **"em dia" → "atrasado" →
   "parado"**. Explique: quando o caixa de uma casa fica parado no horário de
   funcionamento, **a equipe Repply recebe um e-mail** e corre atrás — o dono
   não precisa ficar vigiando. *(Nesta casa de demonstração o e-mail não sai de
   propósito; o que funciona de verdade já foi testado.)*

## O que NÃO fazer

- **Não use o token nem os dados da casa de demonstração para testes ou cargas**
  — ela é só para demonstrar.
- **Não demonstre no `localhost`** quando a ideia é impressionar: use o site de
  verdade (`food.repplyhub.com.br`), que é mais convincente e mostra que já está
  no ar.
- **Nunca coloque o token** num arquivo que vá para o Git (use só o
  `.env.gerador.demo.local`, que é ignorado).
