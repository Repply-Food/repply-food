# Cadastrar um restaurante novo

*Roteiro para a equipe Repply colocar um cliente no ar. Tudo é feito no admin (`/admin`), sem precisar de desenvolvedor (D-32).*

## Antes de começar

Tenha em mãos:
- nome do restaurante e CNPJ;
- horário de funcionamento por dia da semana (para o alarme não tocar com a casa fechada);
- a hora em que o "dia" vira (padrão 5h);
- turnos (padrão: almoço até 17h);
- o **e-mail** do login da casa (D-10/D-11).

Confirme também com a SCC que o computador do restaurante tem o SCC numa versão que já envia para o repply food.

## Passo a passo

1. **Admin → "+ Cadastrar restaurante".**
   - Preencha os dados acima. O endereço (`slug`) sai do nome, por exemplo `bar-do-ze`.
2. **Gerar o token de envio.**
   - O token aparece **uma única vez**. Copie na hora.
   - Se perder, gere outro: o antigo para na hora.
3. **"Copiar instruções para a SCC".** Monta a mensagem pronta, com:
   - o endereço;
   - o token;
   - o intervalo;
   - o pedido de fazer a carga inicial do histórico.

   Mande ao responsável da SCC pelo canal combinado. **Nunca publique o token em grupo nem em e-mail com várias pessoas.**
4. **Criar o acesso do cliente.**
   - Informe o e-mail.
   - O sistema cria o login com senha provisória e marca a troca obrigatória no primeiro acesso.
   - Mande ao dono a senha provisória e o endereço `food.repplyhub.com.br`.
5. **Acompanhar o primeiro envio.**
   - O restaurante sai de "aguardando 1º envio" e passa a "em dia".
   - Em "últimos envios", acompanhe a carga inicial, que manda janelas de 7 dias até chegar a hoje.
6. **Conferir os números com o fechamento do SCC** no primeiro dia de operação completo. É o critério nº 1 do piloto: **o faturamento tem que bater centavo a centavo.** Se não bater, anote a diferença e registre em `docs/divida-tecnica.md`.
7. **Primeiro acesso do dono, junto com ele se possível.**
   - Troca de senha.
   - Guia "coloque na tela inicial" no celular dele.
   - Um passeio pelas telas "Hoje" e "Resultados".

## Mensagem modelo para a SCC

```
Olá! Seguem os dados do repply food. para o restaurante <NOME>:

Endereço: <URL>
Token: <TOKEN>          (guardar só no arquivo de configuração do SCC)
Intervalo: 300 segundos

Por favor, façam a carga inicial do histórico (contrato de dados, §8) e
nos avisem quando o restaurante estiver enviando. Qualquer erro aparece
para nós no painel de administração.
```

## Quando algo dá errado

| Sintoma no admin | Causa provável | O que fazer |
|---|---|---|
| Continua "aguardando 1º envio" | O SCC ainda não está configurado, ou o token foi colado errado | Falar com a SCC; se preciso, gerar um token novo |
| "Parado" dentro do horário | Computador desligado, internet do restaurante ou token revogado | Ver "últimos envios" (401 = token); falar com a SCC (D-30) |
| Erros 422 em "últimos envios" | O formato mudou (versão do SCC) | Abrir o envio guardado e falar com o Pedro |
| Números não batem com o SCC | Regra de negócio (cortesia, fiado, taxa, dia de operação) | Ver `docs/metricas.md`; registrar e conversar com a SCC |
| Precisa reenviar tudo | Correção de conversão | Admin → "pedir reenvio desde…" (vai na próxima resposta para o SCC) |
