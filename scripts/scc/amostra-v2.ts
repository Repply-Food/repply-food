import type { EnvioSccV2 } from "../../supabase/functions/_shared/scc/schemas";

function criar(correcao: boolean): EnvioSccV2[] {
  const base = (indice: number) => ({
    versao_formato: 2 as const,
    versao_scc: "smoke-v2",
    enviado_em: "2026-11-01T15:00:00-03:00",
    id_envio: `123e4567-e89b-42d3-a456-4266141740${correcao ? "1" : "0"}${indice}`,
    sequencia: correcao ? "2" : "1",
    natureza: "simulacao" as const,
    pagina: { numero: 1, total: 1 },
  });
  const foto = {
    modo: "fotografia" as const,
    dia_movimento: "2026-11-01",
    fonte: "online" as const,
    recursos: [],
  };
  const comumEntrada = {
    DataEntrada: "2026-11-01",
    HoraEntrada: "12:00:00",
    DataSaida: "2026-11-01",
    HoraSaida: "14:00:00",
    ValorAcrescimos: "0.00",
    Complemento: "0.00",
    Pago: true,
    NumeroOcupantes: 2,
    TipoOcupacao: "Mesa",
    TipoCartao: "Mesa",
  };
  const item = (
    codigo_entrada: string,
    ordinal: number,
    codigo_produto: string,
    produto: string,
    quantidade: string,
    vendas: string,
    custos: string
  ) => ({
    codigo_entrada,
    ordinal,
    codigo_produto,
    produto,
    quantidade,
    vendas,
    custos,
    codigo_pdv: "PDV1",
    pdv: "Salão",
    codigo_grupo: "G1",
    grupo: "Produtos",
    codigo_garcom: codigo_entrada,
    garcom: `Operador ${codigo_entrada}`,
    mesa: Number(codigo_entrada),
  });
  const evento = {
    tipo: "cancelamento_produto" as const,
    momento: "2026-11-01T13:00:00-03:00",
    codigo_operador: "1",
    operador: "Operador 1",
    cartao_anterior: "1",
    cartao_novo: null,
    codigo_produto: "P100",
    produto: "Prato",
    quantidade: "1",
    valor_unitario: "25.00",
    total: "25.00",
    limite_minimo_anterior: null,
    limite_minimo_novo: null,
    limite_maximo_anterior: null,
    limite_maximo_novo: null,
  };
  const produto = (codigo_produto: string, nome: string, custo: string) => ({
    codigo_produto,
    produto: nome,
    codigo_grupo: "G1",
    grupo: "Produtos",
    preco_custo_atual: custo,
    ativo: true,
    alterado_em: "2026-11-01T10:00:00-03:00",
  });
  return [
    {
      ...base(1),
      tipo_envio: "entradas",
      modo: "janela",
      janela: { desde: "2026-11-01", ate: "2026-11-01" },
      total_registros: 2,
      dados: [
        {
          ...comumEntrada,
          codEntrada: 1,
          ValorItens: "66.00",
          ValorDescontos: "0.00",
          TaxaServico: "6.60",
          ValorConsumido: "72.60",
          codCartaoMesa: 1,
          CodGarcon: 1,
          codOperadorHab: 1,
          codOperadorDesab: 1,
          codCliente: null,
        },
        {
          ...comumEntrada,
          codEntrada: 2,
          ValorItens: "43.00",
          ValorDescontos: correcao ? "5.00" : "3.00",
          TaxaServico: correcao ? "3.80" : "4.00",
          ValorConsumido: correcao ? "41.80" : "44.00",
          codCartaoMesa: 2,
          CodGarcon: 2,
          codOperadorHab: 2,
          codOperadorDesab: 2,
          codCliente: 1,
        },
      ],
    },
    {
      ...base(2),
      tipo_envio: "cadastro_produtos",
      modo: "incremental",
      total_registros: 3,
      dados: [
        produto("P100", "Prato", "10.00"),
        produto("P200", "Bebida", "3.00"),
        produto("P300", "Sobremesa", "5.00"),
      ],
    },
    {
      ...base(3),
      ...foto,
      tipo_envio: "itens_vendidos",
      total_registros: 4,
      dados: [
        item("1", 1, "P100", "Prato", "2", "49.00", "20.00"),
        item("1", 2, "P300", "Sobremesa", "1", "17.00", "5.00"),
        item("2", 1, "P100", "Prato", "1", "24.00", "10.00"),
        item(
          "2",
          2,
          "P200",
          "Bebida",
          "2",
          correcao ? "14.00" : "16.00",
          "6.00"
        ),
      ],
    },
    {
      ...base(4),
      ...foto,
      tipo_envio: "comissoes",
      total_registros: 2,
      dados: [
        {
          codigo_operador: "1",
          operador: "Operador 1",
          funcao: "Garçom",
          vendas_elegiveis: "66.00",
          comissao_oficial: "6.60",
        },
        {
          codigo_operador: "2",
          operador: "Operador 2",
          funcao: "Garçom",
          vendas_elegiveis: correcao ? "38.00" : "40.00",
          comissao_oficial: correcao ? "3.80" : "4.00",
        },
      ],
    },
    {
      ...base(5),
      ...foto,
      tipo_envio: "movimentos_caixa",
      total_registros: 2,
      dados: [
        {
          codigo_lancamento: "C1",
          momento: "2026-11-01T14:00:00-03:00",
          codigo_operador: "1",
          operador: "Operador 1",
          tipo: "credito",
          codigo_categoria: "VENDA",
          categoria: "Venda",
          valor: correcao ? "94.40" : "106.00",
        },
        {
          codigo_lancamento: "D1",
          momento: "2026-11-01T14:10:00-03:00",
          codigo_operador: "2",
          operador: "Operador 2",
          tipo: "debito",
          codigo_categoria: "DESPESA",
          categoria: "Despesa",
          valor: "12.50",
        },
      ],
    },
    {
      ...base(6),
      ...foto,
      tipo_envio: "eventos_auditoria",
      total_registros: 6,
      dados: [
        evento,
        { ...evento },
        {
          ...evento,
          tipo: "perda_cartao",
          codigo_produto: null,
          produto: null,
          quantidade: null,
          valor_unitario: null,
          total: null,
        },
        {
          ...evento,
          tipo: "alteracao_limites",
          limite_minimo_anterior: "0.00",
          limite_minimo_novo: "5.00",
        },
        { ...evento, tipo: "exclusao_taxa_servico" },
        { ...evento, tipo: "transferencia_produtos", cartao_novo: "2" },
      ],
    },
    {
      ...base(7),
      ...foto,
      tipo_envio: "notas_assinadas",
      total_registros: 1,
      dados: [
        {
          codigo_nota: "N1",
          codigo_entrada: "2",
          codigo_cliente: "1",
          valor: "20.00",
        },
      ],
    },
    {
      ...base(8),
      ...foto,
      tipo_envio: "financeiro",
      total_registros: 1,
      dados: [
        {
          componentes: {
            consumo: correcao ? "104.00" : "106.00",
            servico: correcao ? "10.40" : "10.60",
            complemento: "0.00",
            taxas_entrada: "0.00",
            produto_embutido: "0.00",
            flyers: "0.00",
          },
          totais_oficiais: {
            projetado: correcao ? "114.40" : "116.60",
            recebido: correcao ? "94.40" : "96.60",
            notas_assinadas: "20.00",
            descontos: correcao ? "5.00" : "3.00",
          },
          entradas: {
            habilitados: 2,
            reabilitados: 0,
            encerrados: 2,
            abertos: 0,
          },
          meios: [
            {
              codigo: "DIN",
              rotulo: "Dinheiro",
              classe: "dinheiro",
              valor: "50.00",
            },
            {
              codigo: "PIX",
              rotulo: "Pix",
              classe: "pix",
              valor: correcao ? "44.40" : "46.60",
            },
            {
              codigo: "NOTA",
              rotulo: "Nota assinada",
              classe: "nota_assinada",
              valor: "20.00",
            },
          ],
          publico: [
            { sexo: "nao_informado", categoria: "pagante", quantidade: 4 },
          ],
        },
      ],
    },
  ];
}

export function criarAmostrasV2(): EnvioSccV2[] {
  return criar(false);
}
export function criarCorrecaoV2(): EnvioSccV2[] {
  return criar(true);
}
