-- Vigia do sinal de vida: não para por causa de um cadastro ruim e não conta
-- como atraso o tempo em que a casa estava fechada.
--
-- Três correções em relação à fundação:
--   1. cada restaurante é calculado isolado: horário ou fuso malformado em um
--      não derruba o cálculo dos outros;
--   2. o atraso conta do que for mais recente: o último envio sem erro OU a
--      abertura da casa. Sem isso, o restaurante que desliga o computador à
--      noite aparecia "parado" no minuto em que abria;
--   3. o esboço do alarme sai daqui. Ele marcava "avisado" sem ter enviado,
--      avisava "voltou" quando a casa fechava e chamava, sem identificação,
--      uma função que não existe. O alarme de verdade é uma rotina própria
--      (divida-tecnica.md, item do alarme por e-mail).
begin;

-- Abertura do intervalo de funcionamento que contém p_momento; null se fechado.
-- horario_funcionamento: [{ "dia": 5, "abre": "11:00", "fecha": "02:00" }, ...],
-- com 0 = domingo. Se fecha <= abre, o intervalo atravessa a meia-noite
-- (abre = fecha significa 24 horas).
create function public.abertura_do_intervalo(
  p_horario jsonb,
  p_fuso text,
  p_momento timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_local    timestamp := p_momento at time zone p_fuso;
  v_dia      int       := extract(dow from v_local)::int;
  v_hora     time      := v_local::time;
  v_item     jsonb;
  v_dia_abre int;
  v_abre     time;
  v_fecha    time;
begin
  for v_item in select * from jsonb_array_elements(p_horario) loop
    v_dia_abre := (v_item ->> 'dia')::int;
    v_abre     := (v_item ->> 'abre')::time;
    v_fecha    := (v_item ->> 'fecha')::time;

    if v_fecha > v_abre then
      if v_dia = v_dia_abre and v_hora >= v_abre and v_hora < v_fecha then
        return (v_local::date + v_abre) at time zone p_fuso;
      end if;
    else
      if v_dia = v_dia_abre and v_hora >= v_abre then
        return (v_local::date + v_abre) at time zone p_fuso;
      end if;
      if v_dia = (v_dia_abre + 1) % 7 and v_hora < v_fecha then
        return ((v_local::date - 1) + v_abre) at time zone p_fuso;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

-- Desde quando a casa está aberta sem interrupção.
--   null       = fechada agora;
--   -infinity  = sem horário configurado: desconhecido nunca é "fechado";
--   momento    = abertura do expediente atual. Intervalos colados (um termina
--                quando o outro começa, ou casa 24 h) contam como um só.
create function public.aberto_desde(
  p_horario jsonb,
  p_fuso text,
  p_agora timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_desde    timestamptz;
  v_anterior timestamptz;
begin
  if p_horario is null
     or jsonb_typeof(p_horario) <> 'array'
     or jsonb_array_length(p_horario) = 0 then
    return '-infinity'::timestamptz;
  end if;

  v_desde := public.abertura_do_intervalo(p_horario, p_fuso, p_agora);
  if v_desde is null then
    return null;
  end if;

  for v_passo in 1..8 loop
    v_anterior := public.abertura_do_intervalo(
      p_horario, p_fuso, v_desde - interval '1 second'
    );
    exit when v_anterior is null;
    v_desde := v_anterior;
  end loop;

  return v_desde;
end;
$$;

create or replace function public.atualizar_estados()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rec    record;
  v_estado text;
  v_delta  interval;
  v_desde  timestamptz;
begin
  for v_rec in
    select s.restaurante_id, s.primeiro_envio_em, s.ultimo_envio_ok_em,
           s.estado as estado_atual, r.fuso, r.horario_funcionamento
      from public.sinal_de_vida s
      join public.restaurantes r on r.id = s.restaurante_id
  loop
    begin
      if v_rec.primeiro_envio_em is null then
        v_estado := 'aguardando';
      else
        v_desde := public.aberto_desde(v_rec.horario_funcionamento, v_rec.fuso, now());
        if v_desde is null then
          v_estado := 'fechado';
        else
          -- conta do que for mais recente: o último envio sem erro ou a abertura
          v_delta := now() - greatest(
            coalesce(v_rec.ultimo_envio_ok_em, v_rec.primeiro_envio_em),
            v_desde
          );
          if v_delta <= interval '15 minutes' then
            v_estado := 'em_dia';
          elsif v_delta <= interval '45 minutes' then
            v_estado := 'atrasado';
          else
            v_estado := 'parado';
          end if;
        end if;
      end if;

      if v_estado <> v_rec.estado_atual then
        update public.sinal_de_vida
           set estado = v_estado, estado_desde = now()
         where restaurante_id = v_rec.restaurante_id;
      end if;
    exception when others then
      -- cadastro malformado (horário ou fuso) de UM restaurante: registra e
      -- segue. O estado dele fica como estava; os outros são calculados.
      raise warning 'rf-vigia: restaurante % ignorado (%)', v_rec.restaurante_id, sqlstate;
    end;
  end loop;
end;
$$;

drop function public.esta_aberto_agora(jsonb, text);

commit;
