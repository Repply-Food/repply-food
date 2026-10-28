-- Validação defensiva independente do TypeScript. Nunca inclui a linha no erro.
begin;
create function public.validar_linha_relatorio(p_relatorio text, p_linha jsonb)
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
        if texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]+)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then
          raise exception using errcode = '22023', message = 'linha_relatorio_invalida';
        end if;
        -- O contrato aceita ano 0000 e offsets ISO até 23:59. O JSON é
        -- preservado, portanto não estreitar o domínio com cast timestamptz.
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
revoke all on function public.validar_linha_relatorio(text,jsonb) from public, anon, authenticated;
grant execute on function public.validar_linha_relatorio(text,jsonb) to service_role;
commit;
