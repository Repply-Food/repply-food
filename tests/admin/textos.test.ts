import { describe, expect, it } from "vitest";
import {
  type EnvioResumo,
  camposNovosDoEnvio,
  detalheDoEnvio,
} from "../../lib/admin/envios";
import {
  acaoAdmin,
  linhaDoHistorico,
  nomeDoAutor,
  textoDaAcao,
} from "../../lib/admin/historico";
import {
  avisoDeLoginLigado,
  avisoDeOutrasCasas,
  enderecoDaRecepcao,
  instrucoesParaScc,
  mensagemDaEdicao,
  mensagemDoLogin,
} from "../../lib/admin/mensagens";
import { mascararEmail, mascararToken, plural } from "../../lib/admin/texto";

describe("mensagens prontas para copiar", () => {
  it("instruções para a SCC: o texto do roteiro de cadastro", () => {
    expect(
      instrucoesParaScc({
        nome: "Bar do Zé",
        endereco: "https://exemplo.supabase.co/functions/v1/receber-envio",
        token: "rf_TOKENDETESTE",
        intervaloSegundos: 300,
      })
    ).toBe(
      [
        "Olá! Seguem os dados do repply food. para o restaurante Bar do Zé:",
        "",
        "Endereço: https://exemplo.supabase.co/functions/v1/receber-envio",
        "Token: rf_TOKENDETESTE          (guardar só no arquivo de configuração do SCC)",
        "Intervalo: 300 segundos",
        "",
        "Por favor, façam a carga inicial do histórico (contrato de dados, §8) e",
        "nos avisem quando o restaurante estiver enviando. Qualquer erro aparece",
        "para nós no painel de administração.",
      ].join("\n")
    );
  });

  it("endereço da recepção a partir do endereço do Supabase", () => {
    expect(enderecoDaRecepcao("http://127.0.0.1:54321/")).toBe(
      "http://127.0.0.1:54321/functions/v1/receber-envio"
    );
  });

  it("mensagem para o WhatsApp do dono (D-55)", () => {
    expect(
      mensagemDoLogin({
        endereco: "https://food.repplyhub.com.br",
        email: "dono@exemplo.com",
        senha: "Ab3dEf7hJk9m",
      })
    ).toBe(
      [
        "Olá! Seu acesso ao repply food. está pronto.",
        "",
        "Endereço: https://food.repplyhub.com.br",
        "E-mail: dono@exemplo.com",
        "Senha provisória: Ab3dEf7hJk9m",
        "",
        "No primeiro acesso, o painel pede para você criar a sua própria senha. Depois disso, a senha provisória deixa de valer.",
      ].join("\n")
    );
  });

  it("avisos de login de mais de uma casa", () => {
    expect(avisoDeLoginLigado(1)).toBe(
      "Este e-mail já tinha acesso; agora vê as duas casas."
    );
    expect(avisoDeLoginLigado(2)).toBe(
      "Este e-mail já tinha acesso; agora vê 3 casas."
    );
    expect(avisoDeOutrasCasas(0, "senha")).toBe("");
    expect(avisoDeOutrasCasas(1, "senha")).toBe(
      "Este login também abre outra casa: a senha nova vale para as duas."
    );
    expect(avisoDeOutrasCasas(2, "email")).toBe(
      "Este login também abre outras 2 casas: o e-mail novo vale para todas."
    );
  });

  it("mensagem depois de editar", () => {
    expect(mensagemDaEdicao(undefined)).toBe("Dados salvos.");
    expect(mensagemDaEdicao({ recalculou: false, mudouFuso: false })).toBe(
      "Dados salvos."
    );
    expect(mensagemDaEdicao({ recalculou: true, mudouFuso: false })).toBe(
      "Dados salvos. Recalculamos o dia de operação das contas desta casa."
    );
    expect(mensagemDaEdicao({ recalculou: true, mudouFuso: true })).toBe(
      "Dados salvos. Recalculamos o dia de operação das contas desta casa. Como o fuso mudou, peça um reenvio para corrigir as horas das contas que já chegaram."
    );
  });

  it("máscaras e plural", () => {
    expect(mascararToken("rf_8f3k")).toBe("rf_8f3k••••");
    expect(mascararEmail("dono@bardoze.com.br")).toBe("do…@bardoze.com.br");
    expect(mascararEmail("a@b.com")).toBe("a…@b.com");
    expect(mascararEmail("semarroba")).toBe("…");
    expect(plural(1, "casa", "casas")).toBe("1 casa");
    expect(plural(0, "casa", "casas")).toBe("0 casas");
  });
});

describe("histórico (D-59)", () => {
  it("linha com data e hora no fuso da casa, autor e ação", () => {
    expect(
      linhaDoHistorico(
        {
          id: 1,
          criadoEm: "2026-10-15T00:03:00Z",
          autor: "Lucas Ferreira",
          acao: "gerou_token",
          detalhe: "o antigo parou na hora",
        },
        "America/Fortaleza"
      )
    ).toBe(
      "14/10 21:03 · Lucas Ferreira · gerou um token novo (o antigo parou na hora)"
    );
  });

  it("ação sem detalhe e ação que o banco não conhece", () => {
    expect(textoDaAcao("abriu_painel", null)).toBe("abriu o painel do cliente");
    expect(acaoAdmin("suspendeu")).toBe("suspendeu");
    expect(acaoAdmin("apagou_tudo")).toBeNull();
  });

  it("nome do autor: o nome, senão o começo do e-mail", () => {
    expect(
      nomeDoAutor({ nome: "Lucas Ferreira", email: "lucas@repply.local" })
    ).toBe("Lucas Ferreira");
    expect(nomeDoAutor({ nome: "  ", email: "admin@repply.local" })).toBe(
      "admin"
    );
    expect(nomeDoAutor({ nome: 42, email: null })).toBe("admin");
    expect(nomeDoAutor(null)).toBe("admin removido");
  });
});

describe("envios", () => {
  const ok: EnvioResumo = {
    id: 1,
    recebidoEm: "2026-10-15T00:38:00Z",
    httpStatus: 200,
    erro: null,
    recebidas: 212,
    gravadas: 1,
    inalteradas: 203,
    removidas: 0,
    versaoScc: "5.2.1",
    camposDesconhecidos: [],
  };

  it("envio ok mostra as contagens e a versão do SCC", () => {
    expect(detalheDoEnvio(ok)).toBe(
      "212 recebidas · 1 gravada · 203 iguais · 0 removidas · SCC 5.2.1"
    );
    expect(camposNovosDoEnvio(ok)).toBeNull();
  });

  it("envio com erro mostra o erro curto e o código", () => {
    expect(
      detalheDoEnvio({
        ...ok,
        httpStatus: 422,
        erro: "formato inválido",
        versaoScc: null,
      })
    ).toBe("formato inválido (422)");
  });

  it("campos novos do SCC aparecem pelo nome (D-51)", () => {
    expect(
      camposNovosDoEnvio({ ...ok, camposDesconhecidos: ["Garcom2", "Pix"] })
    ).toBe("campos novos: Garcom2, Pix");
  });
});
