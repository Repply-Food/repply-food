// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acoes = vi.hoisted(() => ({
  gerar: vi.fn(),
  revogar: vi.fn(),
  criar: vi.fn(),
  redefinir: vi.fn(),
  trocar: vi.fn(),
  situacao: vi.fn(),
  reenvio: vi.fn(),
}));

vi.mock("@/lib/admin/actions", () => ({
  gerarTokenAction: acoes.gerar,
  revogarTokensAction: acoes.revogar,
  criarLoginAction: acoes.criar,
  redefinirSenhaAction: acoes.redefinir,
  trocarEmailAction: acoes.trocar,
  mudarSituacaoAction: acoes.situacao,
  pedirReenvioAction: acoes.reenvio,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CartaoAcesso } from "@/components/admin/cartoes/cartao-acesso";
import { CartaoReenvio } from "@/components/admin/cartoes/cartao-reenvio";
import { CartaoSituacao } from "@/components/admin/cartoes/cartao-situacao";
import { CartaoToken } from "@/components/admin/cartoes/cartao-token";
import type {
  DetalheDoRestaurante,
  LoginDoDetalhe,
  TokenDoDetalhe,
} from "@/lib/admin/tipos";

const ID = "11111111-1111-4111-8111-111111111111";
const escrever = vi.fn();

function detalhe(
  parcial: Partial<DetalheDoRestaurante> = {}
): DetalheDoRestaurante {
  return {
    agoraIso: "2026-10-15T00:40:00Z", // quarta 14/10, 21:40 em Fortaleza
    restaurante: {
      id: ID,
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
    ...parcial,
  };
}

const TOKEN: TokenDoDetalhe = {
  id: "t1",
  prefixo: "rf_8f3k",
  criadoEm: "2026-10-02T15:00:00Z",
  criadoPor: "Lucas",
  ultimoUsoEm: null,
  expiraEm: null,
};

const LOGIN: LoginDoDetalhe = {
  userId: "u1",
  email: "dono@exemplo.com",
  ultimoAcessoEm: "2026-10-14T01:10:00Z", // terça 13/10, 22:10 em Fortaleza
  precisaTrocarSenha: true,
  outrasCasas: 1,
};

async function clicar(nome: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  escrever.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: escrever },
    configurable: true,
  });
});

describe("cartão Token de envio (D-38)", () => {
  it("sem token: gera, mostra uma vez e copia o token e as instruções", async () => {
    acoes.gerar.mockResolvedValue({
      ok: true,
      data: { token: "rf_TOKEN", instrucoes: "INSTRUÇÕES" },
    });
    render(<CartaoToken detalhe={detalhe()} />);
    expect(
      screen.getByText("Esta casa ainda não tem token de envio.")
    ).toBeTruthy();
    await clicar("Gerar token");
    expect(acoes.gerar).toHaveBeenCalledWith(ID, "agora");
    expect(
      await screen.findByText("Copie agora: este token não aparece de novo")
    ).toBeTruthy();
    expect(screen.getByText("rf_TOKEN")).toBeTruthy();
    await clicar("Copiar instruções para a SCC");
    expect(escrever).toHaveBeenCalledWith("INSTRUÇÕES");
    await clicar("Copiar token");
    expect(escrever).toHaveBeenCalledWith("rf_TOKEN");
  });

  it("com token: só o começo, quem criou e o uso; o novo pergunta e começa em 'agora'", async () => {
    acoes.gerar.mockResolvedValue({
      ok: true,
      data: { token: "rf_NOVO", instrucoes: "x" },
    });
    render(<CartaoToken detalhe={detalhe({ tokens: [TOKEN] })} />);
    expect(screen.getByText("rf_8f3k••••")).toBeTruthy();
    expect(screen.getByText("criado 02/10 por Lucas")).toBeTruthy();
    expect(screen.getByText("ainda não usado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gerar novo token" }));
    expect(
      (screen.getByLabelText("Agora (padrão)") as HTMLInputElement).checked
    ).toBe(true);
    fireEvent.click(screen.getByLabelText(/Em 24 horas/));
    await clicar("Gerar novo token");
    expect(acoes.gerar).toHaveBeenCalledWith(ID, "24h");
  });

  it("durante a troca de 24 h, mostra quando o antigo para", () => {
    render(
      <CartaoToken
        detalhe={detalhe({
          tokens: [
            {
              ...TOKEN,
              id: "t2",
              prefixo: "rf_new1",
              ultimoUsoEm: "2026-10-15T00:38:00Z",
            },
            { ...TOKEN, prefixo: "rf_ab12", expiraEm: "2026-10-16T00:03:00Z" },
          ],
        })}
      />
    );
    expect(screen.getByText("usado há 2 min")).toBeTruthy();
    expect(
      screen.getByText("O token anterior (rf_ab12••••) para às 21:03 (15/10).")
    ).toBeTruthy();
  });

  it("revogar pergunta antes e avisa que o SCC para", async () => {
    acoes.revogar.mockResolvedValue({ ok: true });
    render(<CartaoToken detalhe={detalhe({ tokens: [TOKEN] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Revogar token" }));
    expect(
      screen.getByText("O SCC para de enviar até receber um token novo.")
    ).toBeTruthy();
    await clicar("Revogar token");
    expect(acoes.revogar).toHaveBeenCalledWith(ID);
  });

  it("erro do servidor aparece no cartão", async () => {
    acoes.gerar.mockResolvedValue({
      ok: false,
      error: "Só a equipe Repply pode gerar token.",
    });
    render(<CartaoToken detalhe={detalhe()} />);
    await clicar("Gerar token");
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Só a equipe Repply pode gerar token."
    );
  });

  it("o token gerado só vive no estado da tela: nunca em localStorage nem sessionStorage", async () => {
    acoes.gerar.mockResolvedValue({
      ok: true,
      data: { token: "rf_SEGREDO", instrucoes: "x" },
    });
    localStorage.clear();
    sessionStorage.clear();
    render(<CartaoToken detalhe={detalhe()} />);
    await clicar("Gerar token");
    expect(await screen.findByText("rf_SEGREDO")).toBeTruthy();
    expect(JSON.stringify({ ...localStorage })).not.toContain("rf_SEGREDO");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("rf_SEGREDO");
    expect(window.location.href).not.toContain("rf_SEGREDO");
  });
});

describe("cartão Acesso do cliente (D-55)", () => {
  it("sem login: cria e mostra a senha uma vez, com a mensagem do WhatsApp", async () => {
    acoes.criar.mockResolvedValue({
      ok: true,
      data: {
        tipo: "novo",
        email: "dono@exemplo.com",
        senha: "Ab3dEf7hJk9m",
        mensagem: "MENSAGEM",
      },
    });
    render(<CartaoAcesso detalhe={detalhe()} />);
    fireEvent.change(screen.getByLabelText("E-mail do cliente"), {
      target: { value: "dono@exemplo.com" },
    });
    await clicar("Criar login");
    await waitFor(() =>
      expect(acoes.criar).toHaveBeenCalledWith(ID, {
        email: "dono@exemplo.com",
      })
    );
    expect(
      await screen.findByText("Copie agora: esta senha não aparece de novo")
    ).toBeTruthy();
    expect(screen.getByText("Ab3dEf7hJk9m")).toBeTruthy();
    await clicar("Copiar mensagem para o WhatsApp");
    expect(escrever).toHaveBeenCalledWith("MENSAGEM");
  });

  it("e-mail que já tinha conta: avisa que agora vê as duas casas (D-10)", async () => {
    acoes.criar.mockResolvedValue({
      ok: true,
      data: { tipo: "ligado", email: "dono@exemplo.com", outrasCasas: 1 },
    });
    render(<CartaoAcesso detalhe={detalhe()} />);
    fireEvent.change(screen.getByLabelText("E-mail do cliente"), {
      target: { value: "dono@exemplo.com" },
    });
    await clicar("Criar login");
    expect(
      await screen.findByText(
        "Este e-mail já tinha acesso; agora vê as duas casas."
      )
    ).toBeTruthy();
  });

  it("e-mail que já tinha acesso a esta casa (sem outras): não conta 'casas' erradas", async () => {
    acoes.criar.mockResolvedValue({
      ok: true,
      data: { tipo: "ligado", email: "dono@exemplo.com", outrasCasas: 0 },
    });
    render(<CartaoAcesso detalhe={detalhe()} />);
    fireEvent.change(screen.getByLabelText("E-mail do cliente"), {
      target: { value: "dono@exemplo.com" },
    });
    await clicar("Criar login");
    expect(
      await screen.findByText(
        "Este e-mail já tinha acesso; agora vê esta casa."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/1 casas/)).toBeNull();
  });

  it("com login: e-mail, último acesso e troca pendente; redefinir avisa das outras casas", async () => {
    acoes.redefinir.mockResolvedValue({
      ok: true,
      data: {
        email: "dono@exemplo.com",
        senha: "Zx2cVb3nMq4w",
        mensagem: "MSG",
        outrasCasas: 1,
      },
    });
    render(<CartaoAcesso detalhe={detalhe({ logins: [LOGIN] })} />);
    expect(screen.getByText("dono@exemplo.com")).toBeTruthy();
    expect(screen.getByText("último acesso: ontem 22:10")).toBeTruthy();
    expect(screen.getByText("precisa trocar a senha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
    expect(
      screen.getByText(
        /Este login também abre outra casa: a senha nova vale para as duas\./
      )
    ).toBeTruthy();
    await clicar("Redefinir senha");
    expect(acoes.redefinir).toHaveBeenCalledWith(ID, "u1");
    expect(await screen.findByText("Zx2cVb3nMq4w")).toBeTruthy();
  });

  it("trocar e-mail avisa que vale para as outras casas e manda o e-mail novo", async () => {
    acoes.trocar.mockResolvedValue({ ok: true, data: { outrasCasas: 1 } });
    render(<CartaoAcesso detalhe={detalhe({ logins: [LOGIN] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Trocar e-mail" }));
    expect(screen.getByText(/o e-mail novo vale para as duas/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("E-mail novo"), {
      target: { value: "novo@exemplo.com" },
    });
    await clicar("Trocar e-mail");
    await waitFor(() =>
      expect(acoes.trocar).toHaveBeenCalledWith(ID, "u1", {
        email: "novo@exemplo.com",
      })
    );
  });
});

describe("cartão Pedir reenvio", () => {
  it("mostra o pedido pendente e recusa data no futuro sem chamar o servidor", async () => {
    const base = detalhe();
    render(
      <CartaoReenvio
        detalhe={{
          ...base,
          restaurante: {
            ...base.restaurante,
            pedidoReenvioDesde: "2026-10-01",
          },
        }}
      />
    );
    expect(
      screen.getByText("Pedido de reenvio desde 01/10, aguardando o SCC.")
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-10-20" },
    });
    await clicar("Pedir reenvio");
    expect(screen.getByText("A data não pode ser no futuro.")).toBeTruthy();
    expect(acoes.reenvio).not.toHaveBeenCalled();
  });

  it("data válida vai para o servidor", async () => {
    acoes.reenvio.mockResolvedValue({ ok: true });
    render(<CartaoReenvio detalhe={detalhe()} />);
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-10-01" },
    });
    await clicar("Pedir reenvio");
    expect(acoes.reenvio).toHaveBeenCalledWith(ID, { desde: "2026-10-01" });
  });
});

describe("cartão Situação (D-57)", () => {
  it("suspender pergunta com o que acontece", async () => {
    acoes.situacao.mockResolvedValue({ ok: true });
    render(<CartaoSituacao detalhe={detalhe()} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspender" }));
    expect(
      screen.getByText(/os dados continuam guardados e o SCC continua enviando/)
    ).toBeTruthy();
    await clicar("Suspender");
    expect(acoes.situacao).toHaveBeenCalledWith(ID, "suspenso");
  });

  it("casa suspensa oferece reativar", async () => {
    acoes.situacao.mockResolvedValue({ ok: true });
    const base = detalhe();
    render(
      <CartaoSituacao
        detalhe={{
          ...base,
          restaurante: { ...base.restaurante, situacao: "suspenso" },
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Reativar" }));
    await clicar("Reativar");
    expect(acoes.situacao).toHaveBeenCalledWith(ID, "ativo");
  });
});
