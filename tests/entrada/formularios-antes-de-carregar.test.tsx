// @vitest-environment jsdom
//
// Falha medida no navegador: o dono digitou e-mail e senha e apertou "Entrar"
// ANTES de a página carregar o JavaScript. O <form> não tinha `method`, então o
// navegador fez o envio nativo (GET) e a senha foi parar na URL: histórico,
// registro do servidor e cabeçalho Referer.
//
// Aqui simulamos a página antes de carregar com `renderToString` (HTML do
// servidor, sem efeitos) e conferimos as duas travas:
//   1. `method="post"`: se algo escapar, nenhum campo vai para o endereço;
//   2. botão de enviar desabilitado: pela especificação do HTML, Enter num
//      campo não envia o formulário quando o botão padrão está desabilitado.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { type Root, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/actions", () => ({
  entrarAction: vi.fn(),
  pedirNovaSenhaAction: vi.fn(),
  definirNovaSenhaAction: vi.fn(),
  trocarSenhaAction: vi.fn(),
}));

import { FormularioEntrar } from "@/app/(entrada)/entrar/formulario-entrar";
import { FormularioEsqueci } from "@/app/(entrada)/esqueci-a-senha/formulario-esqueci";
import { FormularioNovaSenha } from "@/app/(entrada)/nova-senha/formulario-nova-senha";
import { FormularioTrocarSenha } from "@/app/(entrada)/trocar-senha/formulario-trocar-senha";

afterEach(cleanup);

type Caso = {
  nome: string;
  tela: () => ReactElement;
  /** Texto do botão de enviar (não muda por causa desta correção). */
  botao: string;
};

const casos: Caso[] = [
  {
    nome: "entrar",
    tela: () => <FormularioEntrar next={null} />,
    botao: "Entrar",
  },
  {
    nome: "esqueci a senha",
    tela: () => <FormularioEsqueci />,
    botao: "Mandar o link",
  },
  {
    nome: "nova senha",
    tela: () => <FormularioNovaSenha />,
    botao: "Salvar e continuar",
  },
  {
    nome: "trocar senha (com senha atual)",
    tela: () => <FormularioTrocarSenha pedirSenhaAtual depois={null} />,
    botao: "Salvar e continuar",
  },
  {
    nome: "trocar senha (sem senha atual)",
    tela: () => <FormularioTrocarSenha pedirSenhaAtual={false} depois={null} />,
    botao: "Salvar e continuar",
  },
];

/** O HTML que o servidor manda, lido como o navegador leria. */
function htmlDoServidor(tela: ReactElement): Document {
  return new DOMParser().parseFromString(renderToString(tela), "text/html");
}

describe.each(casos)(
  "formulário de $nome, antes de a página carregar",
  ({ tela, botao }) => {
    it('sai do servidor com method="post" (campo nunca vai para a URL)', () => {
      const form = htmlDoServidor(tela()).querySelector("form");
      expect(form).not.toBeNull();
      expect(form?.getAttribute("method")?.toLowerCase()).toBe("post");
    });

    it("sai do servidor com o botão de enviar desabilitado", () => {
      const documento = htmlDoServidor(tela());
      const enviar = documento.querySelector<HTMLButtonElement>(
        'form button[type="submit"]'
      );
      expect(enviar).not.toBeNull();
      expect(enviar?.disabled).toBe(true);
      expect(enviar?.textContent).toBe(botao);
    });

    it("tem um só botão de enviar: os outros (o olho da senha) são type=button", () => {
      // O "botão padrão" do formulário é o primeiro que envia. Se o olho da
      // senha enviasse, o Enter num campo o usaria e a trava não valeria.
      const form = htmlDoServidor(tela()).querySelector("form");
      const queEnviam = form?.querySelectorAll('button:not([type="button"])');
      expect(queEnviam?.length).toBe(1);
    });
  }
);

describe.each(casos)(
  "formulário de $nome, depois de carregar",
  ({ tela, botao }) => {
    it("liga o botão de enviar com o mesmo texto de antes", () => {
      render(tela());
      const enviar = screen.getByRole<HTMLButtonElement>("button", {
        name: botao,
      });
      expect(enviar.disabled).toBe(false);
    });

    it("liga o botão quando o navegador hidrata o HTML do servidor", async () => {
      const recipiente = document.createElement("div");
      document.body.appendChild(recipiente);
      let raiz: Root | undefined;
      try {
        recipiente.innerHTML = renderToString(tela());

        const antes = recipiente.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        );
        expect(antes?.disabled).toBe(true);

        await act(async () => {
          raiz = hydrateRoot(recipiente, tela());
        });

        const depois = recipiente.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        );
        expect(depois?.disabled).toBe(false);
      } finally {
        // Mesmo se a conferência falhar, não deixa o formulário no documento
        // para os testes seguintes.
        act(() => raiz?.unmount());
        recipiente.remove();
      }
    });

    it("segura o envio nativo (preventDefault) e não manda nada para a URL", async () => {
      const { container } = render(tela());
      const form = container.querySelector("form") as HTMLFormElement;
      let naoFoiCancelado = true;
      // Dentro do `act` para a validação (assíncrona) do formulário vazio
      // terminar antes do teste acabar.
      await act(async () => {
        // `fireEvent.submit` devolve `false` quando alguém chamou preventDefault.
        naoFoiCancelado = fireEvent.submit(form);
      });
      expect(naoFoiCancelado).toBe(false);
    });
  }
);
