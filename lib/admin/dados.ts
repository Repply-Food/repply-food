import "server-only";
import { precisaTrocarSenha } from "@/lib/auth/nucleo";
import { exigirAdmin } from "@/lib/auth/sessao";
import { logError } from "@/lib/logger";
import { estadoDoSinal } from "@/lib/painel/selo";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database.types";
import { z } from "zod";
import type { EnvioResumo } from "./envios";
import { type RegistroDoHistorico, acaoAdmin, nomeDoAutor } from "./historico";
import { intervalosSchema } from "./horario";
import type { LinhaDaLista } from "./lista";
import { formularioDoRestaurante } from "./schemas";
import type {
  DetalheDoRestaurante,
  LoginDoDetalhe,
  RestauranteParaEditar,
  TokenDoDetalhe,
} from "./tipos";

type LinhaDaVisao = Database["public"]["Views"]["restaurantes_no_admin"]["Row"];
type ClienteServidor = Awaited<ReturnType<typeof createClient>>;
type Servico = ReturnType<typeof createServiceClient>;
type UsuarioDoAuth = {
  email: string;
  nome: unknown;
  ultimoAcessoEm: string | null;
  precisaTrocarSenha: boolean;
};

const idSchema = z.uuid();

/** Falha de leitura vira a tela de erro, nunca lista vazia (pendência 27). */
function falhou(): never {
  logError("falha_admin");
  throw new Error("falha_leitura_admin");
}

function linhaDaVisao(l: LinhaDaVisao): LinhaDaLista | null {
  if (!l.id || !l.slug || !l.nome || !l.fuso) return null;
  return {
    id: l.id,
    slug: l.slug,
    nome: l.nome,
    situacao: l.situacao === "suspenso" ? "suspenso" : "ativo",
    fuso: l.fuso,
    estado: estadoDoSinal(l.estado),
    ultimoEnvioOkEm: l.ultimo_envio_ok_em,
    versaoScc: l.versao_scc,
  };
}

/** A lista do admin, pela visão `restaurantes_no_admin` (vale a RLS do admin). */
export async function listarRestaurantes(): Promise<LinhaDaLista[]> {
  await exigirAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurantes_no_admin")
    .select(
      "id, slug, nome, situacao, fuso, estado, ultimo_envio_ok_em, versao_scc"
    );
  if (error) falhou();
  return (data ?? []).flatMap((linha) => {
    const lida = linhaDaVisao(linha);
    return lida ? [lida] : [];
  });
}

/**
 * Contas do Auth pelo id, com a chave de serviço. Só é chamada depois de
 * `exigirAdmin()`, com ids que a RLS do admin acabou de devolver.
 */
async function lerUsuarios(
  servico: Servico,
  ids: readonly string[]
): Promise<Map<string, UsuarioDoAuth | null>> {
  const unicos = [...new Set(ids)];
  const lidos = await Promise.all(
    unicos.map(async (id): Promise<[string, UsuarioDoAuth | null]> => {
      const { data, error } = await servico.auth.admin.getUserById(id);
      if (error || !data.user) return [id, null];
      return [
        id,
        {
          email: data.user.email ?? "",
          nome: data.user.user_metadata?.nome,
          ultimoAcessoEm: data.user.last_sign_in_at ?? null,
          precisaTrocarSenha: precisaTrocarSenha(data.user),
        },
      ];
    })
  );
  return new Map(lidos);
}

/** Quantas OUTRAS casas cada login abre. */
async function contarOutrasCasas(
  supabase: ClienteServidor,
  ids: readonly string[],
  restauranteId: string
): Promise<Map<string, number>> {
  const contagem = new Map<string, number>();
  if (ids.length === 0) return contagem;
  const { data, error } = await supabase
    .from("acessos")
    .select("user_id, restaurante_id")
    .in("user_id", [...ids]);
  if (error) falhou();
  for (const acesso of data ?? []) {
    if (acesso.restaurante_id !== restauranteId) {
      contagem.set(acesso.user_id, (contagem.get(acesso.user_id) ?? 0) + 1);
    }
  }
  return contagem;
}

export async function detalheDoRestaurante(
  id: string
): Promise<DetalheDoRestaurante | null> {
  await exigirAdmin();
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const agora = new Date();

  const [restaurante, sinal, tokens, acessos, envios, historico] =
    await Promise.all([
      supabase
        .from("restaurantes")
        .select(
          "id, slug, nome, cnpj, fuso, hora_virada, horario_funcionamento, situacao, pedido_reenvio_desde, intervalo_envio_segundos"
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("sinal_de_vida")
        .select("estado, ultimo_envio_ok_em")
        .eq("restaurante_id", id)
        .maybeSingle(),
      // Nunca o hash (desenho §2.5).
      supabase
        .from("tokens_envio")
        .select("id, prefixo, criado_em, criado_por, ultimo_uso_em, expira_em")
        .eq("restaurante_id", id)
        .is("revogado_em", null)
        .order("criado_em", { ascending: false }),
      supabase.from("acessos").select("user_id").eq("restaurante_id", id),
      supabase
        .from("envios")
        .select(
          "id, recebido_em, http_status, erro, recebidas, gravadas, inalteradas, removidas, versao_scc, campos_desconhecidos"
        )
        .eq("restaurante_id", id)
        .order("recebido_em", { ascending: false })
        .limit(20),
      supabase
        .from("registro_admin")
        .select("id, criado_em, autor, acao, detalhe")
        .eq("restaurante_id", id)
        .order("criado_em", { ascending: false })
        .limit(30),
    ]);
  if (
    restaurante.error ||
    sinal.error ||
    tokens.error ||
    acessos.error ||
    envios.error ||
    historico.error
  ) {
    falhou();
  }
  const r = restaurante.data;
  if (!r) return null;

  const tokensValidos = (tokens.data ?? []).filter(
    (t) => t.expira_em === null || Date.parse(t.expira_em) > agora.getTime()
  );
  const idsDosLogins = (acessos.data ?? []).map((a) => a.user_id);
  const autores = [
    ...(historico.data ?? []).flatMap((h) => (h.autor ? [h.autor] : [])),
    ...tokensValidos.flatMap((t) => (t.criado_por ? [t.criado_por] : [])),
  ];
  const [usuarios, outrasCasas] = await Promise.all([
    lerUsuarios(createServiceClient(), [...idsDosLogins, ...autores]),
    contarOutrasCasas(supabase, idsDosLogins, id),
  ]);
  const nome = (autor: string | null) =>
    autor
      ? nomeDoAutor(usuarios.get(autor) ?? { email: null })
      : "admin removido";

  const logins: LoginDoDetalhe[] = idsDosLogins.map((userId) => {
    const usuario = usuarios.get(userId);
    // Sem ler a conta não dá para mostrar o acesso do cliente com verdade.
    if (!usuario) falhou();
    return {
      userId,
      email: usuario.email,
      ultimoAcessoEm: usuario.ultimoAcessoEm,
      precisaTrocarSenha: usuario.precisaTrocarSenha,
      outrasCasas: outrasCasas.get(userId) ?? 0,
    };
  });

  const tokensDoDetalhe: TokenDoDetalhe[] = tokensValidos.map((t) => ({
    id: t.id,
    prefixo: t.prefixo,
    criadoEm: t.criado_em,
    criadoPor: nome(t.criado_por),
    ultimoUsoEm: t.ultimo_uso_em,
    expiraEm: t.expira_em,
  }));

  const enviosDoDetalhe: EnvioResumo[] = (envios.data ?? []).map((e) => ({
    id: e.id,
    recebidoEm: e.recebido_em,
    httpStatus: e.http_status,
    erro: e.erro,
    recebidas: e.recebidas,
    gravadas: e.gravadas,
    inalteradas: e.inalteradas,
    removidas: e.removidas,
    versaoScc: e.versao_scc,
    camposDesconhecidos: e.campos_desconhecidos,
  }));

  const historicoMostrado: RegistroDoHistorico[] = (
    historico.data ?? []
  ).flatMap((h) => {
    const acao = acaoAdmin(h.acao);
    if (!acao) return [];
    return [
      {
        id: h.id,
        criadoEm: h.criado_em,
        autor: nome(h.autor),
        acao,
        detalhe: h.detalhe,
      },
    ];
  });

  const horario = intervalosSchema.safeParse(r.horario_funcionamento);
  return {
    agoraIso: agora.toISOString(),
    restaurante: {
      id: r.id,
      slug: r.slug,
      nome: r.nome,
      cnpj: r.cnpj,
      fuso: r.fuso,
      horaVirada: r.hora_virada.slice(0, 5),
      horario: horario.success ? horario.data : [],
      situacao: r.situacao === "suspenso" ? "suspenso" : "ativo",
      pedidoReenvioDesde: r.pedido_reenvio_desde,
      intervaloEnvioSegundos: r.intervalo_envio_segundos,
    },
    sinal: {
      estado: estadoDoSinal(sinal.data?.estado),
      ultimoEnvioOkEm: sinal.data?.ultimo_envio_ok_em ?? null,
    },
    tokens: tokensDoDetalhe,
    logins,
    envios: enviosDoDetalhe,
    historico: historicoMostrado,
  };
}

export async function restauranteParaEditar(
  id: string
): Promise<RestauranteParaEditar | null> {
  await exigirAdmin();
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurantes")
    .select("id, nome, cnpj, fuso, hora_virada, horario_funcionamento")
    .eq("id", id)
    .maybeSingle();
  if (error) falhou();
  if (!data) return null;
  return {
    id: data.id,
    nome: data.nome,
    valores: formularioDoRestaurante(data),
  };
}

/** Os e-mails dos logins da casa, para o Ajustes do admin (D-58). */
export async function emailsDosLoginsDaCasa(
  restauranteId: string
): Promise<string[]> {
  await exigirAdmin();
  if (!idSchema.safeParse(restauranteId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acessos")
    .select("user_id")
    .eq("restaurante_id", restauranteId);
  if (error) falhou();
  const usuarios = await lerUsuarios(
    createServiceClient(),
    (data ?? []).map((a) => a.user_id)
  );
  return [...usuarios.values()].flatMap((u) => (u?.email ? [u.email] : []));
}
