import {
  type Fotografia,
  type LinhaAuditoria,
  type LinhaRelatorio,
  RELATORIOS,
  type Relatorio,
} from "../../supabase/functions/_shared/relatorios/schemas.ts";

function linhas(dia: string): Record<Relatorio, LinhaRelatorio[]> {
  const momento = `${dia}T20:00:00-03:00`;
  const produto = {
    codigo_produto: "FICT-P1",
    produto: "Produto fictício A",
    codigo_pdv: "FICT-PDV",
    pdv: "Balcão fictício",
    codigo_grupo: "FICT-G",
    grupo: "Grupo fictício",
    codigo_garcom: "FICT-A",
    garcom: "Operador fictício A",
    mesa: 7,
    quantidade: "1.250",
    vendas: "16.25",
    custos: "4.00",
  };
  const evento: LinhaAuditoria = {
    tipo: "cancelamento_produto",
    momento,
    codigo_operador: "FICT-A",
    operador: "Operador fictício A",
    cartao_anterior: "FICT-E1",
    cartao_novo: null,
    codigo_produto: "FICT-P1",
    produto: "Produto fictício A",
    quantidade: "1",
    valor_unitario: "2.00",
    total: "2.00",
    limite_minimo_anterior: null,
    limite_minimo_novo: null,
    limite_maximo_anterior: null,
    limite_maximo_novo: null,
  };
  return {
    produtos: [
      produto,
      {
        ...produto,
        codigo_produto: "FICT-P2",
        produto: "Produto fictício B",
        quantidade: "1",
        vendas: "5.00",
        custos: null,
      },
    ],
    comissao: [
      {
        codigo_operador: "FICT-A",
        operador: "Operador fictício A",
        funcao: "Atendimento fictício",
        vendas_elegiveis: "80.00",
        comissao_oficial: "6.40",
      },
      {
        codigo_operador: "FICT-B",
        operador: "Operador fictício B",
        funcao: null,
        vendas_elegiveis: "20.00",
        comissao_oficial: null,
      },
    ],
    caixa: [
      {
        codigo_lancamento: "FICT-L1",
        momento,
        codigo_operador: "FICT-A",
        operador: "Operador fictício A",
        tipo: "credito",
        codigo_categoria: "FICT-C1",
        categoria: "Reforço fictício",
        valor: "50.00",
      },
      {
        codigo_lancamento: "FICT-L2",
        momento,
        codigo_operador: "FICT-B",
        operador: "Operador fictício B",
        tipo: "debito",
        codigo_categoria: "FICT-C2",
        categoria: "Retirada fictícia",
        valor: "12.50",
      },
    ],
    "notas-assinadas": [
      {
        codigo_nota: "FICT-N1",
        codigo_entrada: "FICT-E1",
        codigo_cliente: "FICT-CL1",
        valor: "12.25",
      },
      {
        codigo_nota: "FICT-N2",
        codigo_entrada: "FICT-E1",
        codigo_cliente: "FICT-CL1",
        valor: "7.75",
      },
    ],
    auditoria: [
      evento,
      { ...evento },
      { ...evento, tipo: "perda_cartao", cartao_novo: "FICT-E2" },
      {
        ...evento,
        tipo: "alteracao_limites",
        limite_maximo_anterior: "100.00",
        limite_maximo_novo: "150.00",
      },
      { ...evento, tipo: "exclusao_taxa_servico", total: "3.00" },
      { ...evento, tipo: "transferencia_produtos", cartao_novo: "FICT-E3" },
    ],
    financeiro: [
      {
        componentes: {
          consumo: "100.00",
          servico: "8.00",
          complemento: null,
          taxas_entrada: "10.00",
          produto_embutido: null,
          flyers: null,
        },
        totais_oficiais: {
          projetado: "118.00",
          recebido: "93.00",
          notas_assinadas: "20.00",
          descontos: "5.00",
        },
        entradas: {
          habilitados: 5,
          reabilitados: 0,
          encerrados: 3,
          abertos: null,
        },
        meios: [
          {
            codigo: "FICT-DIN",
            rotulo: "Dinheiro fictício",
            classe: "dinheiro",
            valor: "93.00",
          },
          {
            codigo: "FICT-NA",
            rotulo: "Notas fictícias",
            classe: "nota_assinada",
            valor: "20.00",
          },
        ],
        publico: [
          { sexo: "nao_informado", categoria: "pagante", quantidade: 5 },
        ],
      },
    ],
  };
}

function criarDia(dia: string, grupo: number, vazio = false): Fotografia[] {
  const dados = linhas(dia);
  return RELATORIOS.map((relatorio, indice) => ({
    manifesto: {
      versao_formato: 1,
      carga_id: `f1c71000-0000-4000-8000-${String(grupo * 100 + indice).padStart(12, "0")}`,
      relatorio,
      dia_movimento: dia,
      fonte: "historico",
      sequencia: "1",
      capturado_em: "2026-02-20T08:00:00-03:00",
      natureza: "simulacao",
      recursos: (
        {
          produtos: ["pdv", "grupo", "garcom", "mesa"],
          comissao: ["operador"],
          caixa: ["operador", "tipo", "categoria"],
          auditoria: ["operador", "tipo"],
          "notas-assinadas": ["cliente"],
          financeiro: [],
        } satisfies Record<Relatorio, string[]>
      )[relatorio],
    },
    linhas: vazio ? [] : dados[relatorio],
  }));
}

/** Dois dias completos; identidades fixas permitem repetir o mesmo arquivo. */
export function criarAmostras(): Fotografia[] {
  return [...criarDia("2026-02-14", 1), ...criarDia("2026-02-15", 2)];
}
/** Cenário separado: ausência explícita de movimento em todos os relatórios. */
export function criarDiaVazio(): Fotografia[] {
  return criarDia("2026-02-16", 3, true);
}
/** Cenário separado: somente produtos no primeiro e financeiro no segundo dia. */
export function criarPeriodoParcial(): Fotografia[] {
  return [
    ...criarDia("2026-02-17", 4).filter(
      (f) => f.manifesto.relatorio === "produtos"
    ),
    ...criarDia("2026-02-18", 5).filter(
      (f) => f.manifesto.relatorio === "financeiro"
    ),
  ];
}
