# Cadastrar um restaurante novo

*Roteiro para a equipe Repply colocar um cliente no ar. Tudo é feito no admin (`/admin`), sem precisar de desenvolvedor (D-32).*

## Antes de começar

Tenha em mãos:
- nome do restaurante e, se tiver à mão, o CNPJ (opcional; se preenchido, é conferido e não pode repetir, D-60);
- horário de funcionamento por dia da semana, com até dois horários por dia, como almoço e jantar (D-56). Sem ele o vigia não sabe quando a casa está fechada e acusa atraso fora de hora;
- a hora em que o "dia" vira (padrão 5h);
- turnos (padrão: almoço até 17h);
- o **e-mail** do login da casa (D-10/D-11).

Confirme também com a SCC que o computador do restaurante tem o SCC numa versão que já envia para o repply food.

## Passo a passo

1. **Admin → "+ Cadastrar restaurante".**
   - Nome; CNPJ (opcional, com ou sem pontuação; vale o CNPJ com letras); fuso (lista dos fusos do Brasil); "o dia vira às" (padrão 5h).
   - Horário de funcionamento, um bloco por dia: "Fechado", "Um horário" ou "Dois horários" (almoço e jantar). Fecha antes de abrir quer dizer que passa da meia-noite. "Copiar para os outros dias" repete o dia em toda a semana. Precisa de pelo menos um dia aberto.
   - Turnos, limite da conta esquecida e intervalo de envio ficam com o padrão.
   - O endereço do painel (`slug`) sai do nome, por exemplo `bar-do-ze`, e não muda depois.
2. **Gerar o token de envio** (cartão "Token de envio").
   - O token aparece **uma única vez**, no quadro "Copie agora". Sair da página apaga o quadro.
   - Para trocar: "Gerar novo token" e escolher se o antigo para **agora** (padrão) ou **em 24 h** (o SCC tem um dia para trocar). Máquina roubada: "Revogar token".
3. **"Copiar instruções para a SCC"** (no mesmo quadro). Monta a mensagem pronta, com:
   - o endereço;
   - o token;
   - o intervalo;
   - o pedido de fazer a carga inicial do histórico.

   Mande ao responsável da SCC pelo canal combinado. **Nunca publique o token em grupo nem em e-mail com várias pessoas.**
4. **Criar o acesso do cliente** (cartão "Acesso do cliente").
   - "Criar login" com o e-mail do dono. O sistema cria o login com senha provisória e troca obrigatória no primeiro acesso.
   - A senha aparece **uma única vez**: "Copiar mensagem para o WhatsApp" e mande ao dono (D-55).
   - Se o e-mail já tem acesso a outra casa (dono com duas casas), o login só ganha esta casa, sem mudar a senha.
5. **Acompanhar o primeiro envio.**
   - O restaurante sai de "aguardando 1º envio" e passa a "em dia" quando o vigia roda (até 5 minutos depois do envio).
   - Em "Últimos envios", acompanhe a carga inicial, que manda janelas de 7 dias até chegar a hoje.
6. **Conferir os números com o fechamento do SCC** no primeiro dia de operação completo. É o critério nº 1 do piloto: **o faturamento tem que bater centavo a centavo.** Se não bater, anote a diferença e registre em `docs/divida-tecnica.md`.
7. **Primeiro acesso do dono, junto com ele se possível.**
   - Troca de senha.
   - Guia "coloque na tela inicial" no celular dele.
   - Um passeio pelas telas "Hoje" e "Resultados".

Para conferir o que o dono vê, use "Ver o painel do cliente" (só leitura; fica no histórico). Tudo o que o admin faz aparece no cartão "Histórico".

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
| Precisa reenviar tudo | Correção de conversão ou mudança de fuso | Cartão "Pedir reenvio": data "desde" (até 120 dias). Vai na próxima resposta para o SCC |
| O dono não consegue entrar | Esqueceu a senha ou perdeu a provisória | "Redefinir senha": gera outra provisória e desconecta os aparelhos daquele login |
| Cliente em pausa ou inadimplente | — | Cartão "Situação" → "Suspender" (os dados ficam e o SCC continua enviando, D-57) |
