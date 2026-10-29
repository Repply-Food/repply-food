-- Instantes de evento dentro do domínio que os casts timestamptz consultivos suportam.
-- Substitui o validador mantendo sua assinatura e OID; captura conserva a validação própria.
begin;

create or replace function public.validar_linha_relatorio(p_relatorio text, p_linha jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  esquemas constant jsonb := '{
  "produtos": {
    "tipo": "objeto",
    "campos": {
      "codigo_produto": {"tipo": "codigo", "nulo": false},
      "produto": {"tipo": "rotulo", "nulo": false},
      "codigo_pdv": {"tipo": "codigo", "nulo": true},
      "codigo_grupo": {"tipo": "codigo", "nulo": true},
      "codigo_garcom": {"tipo": "codigo", "nulo": true},
      "pdv": {"tipo": "rotulo", "nulo": true},
      "grupo": {"tipo": "rotulo", "nulo": true},
      "garcom": {"tipo": "rotulo", "nulo": true},
      "mesa": {"tipo": "inteiro", "nulo": true},
      "quantidade": {"tipo": "decimal", "nulo": false},
      "vendas": {"tipo": "decimal", "nulo": false},
      "custos": {"tipo": "decimal", "nulo": true}
    }
  },
  "comissao": {
    "tipo": "objeto",
    "campos": {
      "codigo_operador": {"tipo": "codigo", "nulo": false},
      "operador": {"tipo": "rotulo", "nulo": true},
      "funcao": {"tipo": "rotulo80", "nulo": true},
      "vendas_elegiveis": {"tipo": "decimal", "nulo": false},
      "comissao_oficial": {"tipo": "decimal", "nulo": true}
    }
  },
  "caixa": {
    "tipo": "objeto",
    "campos": {"codigo_lancamento": {"tipo": "codigo", "nulo": false}, "codigo_categoria": {"tipo": "codigo", "nulo": false}, "momento": {"tipo": "instante", "nulo": false}, "codigo_operador": {"tipo": "codigo", "nulo": true}, "operador": {"tipo": "rotulo", "nulo": true}, "tipo": {"tipo": "enum", "valores": ["credito", "debito"]}, "categoria": {"tipo": "rotulo", "nulo": false}, "valor": {"tipo": "positivo", "nulo": false}}
  },
  "auditoria": {
    "tipo": "objeto",
    "campos": {"tipo": {"tipo": "enum", "valores": ["cancelamento_produto", "perda_cartao", "alteracao_limites", "exclusao_taxa_servico", "transferencia_produtos"]}, "momento": {"tipo": "instante", "nulo": false}, "codigo_operador": {"tipo": "codigo", "nulo": true}, "cartao_anterior": {"tipo": "codigo", "nulo": true}, "cartao_novo": {"tipo": "codigo", "nulo": true}, "codigo_produto": {"tipo": "codigo", "nulo": true}, "operador": {"tipo": "rotulo", "nulo": true}, "produto": {"tipo": "rotulo", "nulo": true}, "quantidade": {"tipo": "decimal", "nulo": true}, "valor_unitario": {"tipo": "decimal", "nulo": true}, "total": {"tipo": "decimal", "nulo": true}, "limite_minimo_anterior": {"tipo": "decimal", "nulo": true}, "limite_minimo_novo": {"tipo": "decimal", "nulo": true}, "limite_maximo_anterior": {"tipo": "decimal", "nulo": true}, "limite_maximo_novo": {"tipo": "decimal", "nulo": true}}
  },
  "notas-assinadas": {
    "tipo": "objeto",
    "campos": {
      "codigo_nota": {"tipo": "codigo", "nulo": false},
      "codigo_entrada": {"tipo": "codigo", "nulo": false},
      "codigo_cliente": {"tipo": "codigo", "nulo": false},
      "valor": {"tipo": "positivo", "nulo": false}
    }
  },
  "financeiro": {
    "tipo": "objeto",
    "campos": {
      "componentes": {
        "tipo": "objeto",
        "campos": {
          "consumo": {"tipo": "decimal", "nulo": true},
          "servico": {"tipo": "decimal", "nulo": true},
          "complemento": {"tipo": "decimal", "nulo": true},
          "taxas_entrada": {"tipo": "decimal", "nulo": true},
          "produto_embutido": {"tipo": "decimal", "nulo": true},
          "flyers": {"tipo": "decimal", "nulo": true}
        }
      },
      "totais_oficiais": {
        "tipo": "objeto",
        "campos": {
          "projetado": {"tipo": "decimal", "nulo": true},
          "recebido": {"tipo": "decimal", "nulo": true},
          "notas_assinadas": {"tipo": "decimal", "nulo": true},
          "descontos": {"tipo": "decimal", "nulo": true}
        }
      },
      "entradas": {
        "tipo": "objeto",
        "campos": {
          "habilitados": {"tipo": "inteiro", "nulo": true},
          "reabilitados": {"tipo": "inteiro", "nulo": true},
          "encerrados": {"tipo": "inteiro", "nulo": true},
          "abertos": {"tipo": "inteiro", "nulo": true}
        }
      },
      "meios": {
        "tipo": "lista",
        "item": {
          "tipo": "objeto",
          "campos": {
            "codigo": {"tipo": "codigo", "nulo": false},
            "rotulo": {"tipo": "rotulo", "nulo": false},
            "classe": {"tipo": "enum", "valores": ["dinheiro", "credito", "debito", "pix", "nota_assinada", "desconto", "outro"]},
            "valor": {"tipo": "decimal", "nulo": false}
          }
        },
        "maximo": 100
      },
      "publico": {
        "tipo": "lista",
        "item": {
          "tipo": "objeto",
          "campos": {
            "sexo": {"tipo": "enum", "valores": ["masculino", "feminino", "nao_informado"]},
            "categoria": {"tipo": "enum", "valores": ["pagante", "convidado", "lista", "camarote", "vip", "servico", "outro"]},
            "quantidade": {"tipo": "inteiro", "nulo": false}
          }
        },
        "maximo": 21
      }
    }
  }
}'::jsonb;
  fila jsonb;
  atual jsonb;
  regra jsonb;
  valor jsonb;
  campo record;
  item jsonb;
  texto text;
  tipo text;
  indice int := 0;
  chaves text[];
  esperadas text[];
  ano int;
  mes int;
  dia int;
  ultimo_dia int;
begin
  if p_relatorio is null or not (esquemas ? p_relatorio) or p_linha is null then
    raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
  end if;
  fila := jsonb_build_array(jsonb_build_object('valor',p_linha,'regra',esquemas->p_relatorio));
  while indice < jsonb_array_length(fila) loop
    atual := fila->indice;
    indice := indice + 1;
    regra := atual->'regra';
    valor := atual->'valor';
    tipo := regra->>'tipo';
    if valor = 'null'::jsonb and coalesce((regra->>'nulo')::boolean,false) then
      continue;
    end if;
    if tipo = 'objeto' then
      if jsonb_typeof(valor) is distinct from 'object' then
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
      select array_agg(k order by k) into chaves from jsonb_object_keys(valor) k;
      select array_agg(k order by k) into esperadas from jsonb_object_keys(regra->'campos') k;
      if chaves is distinct from esperadas then
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
      for campo in select key, value from jsonb_each(regra->'campos') loop
        fila := fila || jsonb_build_array(jsonb_build_object('valor',valor->campo.key,'regra',campo.value));
      end loop;
    elsif tipo = 'lista' then
      if jsonb_typeof(valor) is distinct from 'array' then
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
      if jsonb_array_length(valor) > (regra->>'maximo')::int then
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
      for item in select value from jsonb_array_elements(valor) loop
        fila := fila || jsonb_build_array(jsonb_build_object('valor',item,'regra',regra->'item'));
      end loop;
    elsif tipo = 'inteiro' then
      if jsonb_typeof(valor) is distinct from 'number' then
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
      texto := valor #>> '{}';
      -- Checa a expressão antes de converter; JSON 1.0 também representa inteiro.
      if texto !~ '^[0-9]+([.]0+)?$' then
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
      if texto::numeric > 2147483647 then
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
    else
      if jsonb_typeof(valor) is distinct from 'string' then
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
      texto := valor #>> '{}';
      if tipo in ('decimal','positivo') then
        if texto !~ '^-?[0-9]{1,14}([.][0-9]{1,6})?$'
          or (tipo = 'positivo' and left(texto,1) = '-') then
          raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
        end if;
      elsif tipo = 'codigo' then
        if char_length(texto) not between 1 and 80 or texto !~ '^[A-Za-z0-9_.-]+$' then
          raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
        end if;
      elsif tipo in ('rotulo','rotulo80') then
        if char_length(texto) not between 1 and (case when tipo = 'rotulo80' then 80 else 120 end)
          or texto ~ '[\x01-\x1f\x7f-\x9f]' then
          raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
        end if;
      elsif tipo = 'enum' then
        if not (regra->'valores' ? texto) then
          raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
        end if;
      elsif tipo = 'instante' then
        if substring(texto from 1 for 4) = '0000'
          or texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$' then
          raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
        end if;
        -- O momento é preservado em JSON, mas precisa ser seguro para os casts
        -- timestamptz da consulta: ano 0001..9999 e offset máximo ±15:59.
        ano := substring(texto from 1 for 4)::int;
        mes := substring(texto from 6 for 2)::int;
        dia := substring(texto from 9 for 2)::int;
        ultimo_dia := case
          when mes = 2 then case
            when ano % 400 = 0 or (ano % 4 = 0 and ano % 100 <> 0) then 29 else 28 end
          when mes in (4,6,9,11) then 30 else 31 end;
        if mes not between 1 and 12 or dia not between 1 and ultimo_dia then
          raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
        end if;
      else
        raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
      end if;
    end if;
  end loop;
  if p_relatorio = 'financeiro' and exists (
    select 1 from jsonb_array_elements(p_linha->'publico') celula
    group by celula->>'sexo', celula->>'categoria' having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
  end if;
exception when others then
  -- Não propagar mensagens de cast que possam conter o valor recebido.
  raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
end;
$$;

-- Interrompe aplicação caso dados anteriores tenham momentos que fariam os
-- casts da consulta falharem. O JSON preserva o texto recebido; não o reescreve.
do $$
begin
  if exists (
    select 1 from public.relatorio_linhas l
    where l.relatorio in ('caixa','auditoria')
      and ((l.dados->>'momento') is null
        or substring(l.dados->>'momento' from 1 for 4) = '0000'
        or (l.dados->>'momento') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-](0[0-9]|1[0-5]):[0-5][0-9])$')
  ) then
    raise exception 'momentos existentes fora do intervalo aceito pelo PostgreSQL';
  end if;
  perform (l.dados->>'momento')::timestamptz
  from public.relatorio_linhas l
  where l.relatorio in ('caixa','auditoria');
exception when others then
  raise exception 'momentos existentes não podem ser convertidos pelo PostgreSQL';
end;
$$;

create function relatorios_privados.caixa(
  p_casa uuid, p_filtros jsonb, p_pagina int, p_tamanho int
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,'caixa',p_filtros,p_pagina,p_tamanho);
  with casa as materialized (
    select fuso from public.restaurantes where id = p_casa
  ), filtradas as materialized (
    select l.dados, l.dia_movimento, l.posicao,
      (l.dados->>'momento')::timestamptz instante,
      ((l.dados->>'momento')::timestamptz at time zone c.fuso)::date dia_civil
    from public.relatorio_linhas l cross join casa c
    where l.restaurante_id = p_casa and l.relatorio = 'caixa'
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'operador') or l.dados->>'codigo_operador' = p_filtros->>'operador')
      and (not (p_filtros ? 'tipo') or l.dados->>'tipo' = p_filtros->>'tipo')
      and (not (p_filtros ? 'categoria') or l.dados->>'tipo' || ':' || (l.dados->>'codigo_categoria') = p_filtros->>'categoria')
  ), resumo as (
    select coalesce(round(sum((dados->>'valor')::numeric(20,6)) filter (where dados->>'tipo' = 'credito'),2)::text,'0.00') creditos,
      coalesce(round(sum((dados->>'valor')::numeric(20,6)) filter (where dados->>'tipo' = 'debito'),2)::text,'0.00') debitos,
      coalesce(round(sum(case dados->>'tipo' when 'credito' then (dados->>'valor')::numeric(20,6)
        else -(dados->>'valor')::numeric(20,6) end),2)::text,'0.00') saldo,
      count(*) total_linhas
    from filtradas
  ), pagina as (
    select * from filtradas
    order by (dados->>'codigo_operador') collate "C" nulls last, dia_civil,
      instante, (dados->>'codigo_lancamento') collate "C" nulls last, posicao
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'codigoLancamento',dados->>'codigo_lancamento',
      'diaMovimento',to_char(dia_movimento,'YYYY-MM-DD'),
      'diaCivil',to_char(dia_civil,'YYYY-MM-DD'),
      'momento',dados->>'momento','codigoOperador',dados->>'codigo_operador',
      'operador',dados->>'operador','tipo',dados->>'tipo',
      'codigoCategoria',dados->>'codigo_categoria','categoria',dados->>'categoria',
      'valor',dados->>'valor') order by
        (dados->>'codigo_operador') collate "C" nulls last, dia_civil,
        instante, (dados->>'codigo_lancamento') collate "C" nulls last, posicao),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('creditos',creditos,'debitos',debitos,'saldo',saldo),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',total_linhas)
  ) into resultado from resumo;
  return resultado;
end;
$$;

create function relatorios_privados.auditoria(
  p_casa uuid, p_filtros jsonb, p_pagina int, p_tamanho int
) returns jsonb
language plpgsql stable security invoker
set search_path = pg_catalog, public, relatorios_privados
as $$
declare resultado jsonb;
begin
  perform relatorios_privados.validar_consulta(p_casa,'auditoria',p_filtros,p_pagina,p_tamanho);
  with filtradas as materialized (
    select l.dados, l.dia_movimento, l.posicao,
      (l.dados->>'momento')::timestamptz instante
    from public.relatorio_linhas l
    where l.restaurante_id = p_casa and l.relatorio = 'auditoria'
      and l.fonte = p_filtros->>'fonte'
      and l.dia_movimento between (p_filtros->>'inicio')::date and (p_filtros->>'fim')::date
      and (not (p_filtros ? 'operador') or l.dados->>'codigo_operador' = p_filtros->>'operador')
      and (not (p_filtros ? 'tipo') or l.dados->>'tipo' = p_filtros->>'tipo')
  ), por_tipo as (
    select dados->>'tipo' tipo, count(*) ocorrencias,
      case when dados->>'tipo' <> 'cancelamento_produto' then null
        when count(*) filter (where dados->>'quantidade' is null) > 0 then null
        else coalesce(sum((dados->>'quantidade')::numeric(20,6)),0) end quantidade,
      case when dados->>'tipo' <> 'cancelamento_produto' then null
        when count(*) filter (where dados->>'total' is null) > 0 then null
        else coalesce(round(sum((dados->>'total')::numeric(20,6)),2),0) end total
    from filtradas group by dados->>'tipo'
  ), resumo as (
    select coalesce(sum(ocorrencias),0) ocorrencias,
      coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'ocorrencias',ocorrencias,
        'quantidade',quantidade::text,'total',total::text) order by tipo collate "C"),'[]'::jsonb) por_tipo
    from por_tipo
  ), pagina as (
    select * from filtradas
    order by (dados->>'tipo') collate "C", instante,
      (dados->>'codigo_operador') collate "C" nulls last, dia_movimento, posicao
    offset (p_pagina::bigint - 1) * p_tamanho limit p_tamanho
  )
  select jsonb_build_object(
    'linhas',(select coalesce(jsonb_agg(jsonb_build_object(
      'tipo',dados->>'tipo','momento',dados->>'momento',
      'codigoOperador',dados->>'codigo_operador','operador',dados->>'operador',
      'cartaoAnterior',dados->>'cartao_anterior','cartaoNovo',dados->>'cartao_novo',
      'codigoProduto',dados->>'codigo_produto','produto',dados->>'produto',
      'quantidade',dados->>'quantidade','valorUnitario',dados->>'valor_unitario',
      'total',dados->>'total','limiteMinimoAnterior',dados->>'limite_minimo_anterior',
      'limiteMinimoNovo',dados->>'limite_minimo_novo',
      'limiteMaximoAnterior',dados->>'limite_maximo_anterior',
      'limiteMaximoNovo',dados->>'limite_maximo_novo',
      'diaMovimento',to_char(dia_movimento,'YYYY-MM-DD')) order by
        (dados->>'tipo') collate "C", instante,
        (dados->>'codigo_operador') collate "C" nulls last, dia_movimento, posicao),'[]'::jsonb) from pagina),
    'resumo',jsonb_build_object('ocorrencias',ocorrencias,'porTipo',por_tipo),
    'paginacao',jsonb_build_object('pagina',p_pagina,'tamanho',p_tamanho,'totalLinhas',ocorrencias)
  ) into resultado from resumo;
  return resultado;
end;
$$;

revoke all on function relatorios_privados.caixa(uuid,jsonb,int,int) from public, anon, authenticated, service_role;
revoke all on function relatorios_privados.auditoria(uuid,jsonb,int,int) from public, anon, authenticated, service_role;
grant execute on function relatorios_privados.caixa(uuid,jsonb,int,int) to authenticated;
grant execute on function relatorios_privados.auditoria(uuid,jsonb,int,int) to authenticated;

commit;
