"use server";

import "server-only";
import { AVISO_TROCA } from "@/lib/auth/nucleo";
import { exigirAdmin } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { dataBr, hojeNaCasa } from "./datas";
import { type Intervalo, intervalosSchema } from "./horario";
import {
  enderecoDaRecepcao,
  instrucoesParaScc,
  mensagemDoLogin,
} from "./mensagens";
import { registrarNoHistorico } from "./registro";
import {
  type DadosDoRestaurante,
  type EmailInput,
  type RestauranteInput,
  emailSchema,
  paraOBanco,
  problemaNoReenvio,
  restauranteSchema,
} from "./schemas";
import { gerarSenhaProvisoria } from "./senha-provisoria";
import { slugDoNome, slugLivre } from "./slug";
import { mascararEmail } from "./texto";
import type {
  EdicaoSalva,
  LoginCriado,
  Resultado,
  SenhaRedefinida,
  TokenGerado,
} from "./tipos";
import { gerarToken, hashDoToken, prefixoDoToken } from "./token";

/*
 * Funções do servidor do admin (desenho §2.1). Regras de TODAS:
 *   1. a primeira linha é `await exigirAdmin()`: toda função daqui é chamável
 *      por POST direto, então a decisão mora aqui, não na página;
 *   2. ids que chegam do navegador são conferidos: formato UUID, casa lida
 *      pela RLS do admin, login ligado à casa e que não é admin;
 *   3. a tela recebe frase do produto; o log, só o código. Senha e token
 *      nunca vão para log nem para o histórico;
 *   4. escrita que deveria mudar uma linha e mudou zero é erro.
 */

const FALHA = "Não foi possível concluir agora. Tente de novo em instantes.";
const NAO_ENCONTRADO = "Restaurante não encontrado.";
const idSchema = z.uuid();

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;
type Casa = {
  id: string;
  nome: string;
  fuso: string;
  intervalo_envio_segundos: number;
};

function falha(): { ok: false; error: string } {
  logError("falha_admin");
  return { ok: false, error: FALHA };
}

function recusa(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function primeiroErro(issues: readonly { message: string }[]): string {
  return issues[0]?.message ?? "Confira os dados";
}

function idsValidos(...ids: string[]): boolean {
  return ids.every((id) => idSchema.safeParse(id).success);
}

/** A lista e o detalhe do admin se atualizam depois de qualquer mudança. */
function atualizarTelas(): void {
  revalidatePath("/admin", "layout");
}

async function enderecoDoPainel(): Promise<string> {
  const origem = (await headers()).get("origin");
  return (
    process.env.NEXT_PUBLIC_APP_URL || origem || "https://food.repplyhub.com.br"
  );
}

/** A casa pelo login do admin: a RLS só devolve se for admin. */
async function lerCasa(
  supabase: ClienteServidor,
  id: string
): Promise<Casa | "nao_encontrada" | "falhou"> {
  const { data, error } = await supabase
    .from("restaurantes")
    .select("id, nome, fuso, intervalo_envio_segundos")
    .eq("id", id)
    .maybeSingle();
  if (error) return "falhou";
  return data ?? "nao_encontrada";
}

/** O login precisa ser desta casa e não pode ser de um admin da Repply. */
async function conferirLogin(
  supabase: ClienteServidor,
  restauranteId: string,
  userId: string
): Promise<string | null> {
  const [acesso, admin] = await Promise.all([
    supabase
      .from("acessos")
      .select("user_id")
      .eq("restaurante_id", restauranteId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("admins_repply")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (acesso.error || admin.error) {
    logError("falha_admin");
    return FALHA;
  }
  if (!acesso.data) return "Este login não é desta casa.";
  if (admin.data)
    return "Este login é de um admin da Repply e não muda por aqui.";
  return null;
}

async function contarOutrasCasas(
  supabase: ClienteServidor,
  userId: string,
  restauranteId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("acessos")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("restaurante_id", restauranteId);
  if (error) {
    logError("falha_admin");
    return 0;
  }
  return count ?? 0;
}

function chaveDoHorario(lista: readonly Intervalo[]): string {
  return JSON.stringify(
    [...lista].sort((a, b) => a.dia - b.dia || (a.abre < b.abre ? -1 : 1))
  );
}

/** "nome, CNPJ, fuso, virada do dia, horário" (só o que mudou). */
function camposQueMudaram(
  atual: {
    nome: string;
    cnpj: string | null;
    fuso: string;
    hora_virada: string;
    horario_funcionamento: unknown;
  },
  novo: DadosDoRestaurante
): string {
  const mudou: string[] = [];
  if (atual.nome !== novo.nome) mudou.push("nome");
  if (atual.cnpj !== novo.cnpj) mudou.push("CNPJ");
  if (atual.fuso !== novo.fuso) mudou.push("fuso");
  if (atual.hora_virada.slice(0, 5) !== novo.hora_virada)
    mudou.push("virada do dia");
  const antes = intervalosSchema.safeParse(atual.horario_funcionamento);
  if (
    chaveDoHorario(antes.success ? antes.data : []) !==
    chaveDoHorario(novo.horario_funcionamento)
  ) {
    mudou.push("horário");
  }
  return mudou.length > 0 ? mudou.join(", ") : "sem mudança";
}

export async function cadastrarRestauranteAction(
  input: RestauranteInput
): Promise<Resultado<{ id: string }>> {
  const sessao = await exigirAdmin();
  const dados = restauranteSchema.safeParse(input);
  if (!dados.success) return recusa(primeiroErro(dados.error.issues));
  const banco = paraOBanco(dados.data);
  const supabase = await createClient();

  if (banco.cnpj) {
    const { data: mesmo, error } = await supabase
      .from("restaurantes")
      .select("id")
      .eq("cnpj", banco.cnpj)
      .maybeSingle();
    if (error) return falha();
    if (mesmo) return recusa("Já existe um restaurante com este CNPJ.");
  }

  // O endereço sai do nome e não muda depois (links e favoritos do dono).
  const base = slugDoNome(banco.nome);
  const { data: parecidos, error: erroDoEndereco } = await supabase
    .from("restaurantes")
    .select("slug")
    .like("slug", `${base}%`);
  if (erroDoEndereco) return falha();
  const slug = slugLivre(
    base,
    (parecidos ?? []).map((r) => r.slug)
  );

  const { data: criado, error } = await supabase
    .from("restaurantes")
    .insert({ slug, ...banco })
    .select("id")
    .single();
  if (error?.code === "23505") {
    return recusa(
      "Outro cadastro com o mesmo endereço ou CNPJ acabou de ser salvo. Confira a lista e tente de novo."
    );
  }
  if (error || !criado) return falha();

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId: criado.id,
    acao: "cadastrou",
    detalhe: banco.nome,
  });
  atualizarTelas();
  return { ok: true, data: { id: criado.id } };
}

export async function editarRestauranteAction(
  id: string,
  input: RestauranteInput
): Promise<Resultado<EdicaoSalva>> {
  const sessao = await exigirAdmin();
  if (!idsValidos(id)) return recusa(NAO_ENCONTRADO);
  const dados = restauranteSchema.safeParse(input);
  if (!dados.success) return recusa(primeiroErro(dados.error.issues));
  const banco = paraOBanco(dados.data);
  const supabase = await createClient();

  const { data: atual, error: erroAtual } = await supabase
    .from("restaurantes")
    .select("nome, cnpj, fuso, hora_virada, horario_funcionamento")
    .eq("id", id)
    .maybeSingle();
  if (erroAtual) return falha();
  if (!atual) return recusa(NAO_ENCONTRADO);

  if (banco.cnpj && banco.cnpj !== atual.cnpj) {
    const { data: outro, error } = await supabase
      .from("restaurantes")
      .select("id")
      .eq("cnpj", banco.cnpj)
      .neq("id", id)
      .maybeSingle();
    if (error) return falha();
    if (outro) return recusa("Já existe um restaurante com este CNPJ.");
  }

  const { count, error } = await supabase
    .from("restaurantes")
    .update(banco, { count: "exact" })
    .eq("id", id);
  if (error?.code === "23505")
    return recusa("Já existe um restaurante com este CNPJ.");
  if (error) return falha();
  if (count !== 1) return recusa(NAO_ENCONTRADO);

  const mudouFuso = banco.fuso !== atual.fuso;
  const mudouVirada = banco.hora_virada !== atual.hora_virada.slice(0, 5);
  let recalculou = false;
  let recalculoFalhou = false;
  if (mudouFuso || mudouVirada) {
    // O dia de operação das contas depende do fuso e da virada (CLAUDE.md §7).
    const { error: erroDoRecalculo } = await createServiceClient().rpc(
      "recalcular_dia_operacao",
      { p_restaurante_id: id }
    );
    if (erroDoRecalculo) {
      logError("falha_recalculo_dia");
      recalculoFalhou = true;
    } else {
      recalculou = true;
    }
  }

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId: id,
    acao: "editou_dados",
    detalhe: camposQueMudaram(atual, banco),
  });
  atualizarTelas();
  if (recalculoFalhou) {
    return recusa(
      "Os dados foram salvos, mas o dia de operação das contas não foi recalculado. Avise a equipe técnica."
    );
  }
  return { ok: true, data: { recalculou, mudouFuso } };
}

export async function gerarTokenAction(
  restauranteId: string,
  antigo: "agora" | "24h"
): Promise<Resultado<TokenGerado>> {
  await exigirAdmin();
  if (!idsValidos(restauranteId)) return recusa(NAO_ENCONTRADO);
  if (antigo !== "agora" && antigo !== "24h") {
    return recusa("Escolha quando o token antigo para.");
  }
  const supabase = await createClient();
  const casa = await lerCasa(supabase, restauranteId);
  if (casa === "falhou") return falha();
  if (casa === "nao_encontrada") return recusa(NAO_ENCONTRADO);

  const token = gerarToken();
  // A troca e o histórico acontecem numa transação só, no banco (D-38).
  const { error } = await supabase.rpc("trocar_token_envio", {
    p_restaurante: restauranteId,
    p_hash: hashDoToken(token),
    p_prefixo: prefixoDoToken(token),
    p_antigo: antigo,
  });
  if (error?.code === "42501")
    return recusa("Só a equipe Repply pode gerar token.");
  if (error?.code === "P0002") return recusa(NAO_ENCONTRADO);
  if (error) return falha();

  atualizarTelas();
  return {
    ok: true,
    data: {
      token,
      instrucoes: instrucoesParaScc({
        nome: casa.nome,
        endereco: enderecoDaRecepcao(
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
        ),
        token,
        intervaloSegundos: casa.intervalo_envio_segundos,
      }),
    },
  };
}

export async function revogarTokensAction(
  restauranteId: string
): Promise<Resultado> {
  await exigirAdmin();
  if (!idsValidos(restauranteId)) return recusa(NAO_ENCONTRADO);
  const supabase = await createClient();
  const { error } = await supabase.rpc("revogar_tokens_envio", {
    p_restaurante: restauranteId,
  });
  if (error?.code === "P0001")
    return recusa("Esta casa não tem token válido para revogar.");
  if (error?.code === "P0002") return recusa(NAO_ENCONTRADO);
  if (error?.code === "42501")
    return recusa("Só a equipe Repply pode revogar token.");
  if (error) return falha();
  atualizarTelas();
  return { ok: true };
}

/** "Criar login" com um e-mail que já tem conta: liga a casa, sem mudar a senha (D-10). */
async function ligarLoginExistente(
  supabase: ClienteServidor,
  autor: string,
  restauranteId: string,
  userId: string,
  email: string
): Promise<Resultado<LoginCriado>> {
  const { data: admin, error: erroAdmin } = await supabase
    .from("admins_repply")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (erroAdmin) return falha();
  if (admin) return recusa("Este e-mail é de um admin da Repply.");

  const { error } = await supabase
    .from("acessos")
    .insert({ user_id: userId, restaurante_id: restauranteId });
  if (error?.code === "23505")
    return recusa("Este e-mail já tem acesso a esta casa.");
  if (error) return falha();

  const outrasCasas = await contarOutrasCasas(supabase, userId, restauranteId);
  await registrarNoHistorico(supabase, {
    autor,
    restauranteId,
    acao: "ligou_login",
    detalhe: mascararEmail(email),
  });
  atualizarTelas();
  return { ok: true, data: { tipo: "ligado", email, outrasCasas } };
}

export async function criarLoginAction(
  restauranteId: string,
  input: EmailInput
): Promise<Resultado<LoginCriado>> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId)) return recusa(NAO_ENCONTRADO);
  const dados = emailSchema.safeParse(input);
  if (!dados.success) return recusa(primeiroErro(dados.error.issues));
  const { email } = dados.data;
  const supabase = await createClient();
  const casa = await lerCasa(supabase, restauranteId);
  if (casa === "falhou") return falha();
  if (casa === "nao_encontrada") return recusa(NAO_ENCONTRADO);
  const servico = createServiceClient();

  // O gerador de tipos diz `string`, mas a função devolve nulo quando não há conta.
  const existente = await servico.rpc("id_do_login_por_email", {
    p_email: email,
  });
  if (existente.error) return falha();
  if (existente.data) {
    return ligarLoginExistente(
      supabase,
      sessao.userId,
      restauranteId,
      existente.data,
      email
    );
  }

  const senha = gerarSenhaProvisoria();
  const criado = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { [AVISO_TROCA]: true },
  });
  if (criado.error?.code === "email_exists") {
    // Outro admin criou a mesma conta agora há pouco: liga em vez de criar.
    const deNovo = await servico.rpc("id_do_login_por_email", {
      p_email: email,
    });
    if (deNovo.error || !deNovo.data) return falha();
    return ligarLoginExistente(
      supabase,
      sessao.userId,
      restauranteId,
      deNovo.data,
      email
    );
  }
  if (criado.error || !criado.data.user) return falha();
  const userId = criado.data.user.id;

  const { error: erroDoAcesso } = await supabase
    .from("acessos")
    .insert({ user_id: userId, restaurante_id: restauranteId });
  if (erroDoAcesso) {
    // Sem a ligação a conta não serve, e a senha não foi mostrada: desfaz a
    // conta recém-criada para o próximo "Criar login" começar do zero.
    await servico.auth.admin.deleteUser(userId);
    return falha();
  }

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: "criou_login",
    detalhe: mascararEmail(email),
  });
  atualizarTelas();
  return {
    ok: true,
    data: {
      tipo: "novo",
      email,
      senha,
      mensagem: mensagemDoLogin({
        endereco: await enderecoDoPainel(),
        email,
        senha,
      }),
    },
  };
}

export async function redefinirSenhaAction(
  restauranteId: string,
  userId: string
): Promise<Resultado<SenhaRedefinida>> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId, userId))
    return recusa("Login não encontrado.");
  const supabase = await createClient();
  const problema = await conferirLogin(supabase, restauranteId, userId);
  if (problema) return recusa(problema);

  const servico = createServiceClient();
  const senha = gerarSenhaProvisoria();
  const { data, error } = await servico.auth.admin.updateUserById(userId, {
    password: senha,
    app_metadata: { [AVISO_TROCA]: true },
  });
  const email = data.user?.email;
  if (error || data.user?.app_metadata?.[AVISO_TROCA] !== true || !email)
    return falha();

  // Desconecta os aparelhos daquele login (D-55). O Auth local (v2.197) já
  // derruba as sessões quando o admin troca a senha, mas isso não é contrato:
  // a função do banco garante. Zero sessões encerradas é normal.
  const encerradas = await servico.rpc("encerrar_sessoes_do_login", {
    p_user_id: userId,
  });
  if (encerradas.error) {
    logError("falha_admin");
    return recusa(
      "A senha nova foi gravada, mas não deu para desconectar os aparelhos. Clique em “Redefinir senha” de novo."
    );
  }

  const outrasCasas = await contarOutrasCasas(supabase, userId, restauranteId);
  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: "redefiniu_senha",
    detalhe: outrasCasas > 0 ? `login de ${outrasCasas + 1} casas` : null,
  });
  atualizarTelas();
  return {
    ok: true,
    data: {
      email,
      senha,
      mensagem: mensagemDoLogin({
        endereco: await enderecoDoPainel(),
        email,
        senha,
      }),
      outrasCasas,
    },
  };
}

export async function trocarEmailAction(
  restauranteId: string,
  userId: string,
  input: EmailInput
): Promise<Resultado<{ outrasCasas: number }>> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId, userId))
    return recusa("Login não encontrado.");
  const dados = emailSchema.safeParse(input);
  if (!dados.success) return recusa(primeiroErro(dados.error.issues));
  const { email } = dados.data;
  const supabase = await createClient();
  const problema = await conferirLogin(supabase, restauranteId, userId);
  if (problema) return recusa(problema);

  const servico = createServiceClient();
  // O Auth responde erro 500 sem código ao trocar para um e-mail que já existe
  // (medido no local): confere antes.
  const dono = await servico.rpc("id_do_login_por_email", { p_email: email });
  if (dono.error) return falha();
  if (dono.data === userId) return recusa("Este já é o e-mail deste login.");
  if (dono.data) return recusa("Este e-mail já é de outro login.");

  // Sem e-mail de confirmação: o admin é a fonte (desenho §1.1, cartão 3).
  const { data, error } = await servico.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error || data.user?.email !== email) return falha();

  const outrasCasas = await contarOutrasCasas(supabase, userId, restauranteId);
  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: "trocou_email",
    detalhe: `para ${mascararEmail(email)}`,
  });
  atualizarTelas();
  return { ok: true, data: { outrasCasas } };
}

export async function pedirReenvioAction(
  restauranteId: string,
  input: { desde: string }
): Promise<Resultado> {
  const sessao = await exigirAdmin();
  if (!idsValidos(restauranteId)) return recusa(NAO_ENCONTRADO);
  const desde = typeof input?.desde === "string" ? input.desde : "";
  const supabase = await createClient();
  const casa = await lerCasa(supabase, restauranteId);
  if (casa === "falhou") return falha();
  if (casa === "nao_encontrada") return recusa(NAO_ENCONTRADO);

  // "Hoje" é o dia da casa, não o do servidor.
  const problema = problemaNoReenvio(desde, hojeNaCasa(new Date(), casa.fuso));
  if (problema) return recusa(problema);

  const { count, error } = await supabase
    .from("restaurantes")
    .update({ pedido_reenvio_desde: desde }, { count: "exact" })
    .eq("id", restauranteId);
  if (error) return falha();
  if (count !== 1) return recusa(NAO_ENCONTRADO);

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: "pediu_reenvio",
    detalhe: `desde ${dataBr(desde)}`,
  });
  atualizarTelas();
  return { ok: true };
}

export async function mudarSituacaoAction(
  restauranteId: string,
  situacao: "ativo" | "suspenso"
): Promise<Resultado> {
  const sessao = await exigirAdmin();
  if (
    !idsValidos(restauranteId) ||
    (situacao !== "ativo" && situacao !== "suspenso")
  ) {
    return recusa("Pedido inválido.");
  }
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("restaurantes")
    .update({ situacao }, { count: "exact" })
    .eq("id", restauranteId);
  if (error) return falha();
  if (count !== 1) return recusa(NAO_ENCONTRADO);

  await registrarNoHistorico(supabase, {
    autor: sessao.userId,
    restauranteId,
    acao: situacao === "suspenso" ? "suspendeu" : "reativou",
  });
  atualizarTelas();
  return { ok: true };
}
