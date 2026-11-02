# Webhook único e tipado da SCC — desenho

**Data:** 01/11/2026

**Status:** aprovado por Lucas Ferreira

**Decisão:** D-71

**Substitui:** a separação de recepção definida em `2026-10-28-seis-relatorios-design.md` §1, item 6

## 1. Objetivo

A SCC deve integrar-se ao Food por uma única URL e um único token por restaurante. Cada requisição declara o tipo de informação transportada; não existe um JSON gigante nem um segundo endpoint para relatórios.

O Food recebe dados tipados, guarda-os com isolamento por restaurante e forma os seis relatórios no PostgreSQL. Valores que dependem de regra oficial da SCC, especialmente comissão e financeiro, chegam identificados como oficiais; o Food não reproduz fórmulas desconhecidas.

Esta etapa entrega o fluxo completo no ambiente local, incluindo uma coleção do Insomnia com dados fictícios. Publicação de função, migrations ou dados em produção fica fora do escopo e exige nova autorização.

## 2. Decisões vinculantes

1. O único endpoint da SCC é `POST /functions/v1/receber-envio`.
2. O restaurante é identificado exclusivamente pelo token Bearer. Nenhum ID, slug ou nome de restaurante vindo do JSON escolhe a casa.
3. O contrato oficial é `versao_formato: 2`; o envelope v1 sem `tipo_envio` deixa de ser aceito porque nenhuma instalação real o utiliza.
4. Cada requisição transporta exatamente um `tipo_envio`.
5. Cadastros usam atualização incremental. Movimentos usam fotografia completa por dia de movimento e origem.
6. Fotografias podem ter páginas e são publicadas automaticamente quando todas chegam. Não existe requisição separada de publicação.
7. On-line e histórico permanecem fontes distintas. O histórico não é cópia automática do on-line.
8. Comissão e financeiro recebem valores oficiais da SCC. Ausência continua sendo `null`, nunca zero estimado.
9. O endpoint `receber-relatorios`, que nunca foi publicado, será removido do código e da configuração depois que o fluxo unificado estiver verde.
10. Migrations antigas já aplicadas não são editadas nem apagadas. Estruturas legadas vazias podem permanecer no banco durante a transição.
11. O smoke test usa somente Supabase local, casa fictícia, token local e dados fictícios.

## 3. Transporte comum

### 3.1 Endereço e cabeçalhos

```http
POST /functions/v1/receber-envio
Authorization: Bearer <token-da-casa>
Content-Type: application/json; charset=utf-8
```

- HTTPS e validação de TLS continuam obrigatórios fora do ambiente local.
- O token não entra no corpo, em logs, na coleção versionada nem em argumentos de linha de comando.
- O mesmo cliente HTTP da SCC envia todos os tipos.
- A função autentica antes de observar ou gravar qualquer informação do restaurante.

### 3.2 Envelope v2

Todos os tipos compartilham:

```ts
type TipoEnvio =
  | 'entradas'
  | 'cadastro_produtos'
  | 'itens_vendidos'
  | 'comissoes'
  | 'movimentos_caixa'
  | 'eventos_auditoria'
  | 'notas_assinadas'
  | 'financeiro';

type Recurso =
  | 'pdv'
  | 'grupo'
  | 'garcom'
  | 'mesa'
  | 'operador'
  | 'tipo'
  | 'categoria'
  | 'cliente';

type Base = {
  versao_formato: 2;
  tipo_envio: TipoEnvio;
  versao_scc: string;
  enviado_em: string; // ISO 8601 com offset ou Z
  id_envio: string; // UUID, estável em retentativas
  sequencia: string; // inteiro positivo de 64 bits em texto
  natureza: 'scc' | 'simulacao';
};
```

`natureza: simulacao` só é aceita quando `RF_PERMITIR_SIMULACAO=1` no ambiente local da função. Produção não recebe essa variável.

### 3.3 Cadastros incrementais

```ts
type EnvelopeIncremental<T> = Base & {
  modo: 'incremental';
  pagina: { numero: number; total: number };
  total_registros: number;
  dados: T[];
};
```

O escopo da sequência é restaurante + `tipo_envio`. A SCC envia somente inclusões e alterações conhecidas desde a sequência anterior. Desativação é explícita no registro; ausência em um lote incremental não remove nada.

### 3.4 Fotografias de movimentos

```ts
type EnvelopeFotografia<T> = Base & {
  modo: 'fotografia';
  dia_movimento: string; // AAAA-MM-DD, dia oficial da SCC
  fonte: 'online' | 'historico';
  recursos: Recurso[];
  pagina: { numero: number; total: number };
  total_registros: number;
  dados: T[];
};
```

O escopo da sequência é restaurante + tipo + dia de movimento + fonte. Uma fotografia contém todas as linhas daquele escopo. Ausência de envio não significa zero; fotografia completa com `total_registros: 0` confirma movimento vazio.

`entradas` preserva a semântica de reconciliação por janela porque inclui contas abertas e correções de dias anteriores:

```ts
type EnvelopeEntradas<T> = Base & {
  tipo_envio: 'entradas';
  modo: 'janela';
  janela: { desde: string; ate: string };
  pagina: { numero: number; total: number };
  total_registros: number;
  dados: T[];
};
```

## 4. Tipos de dados

### 4.1 Entradas

Mantém os campos já confirmados para conta/mesa, renomeando a coleção de `entradas` para `dados`:

- código da entrada;
- datas e horas de entrada e saída;
- valores de itens, descontos, acréscimos, taxa, complemento e consumido;
- pago;
- códigos de mesa/cartão, garçom, operadores e cliente;
- ocupantes, tipo de ocupação e tipo de cartão;
- extras conhecidos da D-51.

Nome, RG, telefone e sexo de cliente continuam descartados antes da validação e da persistência.

### 4.2 Cadastro de produtos

```ts
type CadastroProduto = {
  codigo_produto: Codigo;
  produto: string;
  codigo_grupo: Codigo | null;
  grupo: string | null;
  preco_custo_atual: Decimal | null;
  ativo: boolean;
  alterado_em: string; // ISO 8601 com offset ou Z
};
```

- Chave: restaurante + `codigo_produto`.
- Código não muda; correção de nome, grupo ou custo é `upsert`.
- Produto desativado chega com `ativo: false`; não é apagado.
- Esse cadastro não prova venda e não alimenta sozinho o relatório Produtos.

### 4.3 Itens vendidos

```ts
type ItemVendido = {
  codigo_entrada: Codigo;
  ordinal: number;
  codigo_produto: Codigo;
  produto: string;
  codigo_pdv: Codigo | null;
  pdv: string | null;
  codigo_grupo: Codigo | null;
  grupo: string | null;
  codigo_garcom: Codigo | null;
  garcom: string | null;
  mesa: number | null;
  quantidade: Decimal;
  vendas: Decimal;
  custos: Decimal | null;
};
```

`ordinal` distingue ocorrências repetidas da mesma entrada. Nome, grupo, PDV, garçom, vendas e custo são a fotografia histórica: mudanças futuras no cadastro não reescrevem um relatório antigo. Cancelamentos e estornos são refletidos pela fotografia completa corrigida, não por exclusão física.

O relatório Produtos agrega esses itens por dimensões e usa o cadastro apenas como referência atual. Não inclui produto nunca vendido nos totais.

### 4.4 Comissões

```ts
type Comissao = {
  codigo_operador: Codigo;
  operador: string | null;
  funcao: string | null;
  vendas_elegiveis: Decimal;
  comissao_oficial: Decimal | null;
};
```

Uma linha por operador e dia. A SCC é a fonte oficial da elegibilidade e da comissão. O Food soma e filtra sem derivar comissão da taxa de serviço.

### 4.5 Movimentos de caixa

```ts
type MovimentoCaixa = {
  codigo_lancamento: Codigo;
  momento: string;
  codigo_operador: Codigo | null;
  operador: string | null;
  tipo: 'credito' | 'debito';
  codigo_categoria: Codigo;
  categoria: string;
  valor: Decimal; // magnitude não negativa
};
```

Direção fica em `tipo`; o Food não interpreta valor negativo silenciosamente.

### 4.6 Eventos de auditoria

```ts
type TipoAuditoria =
  | 'cancelamento_produto'
  | 'perda_cartao'
  | 'alteracao_limites'
  | 'exclusao_taxa_servico'
  | 'transferencia_produtos';
```

Cada evento transporta tipo, momento, operador, cartões anterior/novo, produto, quantidade, valor unitário, total e limites anterior/novo, usando `null` quando o campo não se aplica. Não transporta motivo livre nem dado pessoal.

### 4.7 Notas assinadas

```ts
type NotaAssinada = {
  codigo_nota: Codigo;
  codigo_entrada: Codigo;
  codigo_cliente: Codigo;
  valor: Decimal;
};
```

Não transporta nome do cliente. Nota não vira afirmação de dívida atual ou vencimento.

### 4.8 Financeiro

```ts
type Financeiro = {
  componentes: {
    consumo: Decimal | null;
    servico: Decimal | null;
    complemento: Decimal | null;
    taxas_entrada: Decimal | null;
    produto_embutido: Decimal | null;
    flyers: Decimal | null;
  };
  totais_oficiais: {
    projetado: Decimal | null;
    recebido: Decimal | null;
    notas_assinadas: Decimal | null;
    descontos: Decimal | null;
  };
  entradas: {
    habilitados: number | null;
    reabilitados: number | null;
    encerrados: number | null;
    abertos: number | null;
  };
  meios: Array<{
    codigo: Codigo;
    rotulo: string;
    classe: 'dinheiro' | 'credito' | 'debito' | 'pix' | 'nota_assinada' | 'desconto' | 'outro';
    valor: Decimal;
  }>;
  publico: Array<{
    sexo: 'masculino' | 'feminino' | 'nao_informado';
    categoria: 'pagante' | 'convidado' | 'lista' | 'camarote' | 'vip' | 'servico' | 'outro';
    quantidade: number;
  }>;
};
```

Zero ou uma linha financeira por fotografia. Os valores são oficiais da SCC; o Food não afirma equação desconhecida entre os blocos. Público é somente contagem agregada.

### 4.9 Tipos escalares

```ts
type Codigo = string;  // 1..80, letras/dígitos/_/./-, preserva zeros à esquerda
type Decimal = string; // ^-?\d{1,14}(\.\d{1,6})?$
```

Dinheiro não usa `number` no transporte ou na soma do Food.

### 4.10 Limites do transporte

- Corpo por página: até 1 MiB, medido durante a leitura.
- Registros por página: até 500.
- Páginas por carga: até 200.
- Registros declarados por carga: até 100.000.
- Conteúdo acumulado por carga: até 32 MiB.
- Cargas incompletas simultâneas: até dez por restaurante.
- Rótulos de produto, grupo, PDV, operador, categoria e meio: 1..120 caracteres; função: até 80.
- `meios` do Financeiro: até 100; `publico`: até 21 células únicas.
- Requisições por token: até 120 por minuto, contadas no banco.
- Um novo ciclo de `entradas` só pode ser publicado 20 segundos depois do anterior. Páginas e retentativas do mesmo `id_envio` não reiniciam esse relógio.
- Tipos diferentes e fotografias de escopos diferentes podem ser enviados em sequência; não compartilham o bloqueio de 20 segundos de `entradas`.

Esses limites permitem o smoke completo e a carga inicial sem obrigar oito esperas artificiais. O controle fica no banco, não em memória da função.

## 5. Recepção, páginas e publicação

1. Conferir método, tamanho e token.
2. Validar envelope comum e schema discriminado pelo `tipo_envio`.
3. Recusar campos desconhecidos; nunca persistir corpo inválido.
4. Criar ou localizar a carga por restaurante + `id_envio`.
5. Conferir que envelope e páginas repetidas são idênticos por igualdade JSON normalizada no banco.
6. Guardar página em staging privado.
7. Enquanto faltar página, responder `estado: recebendo` sem alterar dados visíveis.
8. Ao completar 1..N e `total_registros`, publicar dentro de uma transação.
9. Recusar sequência obsoleta.
10. Para fotografia, substituir apenas o mesmo restaurante + tipo + dia + fonte.
11. Para cadastro, aplicar os `upserts` da carga e manter ausentes intactos.
12. Incrementar uma revisão da casa e devolver recibo estável.

Página única publica na própria requisição. Não existe ação `publicar`.

## 6. Respostas e retentativas

```text
200 {ok:true, estado:'recebendo'|'publicada', tipo_envio, id_envio,
     pagina, repetida, sequencia, dia_movimento?, fonte?, revisao?}
400 JSON inválido
401 token ausente, revogado, expirado ou desconhecido
405 método diferente de POST
409 envelope divergente, página conflitante ou sequência obsoleta
413 corpo, página, quantidade de páginas ou bytes acumulados acima do limite
422 schema inválido, contagem divergente ou fotografia inconsistente
429 ritmo/quantidade de cargas incompletas acima do limite
500 falha interna, sem SQL, token ou valores de cliente na resposta/log
```

- Mesmo `id_envio` + mesmo conteúdo retorna o recibo anterior e não duplica.
- Mesmo `id_envio` + conteúdo diferente recebe 409.
- Falha em um tipo não bloqueia nem desfaz outro tipo.
- Somente `estado: publicada` autoriza a SCC a avançar o cursor daquele escopo.
- O sinal de vida principal é atualizado por `entradas` publicadas; demais tipos registram atividade da integração, mas não mascaram a parada do envio de contas.

## 7. Persistência e consultas

Novas migrations acrescentam tabelas tipadas com `restaurante_id`, RLS e grants fechados. O `restaurante_id` é sempre introduzido pela função autenticada.

Unidades de persistência:

- cargas e páginas privadas do webhook v2;
- cadastro atual de produtos, sem exclusão física;
- fotografias publicadas de itens, comissões, caixa, auditoria, notas e financeiro;
- revisão por casa para detectar alteração durante paginação/PDF.

Publicação é atômica. A versão anterior continua visível até a nova estar completa. Correção com sequência maior substitui logicamente a fotografia, preservando metadados de recebimento necessários à auditoria e idempotência.

As funções de consulta dos seis relatórios passam a ler essas tabelas tipadas. Tela e PDF usam a mesma leitura. Produtos agregam itens vendidos e preservam as dimensões históricas; os demais seguem os valores tipados recebidos. Ausência de fotografia continua distinta de fotografia vazia.

As tabelas legadas `relatorio_*` permanecem sem novas escritas durante a transição. Não há `DROP`, edição de migration antiga nem limpeza de produção nesta etapa.

## 8. Segurança e privacidade

- Token identifica a casa; identificador vindo do JSON nunca é aceito.
- Toda tabela de domínio tem `restaurante_id` e RLS no mesmo arquivo de criação.
- Função/RPC nova nasce sem `PUBLIC EXECUTE`; grants são explícitos.
- `FORCE ROW LEVEL SECURITY` continua proibido.
- Escrita técnica confere linhas afetadas; zero linhas não é sucesso.
- Nome, RG, telefone, sexo individual, endereço e texto livre de cliente não são recebidos.
- Nomes profissionais de operador, produto, grupo, categoria e PDV têm finalidade explícita e limites de tamanho.
- Logs contêm código/etapa/nomes seguros de campos, nunca token, corpo bruto ou valores do restaurante.
- Limites de corpo são aplicados durante a leitura, antes de materializar carga excessiva em memória.
- Produção nunca aceita `natureza: simulacao`.

## 9. Migração de código e documentação

- `receber-envio` passa a despachar exclusivamente o envelope v2.
- O gerador fictício e os testes deixam de produzir envelope v1.
- O contrato SCC é reescrito para v2 e inclui exemplos dos oito tipos.
- `receber-relatorios`, sua configuração e o importador específico são removidos depois que os testes equivalentes existirem no receptor único.
- As rotas de tela `/relatorios/...` permanecem; só a rota de ingestão desaparece.
- Os seis relatórios continuam dentro de Resultados.
- Produção permanece no código atualmente publicado até nova autorização de migration e função.

## 10. Kit de smoke test do Insomnia

O repositório terá uma coleção importável e um roteiro. Variáveis:

```text
base_url = http://127.0.0.1:54321/functions/v1/receber-envio
token = valor preenchido apenas no ambiente local do Insomnia
```

Nenhum token entra no arquivo versionado. O kit cria/usa uma casa exclusivamente local e dados fictícios coerentes.

Ordem do fluxo de sucesso:

1. entradas;
2. cadastro de produtos;
3. itens vendidos on-line;
4. comissões;
5. movimentos de caixa;
6. eventos de auditoria;
7. notas assinadas;
8. financeiro;
9. fotografias históricas finais dos movimentos;
10. reenvio idempotente;
11. correção com sequência maior.

Cenários negativos separados:

- token inválido → 401;
- mesmo ID com conteúdo divergente → 409;
- sequência antiga → 409;
- campo desconhecido/schema inválido → 422;
- página faltante → continua privada.

Os valores fictícios usam as mesmas entradas, produtos, operadores, mesas e datas. O roteiro contém resultados literais esperados em Hoje, Resultados, nos seis relatórios e PDFs. A conferência é feita em celular e computador, claro e escuro, dono e admin em modo leitura.

## 11. Testes obrigatórios

- schemas literais dos oito tipos e rejeição de união incorreta;
- autenticação, token revogado/expirado e isolamento entre duas casas;
- idempotência, conflito, sequência, páginas fora de ordem e publicação automática;
- incremental de produtos, desativação e sequência antiga;
- fotografia on-line, histórica, vazia e corrigida;
- nenhum dado parcial visível;
- sinal de vida atualizado somente pelo tipo correto;
- cálculos e filtros dos seis relatórios contra PostgreSQL local;
- tela e PDF lendo a mesma revisão;
- limites de corpo/página/carga;
- coleção/fixtures do Insomnia validados pelos mesmos schemas;
- regressão de login, Hoje, Resultados, admin e recepção;
- `npx tsc --noEmit`, `npm run check`, `npm run test` e `npm run build`;
- revisão visual em 390 px e computador, temas claro/escuro e estado sem dados.

## 12. Critérios de aceite

1. Existe somente uma URL de recepção documentada e servida para a SCC.
2. O token escolhe a casa e o corpo não consegue substituí-la.
3. Os oito tipos são validados, persistidos e repetíveis sem duplicação.
4. Cadastro incremental não apaga produto ausente e aceita desativação explícita.
5. Fotografias incompletas não aparecem; completas substituem atomicamente o mesmo escopo.
6. On-line e histórico permanecem independentes.
7. Entradas alimentam Hoje e Resultados.
8. Os demais tipos formam os seis relatórios e PDFs com os resultados literais da massa fictícia.
9. Comissão e financeiro exibem valores oficiais ou “não informado”, nunca estimativas.
10. Uma casa não lê, altera ou infere dados de outra.
11. A coleção do Insomnia executa sucesso, retentativa, correção e erros localmente.
12. Nenhum endpoint, migration ou dado de produção é alterado durante esta implementação local.

## 13. Fora do escopo

- Publicar o contrato v2 na nuvem.
- Aplicar novas migrations em produção.
- Importar dados fictícios ou reais em produção.
- Criar comunicação da nuvem de volta para a SCC.
- Receber dados pessoais de clientes.
- Inventar fórmulas oficiais ausentes.
- Apagar imediatamente tabelas legadas já criadas.
