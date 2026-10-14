-- A segunda barreira também exige valor simples nas 20 colunas, e o nome de
-- campo só é guardado se começar com letra (D-29, D-51).
--
-- A 20261013130000 mantinha uma coluna do contrato com QUALQUER valor: quem
-- chamasse processar_envio direto (só o service_role pode) com um objeto em
-- TipoOcupacao, TipoCartao, Pago, DataSaida ou HoraSaida gravava o objeto em
-- entradas e em envios.payload. Agora coluna com valor composto sai em
-- silêncio, igual à recepção em TypeScript (campos-permitidos.ts), e não vira
-- nome em campos_desconhecidos. E um nome só de dígitos (um CPF ou telefone
-- usado como nome de campo) deixa de passar como "nome seguro".
-- O corpo é o mesmo da 20261013130000; só mudam o filtro do passo 4 e a
-- expressão do nome.
begin;

create or replace function public.processar_envio(
  p_restaurante_id uuid,
  p_envelope jsonb,
  p_campos_desconhecidos text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  -- A mesma lista de supabase/functions/_shared/campos-permitidos.ts.
  c_colunas  constant text[] := array[
    'codEntrada', 'DataEntrada', 'HoraEntrada', 'DataSaida', 'HoraSaida',
    'ValorItens', 'ValorDescontos', 'ValorAcrescimos', 'TaxaServico',
    'Complemento', 'ValorConsumido', 'Pago', 'codCartaoMesa', 'CodGarcon',
    'codOperadorHab', 'codOperadorDesab', 'codCliente', 'NumeroOcupantes',
    'TipoOcupacao', 'TipoCartao'
  ];
  c_extras   constant text[] := array[
    'Reabilitado', 'Flyer', 'ConferenciaDeMesa', 'HabilitacaoAutomatica',
    'DesabilitacaoAutomatica', 'LimiteMinimo', 'LimiteMaximo', 'ECF', 'CER', 'COO'
  ];
  c_pessoais constant text[] := array['NomeCliente', 'RG', 'FoneCliente', 'Sexo'];

  v_inicio        timestamptz := clock_timestamp();
  v_fuso          text;
  v_virada        time;
  v_intervalo     int;
  v_pedido        date;
  v_desde         date;
  v_ate           date;
  v_brutas        jsonb;
  v_entradas      jsonb;
  v_desconhecidos text[];
  v_item          jsonb;
  v_cods          bigint[] := '{}'::bigint[];
  v_cod           bigint;
  v_aberta_em     timestamptz;
  v_fechada_em    timestamptz;
  v_dia           date;
  v_pago          boolean;
  v_extras        jsonb;
  v_hash          text;
  v_hash_gravado  text;
  v_removida      boolean := false;
  v_recebidas     int := 0;
  v_gravadas      int := 0;
  v_inalteradas   int := 0;
  v_removidas     int := 0;
  v_modo          text;
  v_versao        int;
  v_versao_scc    text;
  v_reenviar      date;
  v_duracao       int;
begin
  -- 1. trava por restaurante: dois envios simultâneos entram em fila
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text, 0));

  -- 2. contexto do restaurante (o id vem do token, nunca do corpo)
  select fuso, hora_virada, intervalo_envio_segundos, pedido_reenvio_desde
    into v_fuso, v_virada, v_intervalo, v_pedido
    from public.restaurantes
   where id = p_restaurante_id;
  if not found then
    raise exception 'restaurante inexistente';
  end if;

  -- 3. janela e metadados do envelope
  --    (modo e versao_scc viram coluna de texto: só valor simples, nunca um objeto)
  v_desde      := (p_envelope -> 'janela' ->> 'desde')::date;
  v_ate        := (p_envelope -> 'janela' ->> 'ate')::date;
  v_modo       := public.so_valor_simples(p_envelope -> 'modo') #>> '{}';
  v_versao     := (p_envelope ->> 'versao_formato')::int;
  v_versao_scc := public.so_valor_simples(p_envelope -> 'versao_scc') #>> '{}';

  -- 4. só entra o que está na lista, e com valor simples (D-29, D-51),
  --    ANTES de qualquer gravação
  v_brutas := case
    when jsonb_typeof(p_envelope -> 'entradas') = 'array' then p_envelope -> 'entradas'
    else '[]'::jsonb
  end;

  select coalesce(jsonb_agg(
           (select coalesce(jsonb_object_agg(c.chave, c.valor), '{}'::jsonb)
              from jsonb_each(b.item) as c(chave, valor)
             where (c.chave = any (c_colunas) or c.chave = any (c_extras))
               and public.so_valor_simples(c.valor) is not null)
           order by b.ordem), '[]'::jsonb)
    into v_entradas
    from jsonb_array_elements(v_brutas) with ordinality as b(item, ordem)
   where jsonb_typeof(b.item) = 'object';

  -- nomes do que foi descartado por não estar na lista (os pessoais saem em
  -- silêncio, e coluna com valor composto também: a recepção responde 422)
  select coalesce(array_agg(distinct c.chave), '{}')
    into v_desconhecidos
    from jsonb_array_elements(v_brutas) as b(item)
    cross join lateral jsonb_each(
      case when jsonb_typeof(b.item) = 'object' then b.item else '{}'::jsonb end
    ) as c(chave, valor)
   where not (c.chave = any (c_colunas))
     and not (c.chave = any (c_pessoais))
     and not (c.chave = any (c_extras)
              and public.so_valor_simples(c.valor) is not null);

  -- junta com os nomes que a recepção já achou; nome estranho não é guardado
  -- (precisa começar com letra: um CPF ou telefone como nome de campo não passa)
  select coalesce(array_agg(n.nome order by n.nome collate "C"), '{}')
    into v_desconhecidos
    from (
      select m.nome
        from (
          select distinct
                 case when u.bruto ~ '^[A-Za-z][A-Za-z0-9_.]{0,39}$' then u.bruto
                      else '(nome fora do padrão)'
                 end as nome
            from unnest(coalesce(p_campos_desconhecidos, '{}') || v_desconhecidos) as u(bruto)
        ) as m
       order by m.nome collate "C"
       limit 20
    ) as n;

  v_recebidas := jsonb_array_length(v_entradas);

  -- 5. normaliza e faz o upsert de cada entrada
  for v_item in select * from jsonb_array_elements(v_entradas) loop
    v_cod := (v_item ->> 'codEntrada')::bigint;
    v_cods := v_cods || v_cod;

    -- data + hora local do restaurante -> timestamptz
    v_aberta_em := ((v_item ->> 'DataEntrada')::date + (v_item ->> 'HoraEntrada')::time)
                   at time zone v_fuso;

    if (v_item ->> 'DataSaida') is not null and (v_item ->> 'HoraSaida') is not null then
      v_fechada_em := ((v_item ->> 'DataSaida')::date + (v_item ->> 'HoraSaida')::time)
                      at time zone v_fuso;
    else
      v_fechada_em := null;
    end if;

    v_dia := public.dia_operacao_de(v_aberta_em, v_fuso, v_virada);

    -- "Sim"/"S"/"true"/"1" -> true; "Não"/"Nao"/"N"/"false"/"0" -> false
    v_pago := lower(btrim(coalesce(v_item ->> 'Pago', 'false'))) in
              ('sim', 's', 'true', '1');

    -- extras: só os conhecidos (H3, B17); o resto já foi descartado no passo 4
    select coalesce(jsonb_object_agg(c.chave, c.valor), '{}'::jsonb)
      into v_extras
      from jsonb_each(v_item) as c(chave, valor)
     where c.chave = any (c_extras);

    -- hash idempotente: o mesmo conteúdo lógico produz o mesmo hash
    v_hash := md5(jsonb_build_object(
      'codEntrada', v_cod,
      'aberta_em', v_aberta_em,
      'fechada_em', v_fechada_em,
      'dia_operacao', v_dia,
      'cod_cartao_mesa', btrim_null((v_item ->> 'codCartaoMesa')::text),
      'cod_garcom', btrim_null((v_item ->> 'CodGarcon')::text),
      'cod_cliente', btrim_null((v_item ->> 'codCliente')::text),
      'cod_operador_abertura', btrim_null((v_item ->> 'codOperadorHab')::text),
      'cod_operador_fechamento', btrim_null((v_item ->> 'codOperadorDesab')::text),
      'valor_itens', normaliza_numeric(v_item ->> 'ValorItens'),
      'valor_descontos', normaliza_numeric(v_item ->> 'ValorDescontos'),
      'valor_acrescimos', normaliza_numeric(v_item ->> 'ValorAcrescimos'),
      'taxa_servico', normaliza_numeric(v_item ->> 'TaxaServico'),
      'complemento', normaliza_numeric(v_item ->> 'Complemento'),
      'valor_consumido', normaliza_numeric(v_item ->> 'ValorConsumido'),
      'pago', v_pago,
      'numero_ocupantes', btrim_null((v_item ->> 'NumeroOcupantes')::text),
      'tipo_ocupacao', btrim(coalesce(v_item ->> 'TipoOcupacao', '')),
      'tipo_cartao', btrim(coalesce(v_item ->> 'TipoCartao', '')),
      'extras', v_extras
    )::text);

    -- já existe? compara o hash
    select e.hash_origem, e.removida_em is not null
      into v_hash_gravado, v_removida
      from public.entradas e
     where e.restaurante_id = p_restaurante_id and e.cod_entrada = v_cod
     for update;

    if v_hash_gravado = v_hash then
      -- mesmo conteúdo: se estava removida e voltou, volta a aparecer
      if v_removida then
        update public.entradas
           set removida_em = null, atualizada_em = now()
         where restaurante_id = p_restaurante_id and cod_entrada = v_cod;
      end if;
      v_inalteradas := v_inalteradas + 1;
    else
      insert into public.entradas (
        restaurante_id, cod_entrada, cod_cartao_mesa, cod_garcom, cod_cliente,
        cod_operador_abertura, cod_operador_fechamento, aberta_em, fechada_em,
        dia_operacao, valor_itens, valor_descontos, valor_acrescimos, taxa_servico,
        complemento, valor_consumido, pago, numero_ocupantes, tipo_ocupacao,
        tipo_cartao, extras, hash_origem
      ) values (
        p_restaurante_id, v_cod,
        (v_item ->> 'codCartaoMesa')::int,
        (v_item ->> 'CodGarcon')::int,
        (v_item ->> 'codCliente')::int,
        (v_item ->> 'codOperadorHab')::int,
        (v_item ->> 'codOperadorDesab')::int,
        v_aberta_em, v_fechada_em, v_dia,
        round(coalesce((v_item ->> 'ValorItens')::numeric, 0), 2),
        round(coalesce((v_item ->> 'ValorDescontos')::numeric, 0), 2),
        round(coalesce((v_item ->> 'ValorAcrescimos')::numeric, 0), 2),
        round(coalesce((v_item ->> 'TaxaServico')::numeric, 0), 2),
        round(coalesce((v_item ->> 'Complemento')::numeric, 0), 2),
        round(coalesce((v_item ->> 'ValorConsumido')::numeric, 0), 2),
        v_pago,
        (v_item ->> 'NumeroOcupantes')::int,
        btrim(v_item ->> 'TipoOcupacao'),
        btrim(v_item ->> 'TipoCartao'),
        v_extras, v_hash
      )
      on conflict (restaurante_id, cod_entrada) do update set
        cod_cartao_mesa          = excluded.cod_cartao_mesa,
        cod_garcom               = excluded.cod_garcom,
        cod_cliente              = excluded.cod_cliente,
        cod_operador_abertura    = excluded.cod_operador_abertura,
        cod_operador_fechamento  = excluded.cod_operador_fechamento,
        aberta_em                = excluded.aberta_em,
        fechada_em               = excluded.fechada_em,
        dia_operacao             = excluded.dia_operacao,
        valor_itens              = excluded.valor_itens,
        valor_descontos          = excluded.valor_descontos,
        valor_acrescimos         = excluded.valor_acrescimos,
        taxa_servico             = excluded.taxa_servico,
        complemento              = excluded.complemento,
        valor_consumido          = excluded.valor_consumido,
        pago                     = excluded.pago,
        numero_ocupantes         = excluded.numero_ocupantes,
        tipo_ocupacao            = excluded.tipo_ocupacao,
        tipo_cartao              = excluded.tipo_cartao,
        extras                   = excluded.extras,
        hash_origem              = excluded.hash_origem,
        removida_em              = null,               -- voltou (reapareceu na janela)
        atualizada_em            = now();
      v_gravadas := v_gravadas + 1;
    end if;
  end loop;

  -- 6. reconciliação: o que pertence à janela (ou está aberto) e não veio, marca removido
  update public.entradas e
     set removida_em = now(), atualizada_em = now()
   where e.restaurante_id = p_restaurante_id
     and e.removida_em is null
     and not (e.cod_entrada = any (v_cods))
     and (
       e.fechada_em is null
       or (e.aberta_em at time zone v_fuso)::date between v_desde and v_ate
       or (e.fechada_em at time zone v_fuso)::date between v_desde and v_ate
     );
  get diagnostics v_removidas = row_count;

  -- 7. sinal de vida
  insert into public.sinal_de_vida (restaurante_id, primeiro_envio_em, ultimo_envio_em, ultimo_envio_ok_em)
  values (p_restaurante_id, now(), now(), now())
  on conflict (restaurante_id) do update set
    ultimo_envio_em    = now(),
    ultimo_envio_ok_em = now(),
    primeiro_envio_em  = coalesce(sinal_de_vida.primeiro_envio_em, now());

  -- 8. marca o uso do token (todos os válidos do restaurante são dele)
  update public.tokens_envio
     set ultimo_uso_em = now()
   where restaurante_id = p_restaurante_id
     and revogado_em is null
     and (expira_em is null or expira_em > now());

  -- 9. pedido de reenvio: se a janela já cobriu a data pedida, limpa
  if v_pedido is not null and v_desde <= v_pedido then
    update public.restaurantes set pedido_reenvio_desde = null where id = p_restaurante_id;
  else
    v_reenviar := v_pedido;
  end if;

  -- 10. resumo do envio: o JSON guardado é remontado só com o que está na lista
  v_duracao := greatest(1, round(extract(epoch from (clock_timestamp() - v_inicio)) * 1000)::int);

  insert into public.envios (
    restaurante_id, http_status, modo, versao_formato, versao_scc,
    janela_desde, janela_ate, recebidas, gravadas, inalteradas, removidas,
    payload, campos_desconhecidos, duracao_ms
  ) values (
    p_restaurante_id, 200, v_modo, v_versao, v_versao_scc,
    v_desde, v_ate, v_recebidas, v_gravadas, v_inalteradas, v_removidas,
    jsonb_build_object(
      'versao_formato', public.so_valor_simples(p_envelope -> 'versao_formato'),
      'versao_scc', public.so_valor_simples(p_envelope -> 'versao_scc'),
      'enviado_em', public.so_valor_simples(p_envelope -> 'enviado_em'),
      'modo', public.so_valor_simples(p_envelope -> 'modo'),
      'janela', jsonb_build_object(
        'desde', public.so_valor_simples(p_envelope -> 'janela' -> 'desde'),
        'ate', public.so_valor_simples(p_envelope -> 'janela' -> 'ate')
      ),
      'lote', jsonb_build_object(
        'numero', public.so_valor_simples(p_envelope -> 'lote' -> 'numero'),
        'total', public.so_valor_simples(p_envelope -> 'lote' -> 'total')
      ),
      'entradas', v_entradas
    ),
    v_desconhecidos, v_duracao
  );

  if v_reenviar is not null then
    return jsonb_build_object(
      'recebidas', v_recebidas,
      'gravadas', v_gravadas,
      'inalteradas', v_inalteradas,
      'removidas', v_removidas,
      'janela_confirmada', jsonb_build_object('desde', v_desde, 'ate', v_ate),
      'proximo_envio_em_segundos', v_intervalo,
      'reenviar_desde', v_reenviar
    );
  end if;

  return jsonb_build_object(
    'recebidas', v_recebidas,
    'gravadas', v_gravadas,
    'inalteradas', v_inalteradas,
    'removidas', v_removidas,
    'janela_confirmada', jsonb_build_object('desde', v_desde, 'ate', v_ate),
    'proximo_envio_em_segundos', v_intervalo
  );
end;
$$;

revoke execute on function public.processar_envio(uuid, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.processar_envio(uuid, jsonb, text[]) to service_role;

commit;
