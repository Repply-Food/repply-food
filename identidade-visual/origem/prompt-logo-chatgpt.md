# Prompt para gerar o símbolo do repply food. no ChatGPT

*08/10/2026 · direção escolhida: opção A (decisão D-41 do banco de perguntas).*

## Antes de colar o prompt, anexe 2 imagens no ChatGPT

1. **O símbolo do repply crm**, que é a referência do quadrado e do "r":
   `D:\lucas\Documents\2- REPPLY HUB\Playbooks e Identidade visual\Identidade visual\logos e instruções\repply crm\repply-crm-simbolo-1024.png`
2. **O rascunho da opção A**, que é a referência da composição:
   `D:\lucas\Documents\2- REPPLY HUB\Projetos\Repply Food\_descoberta\referencia-simbolo-a-rascunho.png`

## Prompt (copie a partir daqui)

```
Crie o ícone de aplicativo (símbolo) da marca "repply food", um sistema de relatórios para donos de bares e restaurantes. Ele faz parte de uma família de marcas que já existe.

Use as duas imagens anexas como referência:
- Imagem 1: o símbolo da marca-irmã "repply crm". Mantenha EXATAMENTE o mesmo quadrado de cantos arredondados, a mesma cor laranja, o mesmo "r" branco (mesmo peso, tamanho e posição) e a mesma proporção geral.
- Imagem 2: um rascunho da composição que eu quero. Refine o desenho do tomate e o equilíbrio do conjunto, sem mudar a ideia.

Especificações do símbolo:
1. Formato: imagem quadrada 1024 × 1024 px. O ícone ocupa a imagem toda, e os cantos fora do arredondado ficam transparentes (ou brancos).
2. Fundo do ícone: quadrado com cantos bem arredondados (raio de cerca de 23% do lado, estilo ícone de iPhone), cor sólida laranja #FF5A1F. Sem gradiente, sem sombra, sem brilho.
3. Letra: um "r" minúsculo, branco #FFFFFF, fonte geométrica sem serifa em peso semibold (estilo General Sans Semibold), igual ao "r" da imagem 1.
4. Assinatura da marca: no lugar onde a imagem 1 tem uma bolinha preta (o "ponto final" à direita da base do "r"), coloque um TOMATE pequeno:
   - corpo redondo, levemente mais largo do que alto, vermelho-tomate #E8371F, cor chapada;
   - em cima, uma coroa de 5 sépalas finas e pontudas em verde-folha #2F9E44, abertas em formato de estrela, com um cabinho curto no centro. A coroa é o que faz ser reconhecido como tomate (sem ela parece cereja ou maçã);
   - tamanho: o corpo do tomate tem cerca de 17% da largura do ícone, e a base dele fica alinhada com a base do "r".
5. Em volta do tomate, um anel branco sólido, de espessura uniforme (cerca de 2,5% da largura do ícone), que separa o tomate do fundo laranja. O anel acompanha o contorno do tomate (círculo), não o da coroa.
6. Estilo: flat, vetorial, minimalista, formas geométricas limpas, bordas nítidas, no mesmo nível de simplicidade da imagem 1. Precisa continuar reconhecível em tamanho muito pequeno (48 px).

Não inclua: nenhum outro texto ou letra além do "r"; gradientes; sombras; reflexos; efeito 3D; textura; contorno preto; fundo de cena; mockup de celular; gotas de água no tomate.

Depois de gerar a versão principal, gere mais 2 variações para eu comparar:
- Variação 1: a coroa do tomate um pouco maior e mais aberta, e o anel branco mais fino.
- Variação 2: o tomate um pouco maior (cerca de 20% da largura do ícone), com a coroa mais compacta.
```

## Se o resultado sair errado, corrija com estes pedidos

- O "r" mudou de formato ou de posição:
  > "Mantenha o 'r' idêntico ao da imagem 1, mesmo peso, tamanho e posição."
- Apareceu texto, sombra ou gradiente:
  > "Remova [o texto / a sombra / o gradiente]. Quero cores chapadas, sem efeitos."
- O tomate ficou parecendo cereja ou maçã:
  > "A coroa precisa ter 5 sépalas pontudas em estrela, cobrindo o topo do tomate, como um tomate visto de lado."
- As cores saíram diferentes:
  > "Use exatamente laranja #FF5A1F no fundo, vermelho #E8371F no tomate e verde #2F9E44 na coroa."

## O que acontece depois

O ChatGPT entrega uma **imagem**, não um arquivo vetorial, e costuma variar levemente as cores. Por isso o resultado escolhido serve de **referência de desenho**. A partir dele, a Repply:

1. **Redesenha o símbolo em vetor (SVG)**, com o "r" tirado da fonte oficial e as cores exatas.
2. **Gera o pacote de arquivos no mesmo padrão do repply crm:**
   - símbolo de 16 a 1024 px (com a versão simplificada de 16 px);
   - logo completo para fundo claro e escuro;
   - só o texto;
   - favicon e ícones do app.
3. **Monta o logo com o nome** ("repply food" + tomate no lugar do ponto) **direto em vetor**, com a fonte oficial. Não vale pedir isso ao ChatGPT: geradores de imagem ainda erram letras e espaçamento.
