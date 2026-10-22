// @vitest-environment jsdom
//
// A mesma trava dos formulários de entrada (CLAUDE.md §10): se o admin apertar
// Enter antes de a página carregar o JavaScript, o navegador faz o envio
// nativo. Com `method="post"` nada vai para o endereço, e com o botão desligado
// o Enter nem envia.
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/admin/actions", () => ({
  cadastrarRestauranteAction: vi.fn(),
  editarRestauranteAction: vi.fn(),
  pedirReenvioAction: vi.fn(),
  gerarTokenAction: vi.fn(),
  revogarTokensAction: vi.fn(),
}));

import { CartaoReenvio } from "@/components/admin/cartoes/cartao-reenvio";
import { CartaoToken } from "@/components/admin/cartoes/cartao-token";
import { Confirmacao } from "@/components/admin/confirmacao";
import { FormularioEmail } from "@/components/admin/formulario-email";
import { FormularioRestaurante } from "@/components/admin/formulario-restaurante";
import { VALORES_INICIAIS } from "@/lib/admin/schemas";
import type { DetalheDoRestaurante } from "@/lib/admin/tipos";

const DETALHE: DetalheDoRestaurante = {
  agoraIso: "2026-10-15T00:40:00Z",
  restaurante: {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "bar-do-ze",
    nome: "Bar do Zé",
    cnpj: null,
    fuso: "America/Fortaleza",
    horaVirada: "05:00",
    horario: [],
    situacao: "ativo",
    pedidoReenvioDesde: null,
    intervaloEnvioSegundos: 300,
    demonstracao: false,
  },
  sinal: { estado: null, ultimoEnvioOkEm: null },
  tokens: [],
  logins: [],
  envios: [],
  historico: [],
};

const casos: { nome: string; tela: () => ReactElement; botao: string }[] = [
  {
    nome: "cadastro do restaurante",
    tela: () => (
      <FormularioRestaurante
        modo="cadastro"
        valoresIniciais={VALORES_INICIAIS}
      />
    ),
    botao: "Cadastrar restaurante",
  },
  {
    nome: "edição do restaurante",
    tela: () => (
      <FormularioRestaurante
        modo="edicao"
        restauranteId="r1"
        valoresIniciais={VALORES_INICIAIS}
      />
    ),
    botao: "Salvar",
  },
  {
    nome: "e-mail do cliente",
    tela: () => (
      <FormularioEmail
        rotulo="E-mail do cliente"
        botao="Criar login"
        aoEnviar={async () => null}
      />
    ),
    botao: "Criar login",
  },
  {
    nome: "confirmação",
    tela: () => (
      <Confirmacao
        texto="Tem certeza?"
        rotuloConfirmar="Suspender"
        enviando={false}
        aoConfirmar={() => undefined}
        aoCancelar={() => undefined}
      />
    ),
    botao: "Suspender",
  },
  {
    nome: "geração do primeiro token",
    tela: () => <CartaoToken detalhe={DETALHE} />,
    botao: "Gerar token",
  },
  {
    nome: "pedido de reenvio",
    tela: () => <CartaoReenvio detalhe={DETALHE} />,
    botao: "Pedir reenvio",
  },
];

function htmlDoServidor(tela: ReactElement): Document {
  return new DOMParser().parseFromString(renderToString(tela), "text/html");
}

describe.each(casos)(
  "formulário de $nome, antes de a página carregar",
  ({ tela, botao }) => {
    it('sai do servidor com method="post"', () => {
      const form = htmlDoServidor(tela()).querySelector("form");
      expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
    });

    it("sai do servidor com o botão de enviar desligado", () => {
      const enviar = [
        ...htmlDoServidor(tela()).querySelectorAll("button[type=submit]"),
      ].find((b) => b.textContent?.trim() === botao);
      expect(enviar).toBeDefined();
      expect(enviar?.hasAttribute("disabled")).toBe(true);
    });
  }
);
