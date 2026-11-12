import "server-only";
import { randomUUID } from "node:crypto";
import { logError } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import { FalhaDoMentor } from "./falha";

/**
 * Os anexos do mentor (Fase 4): os arquivos que o dono manda junto da
 * pergunta (a foto do cardápio, o PDF da planilha) para a IA analisar.
 *
 * SEGURANÇA E ISOLAMENTO
 * - `restauranteId` vem do chamador interno (a função do servidor, que usa o
 *   da sessão), nunca do corpo da requisição nem do modelo. Toda leitura e
 *   escrita filtra pela casa de forma explícita.
 * - O cofre `mentor-anexos` não tem política nenhuma em `storage.objects`:
 *   o navegador nunca toca no arquivo direto. Tudo passa pela chave de
 *   serviço (só ela sobe, move, apaga e assina).
 * - Todo erro vira `FalhaDoMentor("falha_anexos_mentor")`, e o log leva só
 *   esse código: nunca o nome ou o conteúdo do arquivo, a pergunta do dono
 *   nem a mensagem crua do erro (D-29).
 * - Caminho único global: o pendente usa `pendente/{uuid}-{nome-seguro}`, e
 *   o final usa `{restaurante_id}/{conversa_id}/{anexo_id}-{nome-seguro}`.
 *   O uuid na frente garante que dois envios nunca dividem o caminho (a
 *   coluna `caminho` é única no banco).
 * - Rollback: erro no meio do lote apaga os arquivos que subiram e as fichas
 *   que entraram (melhor esforço, sem mascarar o erro original), para não
 *   deixar órfão no cofre nem ficha sem arquivo.
 */

export type TipoDeAnexo = "imagem" | "pdf" | "planilha";

/** Extensão (minúscula, sem ponto) → tipo do anexo. */
export const TIPOS_ANEXO: Record<string, TipoDeAnexo> = {
  png: "imagem",
  jpg: "imagem",
  jpeg: "imagem",
  webp: "imagem",
  pdf: "pdf",
  xlsx: "planilha",
  csv: "planilha",
};

/** Mime que cada extensão aceita (conferido contra a extensão, não só ela). */
const MIMES_POR_EXTENSAO: Record<string, readonly string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  csv: ["text/csv", "application/csv"],
};

/** 10 MiB por arquivo (regra igual à do banco). */
export const TAMANHO_MAXIMO_ANEXO = 10_485_760;
/** Até 5 arquivos por pergunta. */
export const MAXIMO_ANEXOS_POR_PERGUNTA = 5;

export type ArquivoValidado = {
  arquivo: File;
  nomeSeguro: string;
  tipo: TipoDeAnexo;
  mime: string;
  tamanho: number;
};

const FRASE_QUANTIDADE = "dá para mandar até 5 arquivos por pergunta";
const FRASE_TIPO = "o mentor só abre imagem, PDF e planilha";
const FRASE_TAMANHO = "cada arquivo pode ter no máximo 10 MB";
const FRASE_NOME = "esse nome de arquivo não vale; renomeie e mande de novo";

const CODIGO_NO_LOG = "falha_anexos_mentor" as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Servico = ReturnType<typeof createServiceClient>;

/**
 * Tira o caminho do nome (`../../etc/foto.png` vira `foto.png`) e os
 * caracteres que o cofre não entende. Nulo quando não sobra nome (ou passa
 * de 120 letras, a regra do banco): quem chama recusa com frase do produto.
 */
function higienizarNome(nome: unknown): string | null {
  if (typeof nome !== "string") return null;
  const base = nome.split("/").pop()?.split("\\").pop() ?? "";
  const aparado = base.trim();
  if (aparado === "") return null;
  const limpo = aparado
    .replace(/[^\p{L}\p{N} ._-]/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .trim();
  if (limpo === "" || limpo.length > 120) return null;
  return limpo;
}

/** A extensão minúscula sem o ponto; vazio quando o nome não tem. */
function extensaoDe(nomeSeguro: string): string {
  const ponto = nomeSeguro.lastIndexOf(".");
  if (ponto <= 0 || ponto === nomeSeguro.length - 1) return "";
  return nomeSeguro.slice(ponto + 1).toLowerCase();
}

/**
 * Confere quantidade, tipo (extensão + mime), tamanho e nome. Nunca lança:
 * fora da regra devolve a frase do produto.
 */
export function validarArquivos(
  arquivos: File[]
): { ok: true; arquivos: ArquivoValidado[] } | { ok: false; error: string } {
  try {
    if (!Array.isArray(arquivos)) return { ok: false, error: FRASE_TIPO };
    if (arquivos.length > MAXIMO_ANEXOS_POR_PERGUNTA) {
      return { ok: false, error: FRASE_QUANTIDADE };
    }
    const validados: ArquivoValidado[] = [];
    for (const arquivo of arquivos) {
      if (!arquivo || typeof arquivo !== "object") {
        return { ok: false, error: FRASE_TIPO };
      }
      const nomeSeguro = higienizarNome((arquivo as { name?: unknown }).name);
      if (!nomeSeguro) return { ok: false, error: FRASE_NOME };
      const tipo = TIPOS_ANEXO[extensaoDe(nomeSeguro)];
      if (!tipo) return { ok: false, error: FRASE_TIPO };
      const mime = String((arquivo as { type?: unknown }).type ?? "")
        .split(";")[0]
        ?.trim()
        .toLowerCase();
      if (
        !mime ||
        !MIMES_POR_EXTENSAO[extensaoDe(nomeSeguro)]?.includes(mime)
      ) {
        return { ok: false, error: FRASE_TIPO };
      }
      const tamanho = (arquivo as { size?: unknown }).size;
      if (
        typeof tamanho !== "number" ||
        !Number.isInteger(tamanho) ||
        tamanho < 1 ||
        tamanho > TAMANHO_MAXIMO_ANEXO
      ) {
        return { ok: false, error: FRASE_TAMANHO };
      }
      validados.push({
        arquivo: arquivo as File,
        nomeSeguro,
        tipo,
        mime,
        tamanho,
      });
    }
    return { ok: true, arquivos: validados };
  } catch {
    return { ok: false, error: FRASE_TIPO };
  }
}

/**
 * Apaga os arquivos que subiram e as fichas que entraram (melhor esforço:
 * nunca mascara o erro original com um erro do rollback).
 */
async function desfazerSubida(
  servico: Servico,
  caminhos: string[],
  ids: string[],
  restauranteId: string
): Promise<void> {
  try {
    if (caminhos.length > 0) {
      await servico.storage.from("mentor-anexos").remove(caminhos);
    }
    if (ids.length > 0) {
      await servico
        .from("mentor_anexos")
        .delete()
        .in("id", ids)
        .eq("restaurante_id", restauranteId);
    }
  } catch {
    // O erro original já vai para o log; um resto no cofre a faxina remove.
  }
}

/**
 * Sobe os arquivos para `pendente/{uuid}-{nome-seguro}` e grava a ficha de
 * cada um, com a conversa como veio (nulo = anexo geral da casa, antes de
 * vincular). Erro no meio do lote desfaz o que subiu e lança a falha
 * classificada.
 */
export async function gravarAnexos(
  restauranteId: string,
  conversaId: string | null,
  arquivos: File[]
): Promise<{ id: string; caminho: string }[]> {
  const validacao = validarArquivos(arquivos);
  if (!validacao.ok) {
    logError(CODIGO_NO_LOG);
    throw new FalhaDoMentor(CODIGO_NO_LOG);
  }
  const servico = createServiceClient();
  const subidos: string[] = [];
  const gravados: string[] = [];
  try {
    const saidas: { id: string; caminho: string }[] = [];
    for (const item of validacao.arquivos) {
      const caminho = `pendente/${randomUUID()}-${item.nomeSeguro}`;
      const bytes = new Uint8Array(await item.arquivo.arrayBuffer());
      const subida = await servico.storage
        .from("mentor-anexos")
        .upload(caminho, bytes, {
          contentType: item.mime,
          upsert: false,
        });
      if (subida.error) throw subida.error;
      subidos.push(caminho);

      const linha = await servico
        .from("mentor_anexos")
        .insert({
          restaurante_id: restauranteId,
          conversa_id: conversaId,
          nome_original: item.nomeSeguro,
          tipo: item.tipo,
          tamanho_bytes: bytes.length,
          caminho,
        })
        .select("id");
      if (linha.error || !linha.data || linha.data.length !== 1) {
        throw linha.error ?? new Error("a ficha do anexo não entrou");
      }
      const id = linha.data[0]?.id;
      if (!id) throw new Error("a ficha do anexo não entrou");
      gravados.push(id);
      saidas.push({ id, caminho });
    }
    return saidas;
  } catch {
    await desfazerSubida(servico, subidos, gravados, restauranteId);
    logError(CODIGO_NO_LOG);
    throw new FalhaDoMentor(CODIGO_NO_LOG);
  }
}

/**
 * Leva o anexo do pendente para a pasta da conversa
 * (`{casa}/{conversa}/{anexo_id}-{nome-seguro}`) e liga a ficha. O nome vem
 * do banco re-higienizado (basename); id ou conversa fora do formato recusa
 * antes de tocar banco e cofre. Falha lança a falha classificada.
 */
export async function vincularAnexos(
  restauranteId: string,
  conversaId: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  if (!UUID.test(conversaId) || ids.some((id) => !UUID.test(id))) {
    logError(CODIGO_NO_LOG);
    throw new FalhaDoMentor(CODIGO_NO_LOG);
  }
  const servico = createServiceClient();
  try {
    for (const id of ids) {
      const linha = await servico
        .from("mentor_anexos")
        .select("id, caminho, nome_original")
        .eq("id", id)
        .eq("restaurante_id", restauranteId)
        .maybeSingle();
      if (linha.error || !linha.data) {
        throw linha.error ?? new Error("a ficha do anexo não foi achada");
      }
      // Nunca confia no nome que está no banco: re-higieniza (basename).
      const nome = higienizarNome(linha.data.nome_original);
      if (!nome) throw new Error("o nome do anexo não vale");
      const destino = `${restauranteId}/${conversaId}/${linha.data.id}-${nome}`;
      const movida = await servico.storage
        .from("mentor-anexos")
        .move(linha.data.caminho, destino);
      if (movida.error) throw movida.error;

      const ligada = await servico
        .from("mentor_anexos")
        .update({ conversa_id: conversaId, caminho: destino })
        .eq("id", id)
        .eq("restaurante_id", restauranteId)
        .select("id");
      // Zero linhas não é sucesso: a ficha sumiu entre a leitura e a escrita.
      if (ligada.error || !ligada.data || ligada.data.length !== 1) {
        throw ligada.error ?? new Error("a ficha do anexo não vinculou");
      }
    }
  } catch {
    logError(CODIGO_NO_LOG);
    throw new FalhaDoMentor(CODIGO_NO_LOG);
  }
}

/**
 * Apaga os arquivos e as fichas da conversa (com a casa explícita, para não
 * tocar na conversa ao lado). Zero linhas = ok: conversa sem anexo resolve
 * sem erro.
 */
export async function excluirAnexosDaConversa(
  restauranteId: string,
  conversaId: string
): Promise<void> {
  if (!UUID.test(conversaId)) {
    logError(CODIGO_NO_LOG);
    throw new FalhaDoMentor(CODIGO_NO_LOG);
  }
  const servico = createServiceClient();
  try {
    const linhas = await servico
      .from("mentor_anexos")
      .select("id, caminho")
      .eq("restaurante_id", restauranteId)
      .eq("conversa_id", conversaId);
    if (linhas.error || !linhas.data) {
      throw linhas.error ?? new Error("os anexos não foram listados");
    }
    const caminhos = linhas.data.map((linha) => linha.caminho);
    if (caminhos.length > 0) {
      const saida = await servico.storage
        .from("mentor-anexos")
        .remove(caminhos);
      if (saida.error) throw saida.error;
    }
    const apagadas = await servico
      .from("mentor_anexos")
      .delete()
      .eq("restaurante_id", restauranteId)
      .eq("conversa_id", conversaId);
    if (apagadas.error) throw apagadas.error;
  } catch {
    logError(CODIGO_NO_LOG);
    throw new FalhaDoMentor(CODIGO_NO_LOG);
  }
}

/**
 * O link temporário (120 s) para o dono baixar o anexo. Nulo quando o anexo
 * não é desta casa ou não existe; falha de cofre também vira nulo, com log.
 */
export async function urlParaBaixar(
  restauranteId: string,
  anexoId: string
): Promise<string | null> {
  if (!UUID.test(anexoId)) return null;
  try {
    const servico = createServiceClient();
    const linha = await servico
      .from("mentor_anexos")
      .select("caminho")
      .eq("id", anexoId)
      .eq("restaurante_id", restauranteId)
      .maybeSingle();
    if (linha.error || !linha.data) {
      if (linha.error) logError(CODIGO_NO_LOG);
      return null;
    }
    const assinada = await servico.storage
      .from("mentor-anexos")
      .createSignedUrl(linha.data.caminho, 120);
    if (assinada.error || !assinada.data?.signedUrl) {
      logError(CODIGO_NO_LOG);
      return null;
    }
    return assinada.data.signedUrl;
  } catch {
    logError(CODIGO_NO_LOG);
    return null;
  }
}
