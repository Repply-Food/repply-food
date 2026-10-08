# repply food. · Pacote de logomarcas

Identidade visual do **repply food.**, a marca de mercado da Repply para bares e restaurantes. São arquivos SVG e PNG prontos para o sistema, o site, as redes sociais e o material impresso. Para ver tudo de uma vez, abra o `preview.html`.

## Regra que não se quebra

**O tomate só aparece no símbolo, junto do "r".** No nome escrito por extenso vai o **ponto da casa**, como em "repply crm." e "repply hub.":

- **Certo:** símbolo com o tomate; "repply food." com o ponto laranja.
- **Errado:** "repply food" seguido de um tomate; um tomate sozinho, sem o "r"; o tomate recolorido.

## Estrutura

```
repply food/
├── simbolo/   ← o quadrado com o "r" e o tomate (ícone, avatar)
├── logo/      ← símbolo + nome, horizontal
├── texto/     ← só "repply food." (sem o símbolo)
├── app/       ← ícones do sistema: favicon, iPhone, Android (PWA)
├── svg/       ← todos os desenhos em vetor
└── preview.html

(no repositório, os scripts que geram este pacote ficam em ../gerador/)
```

## Qual arquivo usar

### simbolo/

| Arquivo | Quando usar |
|---|---|
| **repply-food-simbolo** (principal, laranja) | Ícone do app, avatar de rede social, favicon. **Use este na grande maioria dos casos.** |
| **simbolo-preto** (secundária) | Sobre fundo laranja ou colorido, onde o principal se perde. |
| **simbolo-branco** (secundária) | Quando a plataforma exige ícone claro. Tem uma borda cinza fina para não sumir sobre o branco. |
| **simbolo-solto-preto** | Sem o quadrado, sobre fundo claro (PNG transparente). |
| **simbolo-solto-branco** | Sem o quadrado, sobre fundo escuro (PNG transparente). |
| **simbolo-mono-preto / mono-branco** | Quando só uma cor é permitida: impressão simples, carimbo, gravação. |

**Tamanhos:** o principal vai de 16 a 1024 px; as variações, de 128 a 1024 px. O desenho completo aguenta até **24 px**. Nos arquivos de **16 e 20 px** o tomate já vem simplificado em bolinha vermelha com contorno. Não reduza o arquivo de 1024 para 16 por conta própria: use o de 16.

### logo/ (símbolo + nome)

| Arquivo | Quando usar |
|---|---|
| **logo-fundo-claro** | Padrão: site, apresentações, documentos. |
| **logo-fundo-escuro** | Sobre fundo preto ou escuro. |
| **logo-fundo-laranja** | Sobre o laranja da marca: símbolo preto, "food" e ponto pretos. |
| **logo-mono-preto / mono-branco** | Uma cor só. |

As larguras são 512, 1024 e 2048 px, todas com fundo transparente.

### texto/ (só o nome)

Use quando o símbolo já aparece por perto, ou quando o espaço é baixo e comprido (rodapé, assinatura de e-mail). Tem versões para fundo claro e escuro.

### app/ (ícones do sistema)

| Arquivo | Onde vai |
|---|---|
| `favicon.ico` (16, 32 e 48 px dentro) e `favicon.svg` | Aba do navegador |
| `apple-touch-icon.png` (180 px, **sem cantos**) | iPhone, em "Adicionar à Tela de Início". O iOS arredonda sozinho. |
| `icon-192.png`, `icon-512.png` | Ícone do app instalado (manifesto do PWA, `purpose: "any"`) |
| `icon-maskable-192.png`, `icon-maskable-512.png` (**sem cantos**) | Android: o aparelho recorta no formato dele (círculo, gota). O desenho cabe inteiro na área segura. |

Trecho do manifesto do PWA:

```json
"icons": [
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## Cores

| Nome | HEX | Uso |
|---|---|---|
| Repply Orange | `#FF5A1F` | Cor da marca: o quadrado do símbolo, a palavra "food", o ponto |
| Deep Black | `#0A0A0A` | "repply" sobre fundo claro, versões pretas |
| Pure White | `#FFFFFF` | o "r", o contorno do tomate |
| Vermelho-tomate | `#E8371F` | **só** o corpo do tomate |
| Verde-folha | `#2F9E44` | **só** as folhas do tomate |

O vermelho e o verde existem apenas para o tomate. Não use os dois na interface nem em títulos.

## Tipografia e construção

- **Fonte:** General Sans Semibold (600), da Fontshare (gratuita). O "r" e o nome foram convertidos em desenho vetorial, então os arquivos não dependem da fonte instalada.
- **Proporções do logo:** copiadas do repply crm (medidas no arquivo oficial):
  - a altura das letras é 41,5% da altura do símbolo;
  - o vão entre o símbolo e o nome é 32% dessa altura;
  - o espaçamento entre letras é apertado (−0,05 em);
  - o ponto final tem 14% da altura, na cor da palavra "food".
- **Origem do tomate:** desenho gerado no ChatGPT a partir da direção escolhida e depois traçado em vetor, com as cores corrigidas para a paleta. O original está em `../origem/chatgpt-simbolo-original.webp`.
- **Área de proteção:** a altura do símbolo, em volta do logo inteiro. Nada entra nesse espaço.

## Como gerar o pacote de novo

Precisa de Node.js. Na pasta `../gerador/`:

```bash
npm install
npm run gerar        # recria esta pasta (simbolo/, logo/, texto/, app/, svg/)
npm run brandbook    # recria ../brandbook.html
```

Os desenhos saem de `simbolo.js` (o "r", tirado da fonte em `../fontes/`, e o tomate traçado) e de `versoes.js` (as versões). O `npm run tracar` só precisa rodar de novo se o desenho do tomate mudar.

---

*repply food. · Repply · Grupo MD · outubro de 2026*
