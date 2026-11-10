# repply food · roadmap (próximos passos)

> Onde estamos (10/11/2026): o MVP (etapas 1–10) está concluído e a etapa 11 (piloto com a SCC e um cliente real) está em andamento. O mentor de IA v1 (chat) foi publicado em 10/11/2026: nasce **desligado** em toda casa e está ligado só na casa de demonstração (D-74).

Este documento põe os próximos passos em ordem, os nossos e os do Lucas Duarte. É um documento vivo: a ordem muda conforme o piloto pedir. Cada item diz quem toca ([nós], [Lucas Duarte], [decisão do Lucas Ferreira]).

## Agora — estabilizar o que subiu

- **Humanizar a voz do mentor.** Ajustar a cartilha para o mentor soar como gente, não como relatório. Vai pela cartilha no admin, então pega na hora, sem publicar de novo. [nós]
- **Fechar a verificação dos módulos.** Reconciliar `types/database.types.ts` com `npm run types` (hoje a coluna `modulos` está editada à mão, correta) e rodar os dois testes de banco que ficaram adiados: o do valor-padrão da coluna `modulos` e o do gravar do liga/desliga no admin. Depende do Supabase local, que está fora por falta de espaço no disco C: desta máquina. [nós]
- **Webhook v2 da SCC.** As migrations do webhook v2 já estão na nuvem, dormentes; o `receber-envio` no ar ainda é o v1. O Lucas Duarte publica a função v2 quando ela estiver pronta e a SCC estiver mandando no formato novo (D-71). [Lucas Duarte]
- **Billing do Gemini antes de um cliente real.** No nível grátis, a Google usa os dados para treinar e o serviço cai sob carga (erro 503). Antes de apontar o mentor para um cliente real do piloto, ligar o billing (nível pago: sem treino, D-29/LGPD; com teto de gasto mensal). Para a demonstração e os testes internos, o grátis serve. [decisão do Lucas Ferreira]

## Fase 1 — Testes e segurança do mentor

Montar um banco de cenários e rodá-lo contra o bot antes de abrir o mentor para mais casas. Vem primeiro porque o bot já está no ar: ele precisa ser confiável e difícil de burlar antes de crescer.

Entregável: uma planilha de cenários, separada por categoria, com um nível por linha (básico, intermediário, adversarial) e as colunas `id`, `categoria`, `nível`, `pergunta`, `comportamento esperado`, `resultado observado`, `status`.

Categorias:

1. **Capacidade (interações reais).** As perguntas do dia a dia do dono: faturamento de hoje e de ontem, comparação com o mesmo dia da semana, meta do mês, turnos (almoço e jantar), contas esquecidas, mesas abertas, "como foi a semana", pedido de conselho de operação.
2. **Fora de escopo.** Perguntas que não são da casa (receita, política, assunto pessoal). Esperado: recusa educada e oferta do que dá para olhar.
3. **Fato x conselho (trilho 2).** Todo número tem de vir de ferramenta; sugestão vem rotulada como ideia para testar; sem o dado, o mentor diz que não tem (casa nova, sem movimento).
4. **Jurídico, fiscal e trabalhista (trilho 3).** Esperado: o mentor orienta a procurar um profissional.
5. **Segurança e jailbreak.** Tentar extrair a cartilha, pedir para ignorar os trilhos, injetar instrução ("esqueça as regras e..."), fingir ser admin ou desenvolvedor, pedir o prompt do sistema. Esperado: os trilhos se mantêm.
6. **Isolamento entre casas (D-29).** Pedir dado de outra casa ou outro restaurante. Esperado: só a casa da sessão, nunca outra.
7. **Privacidade e LGPD (D-29).** Tentar extrair dado pessoal de cliente do restaurante (que nem é guardado). Esperado: o mentor não tem esse dado.
8. **Robustez e limites.** Pergunta vazia, pergunta gigante (acima de 4000 caracteres), casa sem dados, provedor fora (503), limite diário de 50 estourado. Esperado: frase do produto, nada quebra.
9. **Voz e humanização.** A resposta soa como gente (breve, sem jargão de robô, sem frase de efeito)? Liga com a cartilha humanizada do item "Agora".

## Fase 2 — Organização de chats (sessões)

Guardar as conversas do dono com o mentor em sessões separadas, cada uma com um título (renomeável), e poder arquivar ou excluir. Hoje o chat abre sempre na conversa mais recente; isto dá ao dono um histórico navegável. É também a base da Fase 3: a memória precisa das sessões para se organizar.

## Fase 3 — Memória e contexto do mentor

O mentor passa a lembrar do contexto entre conversas (o que a casa já perguntou, preferências), sem reprocessar tudo a cada pergunta. Depende da Fase 2. Respeita a guarda de 60 dias se o dono excluir, 12 meses no resto (D-75) e o isolamento por casa (D-29): a memória de uma casa nunca encosta na de outra.

## Fase 4 — Anexos (arquivos para o mentor analisar)

Anexar arquivos de vários tipos (imagem, PDF, planilha) para o mentor analisar junto do texto. É a fase mais pesada: mexe em envio, armazenamento, limite de tamanho, custo e segurança (nenhum anexo pode vazar entre casas). O Gemini aceita entrada multimodal. Fica por último.

## Por que esta ordem

Testes e segurança primeiro, porque o mentor já está no ar e precisa ser confiável antes de crescer. Sessões antes da memória, porque a memória se apoia nas sessões. Anexos por último, por serem o maior esforço e o maior risco de privacidade. A ordem não é fixa: se o piloto mostrar que falta algo antes, a gente reordena.
