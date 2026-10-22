import type { EstadoSinal } from "@/lib/painel/selo";
import type { EnvioResumo } from "./envios";
import type { RegistroDoHistorico } from "./historico";
import type { Intervalo } from "./horario";
import type { RestauranteInput } from "./schemas";

/** O que toda função do servidor do admin devolve (CLAUDE.md §5). */
export type Resultado<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type TokenDoDetalhe = {
  id: string;
  prefixo: string;
  criadoEm: string;
  /** Nome de quem gerou (`nomeDoAutor`). */
  criadoPor: string;
  ultimoUsoEm: string | null;
  /** Só no token que está saindo (troca "em 24 h"). */
  expiraEm: string | null;
};

export type LoginDoDetalhe = {
  userId: string;
  email: string;
  ultimoAcessoEm: string | null;
  precisaTrocarSenha: boolean;
  /** Quantas OUTRAS casas este login abre (dono com duas casas, D-10). */
  outrasCasas: number;
};

export type DetalheDoRestaurante = {
  /** Momento da leitura no servidor: base de "usado há…" e do "hoje". */
  agoraIso: string;
  restaurante: {
    id: string;
    slug: string;
    nome: string;
    cnpj: string | null;
    fuso: string;
    /** "05:00" */
    horaVirada: string;
    horario: Intervalo[];
    situacao: "ativo" | "suspenso";
    pedidoReenvioDesde: string | null;
    intervaloEnvioSegundos: number;
    demonstracao: boolean;
  };
  sinal: { estado: EstadoSinal | null; ultimoEnvioOkEm: string | null };
  /** Válidos, o mais novo primeiro. Nunca o hash. */
  tokens: TokenDoDetalhe[];
  logins: LoginDoDetalhe[];
  /** Os 20 mais recentes. */
  envios: EnvioResumo[];
  /** As 30 ações mais recentes. */
  historico: RegistroDoHistorico[];
};

export type RestauranteParaEditar = {
  id: string;
  nome: string;
  valores: RestauranteInput;
};

export type TokenGerado = { token: string; instrucoes: string };

export type LoginCriado =
  | { tipo: "novo"; email: string; senha: string; mensagem: string }
  | { tipo: "ligado"; email: string; outrasCasas: number };

export type SenhaRedefinida = {
  email: string;
  senha: string;
  mensagem: string;
  outrasCasas: number;
};

export type EdicaoSalva = { recalculou: boolean; mudouFuso: boolean };
