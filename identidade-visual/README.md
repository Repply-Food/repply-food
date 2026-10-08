# Identidade visual do repply food.

*Tudo da marca em um lugar só, versionado junto com o produto. **Esta pasta é a fonte da verdade da marca repply food.** (D-48). A pasta da Repply (`Playbooks e Identidade visual/Identidade visual/`) guarda uma cópia para a biblioteca de marcas da casa. Mudou aqui? Atualize a cópia de lá.*

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| [`brandbook.html`](brandbook.html) | O brandbook: manifesto, posicionamento, persona, personalidade, logo, símbolo, variações, paleta, tipografia, tom de voz, grafismo e aplicações. Abra no navegador |
| [`logos/`](logos/) | O pacote de logomarcas: 82 arquivos em SVG e PNG, mais os ícones do app. Veja [`logos/README.md`](logos/README.md) e abra [`logos/preview.html`](logos/preview.html) |
| [`logos/app/`](logos/app/) | **Os ícones que o sistema usa:**<br>• favicon (`.ico` e `.svg`);<br>• `apple-touch-icon.png`;<br>• `icon-192`/`icon-512`;<br>• versões *maskable*.<br>Vão para `public/` na implementação |
| [`fontes/`](fontes/) | As fontes da marca, nos pesos que o produto usa (ver abaixo) |
| [`origem/`](origem/) | De onde o símbolo veio: o prompt usado no ChatGPT, o rascunho de referência e a imagem original gerada |
| [`gerador/`](gerador/) | Os scripts que geram `logos/` e `brandbook.html`. Regeneram tudo byte a byte |

## As regras que não se quebram

1. **O tomate só aparece no símbolo, junto do "r"** (D-42). No nome escrito vai o ponto da casa: **"repply food."**. Nunca um tomate depois do nome nem um tomate solto.
2. **O símbolo principal é o laranja** (D-43). O preto e o branco são secundários, para fundos em que o laranja some ou plataformas que pedem ícone claro.
3. **Em 16 e 20 px use os arquivos prontos**, que vêm com o tomate simplificado em bolinha. Não reduza o de 1024.
4. **Vermelho-tomate `#E8371F` e verde-folha `#2F9E44` existem só no tomate.** Na interface, a cor da marca é o laranja `#FF5A1F`. Verde, vermelho e amarelo de dado (`#1E9E5A`, `#D64545`, `#E8A33D`) só aparecem para dizer algo sobre um número.
5. **Texto sobre botão laranja é quase-preto, nunca branco**: branco dá 3,12 : 1 e reprova. As regras de contraste medidas estão no `CLAUDE.md` §8.

## Fontes

| Família | Uso | Arquivos | Licença |
|---|---|---|---|
| General Sans | Títulos, logo, números de destaque | Regular, Medium, Semibold, Bold (`.otf`) | Fontshare, ITF Free Font License: uso gratuito, inclusive comercial e em apps |
| Satoshi | Texto e interface | Regular, Medium, Bold (`.otf`) | Fontshare, ITF Free Font License |
| JetBrains Mono | Números e dados (`tabular-nums`) | Variável (`.ttf`) | SIL Open Font License ([`OFL.txt`](fontes/jetbrains-mono/OFL.txt)) |

No app, as fontes entram por `next/font/local`, como no Repply Imob. A Satoshi não tem peso 600; use 500 ou 700.

## Como regenerar

```bash
cd identidade-visual/gerador
npm install
npm run gerar        # logos/
npm run brandbook    # brandbook.html
```

O `node_modules/` do gerador fica fora do git (`.gitignore` da raiz).
