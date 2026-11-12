# Mentor Fase 4 — Anexos (arquivos para o mentor analisar) — desenho

**Data:** 12/11/2026
**Status:** aprovado por Lucas Ferreira (partes 1–3, em conversa)
**Decisões:** D-72, D-73, D-74, D-75; sem número novo (regras novas cabem nas existentes)
**Relacionado:** roadmap Fase 4 (issue #5); desenhos das Fases 2 e 3

## 1. Objetivo

O dono anexa arquivos à pergunta (imagem, PDF, planilha) e o mentor analisa junto do texto. Vale tudo das fases anteriores: número só de ferramenta, trilhos, cartilha, fichas, limite diário, RLS por casa, exclusão matando o que nasceu da conversa.

## 2. Decisões vinculantes

1. Os três tipos de uma vez: imagem, PDF e planilha.
2. Limite: até 5 arquivos por pergunta, 10 MB cada.
3. Cofre privado + ficha de controle (abordagem A aprovada). Nada de arquivo dentro da mensagem, nada de link externo.
4. Excluir conversa apaga os arquivos junto, na hora (como as fichas). A cópia de segurança de 60 dias (D-75) guarda só texto, nunca arquivo.
5. Pergunta com anexo conta 1 uso normal do limite do dia.
6. Falha no anexo não derruba a pergunta digitada.

## 3. Guarda

- Cofre (bucket) novo `mentor-anexos`, **privado**: nenhuma leitura pública. Caminho por casa e conversa: `mentor-anexos/{restaurante_id}/{conversa_id}/{anexo_id}-{nome-seguro}`. O caminho sozinho não revela nada (uuids, sem nome de casa).
- Tabela `mentor_anexos`, por migration aditiva, RLS no mesmo arquivo, sem `FORCE ROW LEVEL SECURITY`:
  - `id uuid pk`, `restaurante_id` (casa, FK cascade), `conversa_id` (FK `mentor_conversas`, cascade), `nome_original text 1–120`, `tipo text check ('imagem','pdf','planilha')`, `tamanho_bytes int check (tamanho_bytes > 0 and tamanho_bytes <= 10485760)` (10 MiB), `caminho text` (chave do cofre), `criada_em`.
  - Dono: SELECT na casa dele. Sem escrita direta para `authenticated` (só a função do servidor, com chave de serviço). Admin: SELECT (suporte, só leitura, D-38); sem tela de fichas de memória, mas anexo é conteúdo da conversa como o texto — o suporte vê e baixa.
  - Índices começam por `restaurante_id`.
- Tipos regenerados com `npm run types`, sem inventar à mão.

## 4. Envio

- Junto do campo de pergunta, botão de anexar: até 5 arquivos, 10 MB cada, tipos: imagens comuns (png/jpeg/webp), `application/pdf`, planilhas (`xlsx/csv`).
- A função do servidor confere, nesta ordem: casa da sessão tem o módulo; conversa (se continuada) é da casa e está à vista; quantidade ≤ 5; cada arquivo com tipo permitido e tamanho ≤ 10 MB; nome seguro (sem caminho, 1–120 letras).
- Fora da regra: recusa com frase do produto, sem gastar limite, sem chamar a IA, sem gravar nada.
- Gravação em duas etapas: sobe o arquivo ao cofre e grava a ficha; erro no meio desfaz o que subiu (sem órfão). Falha no anexo não apaga a pergunta digitada: o dono reenvia só o anexo.
- Uso do dia: a pergunta conta 1, com ou sem anexo.
- Todo erro vira frase do produto; log só com código novo no allowlist (ex.: `falha_anexos_mentor`), nunca nome/conteúdo do arquivo, pergunta ou erro cru.

## 5. Leitura pela IA e resposta

- Ao responder, o servidor entrega cada anexo à IA por acesso temporário de minutos (nunca link permanente), junto do texto da pergunta.
- As fichas de memória continuam valendo; anexo não vira ficha sozinho (só o que a extração da Fase 3 julgar que vale guardar).
- Provedor continua trocável (D-73); o envio multimodal passa pela mesma interface, com o tipo de anexo declarado.
- Falha ao entregar o anexo à IA: conta como provedor inalcançável (devolve o uso, como na v1) e avisa o dono com frase do produto.

## 6. Telas

- Na conversa: cada anexo aparece com nome, tipo, tamanho e botão de baixar (download pela função do servidor, que confere a casa; nunca link público). Abaixo do campo, o botão de anexar com o limite escrito ("até 5 arquivos, 10 MB cada").
- Página "O que o mentor lembra": inalterada (anexo não é ficha).
- Admin: na conversa, lista os anexos com baixar; sem botão de apagar/mexer. Excluída marcada continua valendo (sem arquivos, pois morreram junto).
- Aviso abaixo do campo cita anexos: o que manda (texto e arquivo) pode ser lido pela equipe e ajuda a melhorar a IA.
- Celular primeiro, computador funcionando; claro/escuro; conversa sem anexo igual a hoje.

## 7. Privacidade, retenção e limpeza

- Anexo é sempre da casa da sessão; RLS + filtro em todo acesso; teste de isolamento A/B obrigatório (ler/baixar/apagar cruzado negado).
- Excluir conversa apaga arquivos + fichas na hora (mesma ação, falha fechada: sem marca se algo falhar).
- Faxina (pg_cron, junto da existente): apaga do cofre e da tabela o que passar de 12 meses. Upload com rollback não deixa órfão; se um resto aparecer, a próxima faxina remove pelo caminho sem ficha.
- Teste prova que nome/conteúdo de anexo não aparece em log, resposta de erro ou conversa de outra casa.
- Custo sob controle: teto por pergunta (5×10 MB), sem reprocessar histórico, acesso temporário em vez de cópia.

## 8. Testes obrigatórios

- RLS e isolamento: dono B não lê/baixa/apaga anexo de A; admin lê, não escreve; anônimo nada.
- Validação: tipo proibido, 6º arquivo, 10 MB + 1 byte, nome com caminho — todos recusados sem gastar limite nem chamar a IA.
- Fluxo: anexar 3 tipos, responder com análise, baixar o mesmo bytes; excluir mata arquivos+fichas; esquecer-tudo não mexe em anexo (só em ficha).
- Falhas: anexo que não sobe não apaga a pergunta; IA inalcançável devolve o uso.
- Regressão: chat sem anexo idêntico ao de hoje; limite, sessões, memória, cartilha e trilhos intactos (Fase 1 do sócio não quebra).
- `npx tsc --noEmit`, `npm run check`, `npm run test`, `npm run build`; visual 390 px + computador, claro/escuro, dono e admin.

## 9. Critérios de aceite

1. Dono anexa imagem/PDF/planilha (5×10 MB) e o mentor analisa junto do texto.
2. Fora da regra é recusado com frase, sem custo e sem rastro.
3. Nenhuma casa toca anexo de outra; nada de anexo em log.
4. Excluir apaga arquivos na hora; 60 dias sem arquivo; 12 meses aposenta o resto.
5. Uso do dia conta 1 por pergunta, com ou sem anexo.
6. Sem PDF de anexo: o dono baixa o arquivo original. (Os PDFs dos relatórios seguem iguais.)
7. Nenhuma migration, função, arquivo ou dado de produção alterado nesta etapa.

## 10. Fora do escopo

- Arrastar/soltar múltiplo avançado, pré-visualização de PDF na tela, edição de planilha no app.
- Compactar/redimensionar imagem no envio; OCR separado (o provedor lê a imagem).
- Vídeo, áudio, zip, executável.
- Publicar em produção (passo à parte, com autorização).
