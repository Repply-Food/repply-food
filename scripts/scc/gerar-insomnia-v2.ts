import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { criarAmostrasV2, criarCorrecaoV2 } from "./amostra-v2";

export function criarColecao() {
  const grupos = [
    "00 Preparação",
    "01 Sucesso on-line",
    "02 Fechamento histórico",
    "03 Idempotência",
    "04 Correção",
    "05 Paginação incompleta",
    "06 Erros 401-409-422",
  ];
  const resources: Array<{
    _id: string;
    _type: string;
    parentId?: string;
    name?: string;
    data?: Record<string, string>;
    url?: string;
    method?: string;
    headers?: Array<{ name: string; value: string }>;
    body?: { mimeType: string; text: string };
  }> = [
    { _id: "wrk_scc_v2", _type: "workspace", name: "Smoke SCC v2 local" },
    {
      _id: "env_scc_v2",
      _type: "environment",
      parentId: "wrk_scc_v2",
      name: "Local",
      data: {
        base_url: "http://127.0.0.1:54321/functions/v1/receber-envio",
        token: "",
      },
    },
    ...grupos.map((name, i) => ({
      _id: `fld_${i}`,
      _type: "request_group",
      parentId: "wrk_scc_v2",
      name,
    })),
  ];
  const adicionar = (
    grupo: number,
    name: string,
    corpo: unknown,
    autenticado = true
  ) => {
    resources.push({
      _id: `req_${resources.length}`,
      _type: "request",
      parentId: `fld_${grupo}`,
      name,
      url: "{{ _.base_url }}",
      method: "POST",
      headers: [
        { name: "Content-Type", value: "application/json" },
        ...(autenticado
          ? [{ name: "Authorization", value: "Bearer {{ _.token }}" }]
          : []),
      ],
      body: {
        mimeType: "application/json",
        text: JSON.stringify(corpo, null, 2),
      },
    });
  };
  const inicial = criarAmostrasV2();
  const corrigido = criarCorrecaoV2();
  for (const carga of inicial) adicionar(1, carga.tipo_envio, carga);
  for (const carga of inicial)
    if (carga.modo === "fotografia")
      adicionar(2, carga.tipo_envio, {
        ...carga,
        id_envio: carga.id_envio.replace("1740", "1750"),
        fonte: "historico",
      });
  adicionar(3, "Reenvio idêntico", inicial[2]);
  for (const carga of corrigido) adicionar(4, carga.tipo_envio, carga);
  for (const carga of corrigido)
    if (carga.modo === "fotografia")
      adicionar(4, `${carga.tipo_envio} histórico`, {
        ...carga,
        id_envio: carga.id_envio.replace("1740", "1750"),
        fonte: "historico",
      });
  const foto = inicial[2];
  if (!foto || foto.modo !== "fotografia") throw new Error("Amostra inválida");
  adicionar(5, "Página 1 de 2", {
    ...foto,
    id_envio: "123e4567-e89b-42d3-a456-426614176001",
    sequencia: "3",
    pagina: { numero: 1, total: 2 },
    dados: foto.dados.slice(0, 2),
  });
  adicionar(6, "401 sem token", foto, false);
  adicionar(6, "401 token inválido", foto);
  resources[resources.length - 1]?.headers?.splice(1, 1, {
    name: "Authorization",
    value: "Bearer {{ _.token }}x",
  });
  adicionar(6, "409 mesmo ID divergente", {
    ...foto,
    dados: foto.dados.slice(1),
    total_registros: foto.total_registros - 1,
  });
  adicionar(6, "409 sequência antiga", {
    ...foto,
    id_envio: "123e4567-e89b-42d3-a456-426614176002",
  });
  adicionar(6, "422 campo desconhecido", { ...foto, campo_desconhecido: true });
  return {
    _type: "export",
    __export_format: 4,
    __export_date: "2026-11-01T00:00:00.000Z",
    __export_source: "repply-food",
    resources,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await writeFile(
    "docs/integracao-scc/insomnia-webhook-v2.json",
    `${JSON.stringify(criarColecao(), null, 2)}\n`,
    { flag: "wx" }
  );
}
