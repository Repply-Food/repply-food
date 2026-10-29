# Relatórios dentro de Resultados — desenho

**Data:** 29/10/2026  
**Status:** aprovado por Lucas Ferreira

## Problema

O painel exibe **Resultados** e **Relatórios** como duas telas principais, embora ambas tratem da análise do desempenho da casa. A separação deixa o menu redundante e, no celular, ocupa espaço que não representa uma área diferente do produto.

## Decisão aprovada

- O menu principal passa a ter três itens: **Hoje**, **Resultados** e **Ajustes**.
- A página **Resultados** mantém os quatro assuntos atuais — Vendas, Horários, Equipe e Descontos — e recebe abaixo deles uma seção chamada **Relatórios da SCC**.
- A nova seção reutiliza os seis cartões existentes: Produtos, Comissão, Caixa, Auditoria, Notas assinadas e Financeiro.
- Os relatórios continuam abrindo nas rotas detalhadas atuais, com os mesmos filtros e PDFs.
- Enquanto uma rota `/r/[slug]/relatorios/[relatorio]` estiver aberta, **Resultados** permanece marcado como item atual do menu.
- A antiga rota de catálogo `/r/[slug]/relatorios` redireciona para `/r/[slug]/resultados`, preservando links e favoritos sem manter conteúdo duplicado.
- Os seis relatórios não viram novas abas de Resultados.

## Comportamento por superfície

### Celular

O menu inferior usa três colunas de largura igual. Os cartões aparecem em uma coluna, depois das análises atuais.

### Computador

A barra lateral mostra três destinos. Os cartões continuam usando a grade responsiva existente, com até três colunas.

### Dono e administrador

O comportamento é o mesmo para o dono e para o administrador em modo de leitura. As verificações de acesso existentes não mudam.

### Estado vazio

A seção com os seis atalhos sempre aparece. Cada relatório continua responsável por informar que a SCC ainda não enviou dados para o período quando não houver carga.

## Fora do escopo

- Alterar filtros, tabelas, PDFs ou cálculos dos relatórios.
- Importar dados da SCC.
- Renomear ou mudar as rotas detalhadas.
- Alterar as quatro abas atuais de Resultados.

## Critérios de aceite

1. Não existe item **Relatórios** no menu lateral nem no inferior.
2. O menu tem três links e se adapta corretamente às duas larguras.
3. **Resultados** contém o título **Relatórios da SCC** e os seis cartões existentes.
4. As seis rotas detalhadas continuam funcionando.
5. Em qualquer rota detalhada de relatório, somente **Resultados** recebe `aria-current="page"`.
6. A rota antiga do catálogo confere o acesso à casa e redireciona para Resultados.
7. Testes, tipos, análise do Biome e build passam.
8. A tela é conferida em celular e computador, nos temas claro e escuro e no estado sem dados.
