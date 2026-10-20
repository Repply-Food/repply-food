-- Alarme do sinal de vida: fila persistente, entrega confirmada e retorno só por
-- envio válido do SCC. O banco nunca chama a Resend nem marca sucesso no
-- enfileiramento do pg_net.
begin;

create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create table public.incidentes_sinal (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  parado_em timestamptz not null,
  voltou_em timestamptz,
  alerta_parado_enviado_em timestamptz,
  alerta_voltou_enviado_em timestamptz,
  encerrado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (id, restaurante_id),
  check (voltou_em is null or voltou_em >= parado_em),
  check (encerrado_em is null or encerrado_em >= parado_em)
);

create unique index incidentes_sinal_um_aberto_por_casa
  on public.incidentes_sinal (restaurante_id)
  where encerrado_em is null;

create table public.alertas_sinal (
  id uuid primary key default gen_random_uuid(),
  incidente_id uuid not null,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  tipo text not null check (tipo in ('parado', 'voltou')),
  estado text not null default 'pendente'
    check (estado in ('pendente', 'em_transito', 'enviado', 'cancelado')),
  tentativas integer not null default 0 check (tentativas >= 0),
  proxima_tentativa_em timestamptz not null default now(),
  request_id bigint unique,
  solicitado_em timestamptz,
  enviado_em timestamptz,
  erro_codigo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (incidente_id, tipo),
  foreign key (incidente_id, restaurante_id)
    references public.incidentes_sinal (id, restaurante_id) on delete cascade,
  check (char_length(coalesce(erro_codigo, '')) <= 60)
);

create index alertas_sinal_pendentes_idx
  on public.alertas_sinal (proxima_tentativa_em, criado_em)
  where estado = 'pendente';

alter table public.incidentes_sinal enable row level security;
alter table public.alertas_sinal enable row level security;
revoke all on table public.incidentes_sinal, public.alertas_sinal from anon, authenticated;

-- Uma parada é idempotente mesmo se o vigia for executado duas vezes ou em
-- paralelo. O advisory lock também impede que duas sessões disputem o índice
-- parcial de incidente aberto.
create function public.registrar_parada_sinal(
  p_restaurante_id uuid,
  p_momento timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_incidente_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text, 9));

  select id into v_incidente_id
    from public.incidentes_sinal
   where restaurante_id = p_restaurante_id
     and encerrado_em is null;

  if v_incidente_id is null then
    insert into public.incidentes_sinal (restaurante_id, parado_em)
      values (p_restaurante_id, p_momento)
      returning id into v_incidente_id;
  end if;

  insert into public.alertas_sinal (incidente_id, restaurante_id, tipo)
    values (v_incidente_id, p_restaurante_id, 'parado')
    on conflict (incidente_id, tipo) do nothing;
end;
$$;

-- Só um envio válido muda ultimo_envio_ok_em. Este helper é chamado pelo
-- trigger da tabela, não pelo vigia: fechar a casa não é uma volta.
create function public.registrar_retorno_sinal(
  p_restaurante_id uuid,
  p_momento timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_incidente_id uuid;
  v_estado_parado text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text, 9));

  select i.id, a.estado
    into v_incidente_id, v_estado_parado
    from public.incidentes_sinal i
    join public.alertas_sinal a
      on a.incidente_id = i.id and a.tipo = 'parado'
   where i.restaurante_id = p_restaurante_id
     and i.encerrado_em is null
   for update of i, a;

  if not found then
    return;
  end if;

  update public.incidentes_sinal
     set voltou_em = coalesce(voltou_em, p_momento)
   where id = v_incidente_id;

  if v_estado_parado = 'enviado' then
    insert into public.alertas_sinal (incidente_id, restaurante_id, tipo)
      values (v_incidente_id, p_restaurante_id, 'voltou')
      on conflict (incidente_id, tipo) do nothing;
  elsif v_estado_parado = 'pendente' then
    update public.alertas_sinal
       set estado = 'cancelado', atualizado_em = now()
     where incidente_id = v_incidente_id and tipo = 'parado';
    update public.incidentes_sinal
       set encerrado_em = now()
     where id = v_incidente_id;
  end if;
end;
$$;

create function public.ao_atualizar_sinal_de_vida()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.ultimo_envio_ok_em is not null
     and (tg_op = 'INSERT' or new.ultimo_envio_ok_em is distinct from old.ultimo_envio_ok_em) then
    perform public.registrar_retorno_sinal(new.restaurante_id, new.ultimo_envio_ok_em);
  end if;
  return new;
end;
$$;

create trigger rf_registra_retorno_sinal
  after insert or update of ultimo_envio_ok_em on public.sinal_de_vida
  for each row execute function public.ao_atualizar_sinal_de_vida();

-- A confirmação é a única superfície que transforma um alerta em enviado.
-- Ela aceita a linha pendente também para permitir recuperação/observação
-- administrativa sem depender de detalhes internos do pg_net.
create function public.confirmar_alerta_sinal(
  p_alerta_id uuid,
  p_status integer,
  p_corpo jsonb,
  p_erro text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_alerta record;
  v_sucesso boolean := p_status between 200 and 299 and p_corpo ->> 'ok' = 'true';
begin
  select a.id, a.incidente_id, a.restaurante_id, a.tipo, a.estado,
         i.voltou_em
    into v_alerta
    from public.alertas_sinal a
    join public.incidentes_sinal i on i.id = a.incidente_id
   where a.id = p_alerta_id
   for update of a, i;

  if not found or v_alerta.estado in ('enviado', 'cancelado') then
    return;
  end if;

  if v_sucesso then
    update public.alertas_sinal
       set estado = 'enviado', enviado_em = now(), request_id = null,
           erro_codigo = null, atualizado_em = now()
     where id = v_alerta.id;

    if v_alerta.tipo = 'parado' then
      update public.incidentes_sinal
         set alerta_parado_enviado_em = now()
       where id = v_alerta.incidente_id;
      update public.sinal_de_vida
         set alarme_enviado_em = now()
       where restaurante_id = v_alerta.restaurante_id;
      if v_alerta.voltou_em is not null then
        insert into public.alertas_sinal (incidente_id, restaurante_id, tipo)
          values (v_alerta.incidente_id, v_alerta.restaurante_id, 'voltou')
          on conflict (incidente_id, tipo) do nothing;
      end if;
    else
      update public.incidentes_sinal
         set alerta_voltou_enviado_em = now(), encerrado_em = now()
       where id = v_alerta.incidente_id;
      update public.sinal_de_vida
         set alarme_enviado_em = null
       where restaurante_id = v_alerta.restaurante_id;
    end if;
  elsif v_alerta.tipo = 'parado' and v_alerta.voltou_em is not null then
    update public.alertas_sinal
       set estado = 'cancelado', request_id = null,
           erro_codigo = left(coalesce(nullif(p_erro, ''), 'resposta_invalida'), 60),
           atualizado_em = now()
     where id = v_alerta.id;
    update public.incidentes_sinal
       set encerrado_em = now()
     where id = v_alerta.incidente_id;
  else
    update public.alertas_sinal
       set estado = 'pendente', request_id = null,
           proxima_tentativa_em = now() + interval '5 minutes',
           erro_codigo = left(coalesce(nullif(p_erro, ''), 'resposta_invalida'), 60),
           atualizado_em = now()
     where id = v_alerta.id;
  end if;
end;
$$;

-- Confere as respostas reais do pg_net e só então encaminha a próxima leva.
create function public.processar_alertas_sinal()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_resposta record;
  v_alerta record;
  v_corpo jsonb;
  v_url text;
  v_segredo text;
  v_request_id bigint;
begin
  for v_resposta in
    select a.id as alerta_id, r.status_code, r.content, r.error_msg, r.timed_out
      from public.alertas_sinal a
      join net._http_response r on r.id = a.request_id
     where a.estado = 'em_transito'
  loop
    begin
      v_corpo := coalesce(v_resposta.content::jsonb, '{}'::jsonb);
    exception when others then
      v_corpo := '{}'::jsonb;
    end;
    perform public.confirmar_alerta_sinal(
      v_resposta.alerta_id,
      coalesce(v_resposta.status_code, 0),
      v_corpo,
      case when v_resposta.timed_out then 'tempo_esgotado'
           else left(coalesce(v_resposta.error_msg, 'resposta_invalida'), 60)
      end
    );
  end loop;

  for v_alerta in
    select a.id, a.incidente_id, a.restaurante_id, a.tipo
      from public.alertas_sinal a
      join public.incidentes_sinal i on i.id = a.incidente_id
     where a.estado = 'em_transito'
       and a.solicitado_em < now() - interval '15 minutes'
       and not exists (select 1 from net._http_response r where r.id = a.request_id)
     for update of a skip locked
  loop
    perform public.confirmar_alerta_sinal(v_alerta.id, 0, '{}'::jsonb, 'resposta_ausente');
  end loop;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'rf_alerta_url';
  select decrypted_secret into v_segredo
    from vault.decrypted_secrets where name = 'rf_alerta_segredo';

  if v_url is null or v_segredo is null then
    update public.alertas_sinal
       set erro_codigo = 'vault_indisponivel', atualizado_em = now()
     where estado = 'pendente'
       and proxima_tentativa_em <= now();
    return;
  end if;

  for v_alerta in
    select a.id, a.incidente_id, a.restaurante_id, a.tipo
      from public.alertas_sinal a
      join public.incidentes_sinal i on i.id = a.incidente_id
     where a.estado = 'pendente'
       and a.proxima_tentativa_em <= now()
     order by a.proxima_tentativa_em, a.criado_em
     limit 20
     for update of a skip locked
  loop
    -- Uma volta chegou antes da parada sair: não mandar um e-mail atrasado.
    if v_alerta.tipo = 'parado' and exists (
      select 1 from public.incidentes_sinal
       where id = v_alerta.incidente_id and voltou_em is not null
    ) then
      update public.alertas_sinal
         set estado = 'cancelado', atualizado_em = now()
       where id = v_alerta.id;
      update public.incidentes_sinal
         set encerrado_em = now()
       where id = v_alerta.incidente_id;
      continue;
    end if;

    begin
      select net.http_post(
        url := v_url,
        body := jsonb_build_object('alerta_id', v_alerta.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-rf-alerta-secret', v_segredo
        ),
        timeout_milliseconds := 10000
      ) into v_request_id;
      update public.alertas_sinal
         set estado = 'em_transito', request_id = v_request_id,
             solicitado_em = now(), tentativas = tentativas + 1,
             erro_codigo = null, atualizado_em = now()
       where id = v_alerta.id;
    exception when others then
      update public.alertas_sinal
         set estado = 'pendente', proxima_tentativa_em = now() + interval '5 minutes',
             erro_codigo = 'chamada_falhou', atualizado_em = now()
       where id = v_alerta.id;
    end;
  end loop;
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

      if v_estado = 'parado' then
        perform public.registrar_parada_sinal(v_rec.restaurante_id, now());
      end if;
    exception when others then
      raise warning 'rf-vigia: restaurante % ignorado (%)', v_rec.restaurante_id, sqlstate;
    end;
  end loop;
end;
$$;

-- Um job preserva a ordem: calcula a parada e depois processa as confirmações/
-- pendências. A chamada externa continua assíncrona e não bloqueia o vigia.
do $$
begin
  perform cron.unschedule('rf-vigia') where exists (
    select 1 from cron.job where jobname = 'rf-vigia'
  );
  perform cron.schedule('rf-vigia', '*/5 * * * *', $cron$
    select public.atualizar_estados();
    select public.processar_alertas_sinal();
  $cron$);
end;
$$;

revoke execute on function public.registrar_parada_sinal(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.registrar_retorno_sinal(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.confirmar_alerta_sinal(uuid, integer, jsonb, text) from public, anon, authenticated;
revoke execute on function public.processar_alertas_sinal() from public, anon, authenticated;
grant execute on function public.registrar_parada_sinal(uuid, timestamptz) to service_role;
grant execute on function public.registrar_retorno_sinal(uuid, timestamptz) to service_role;
grant execute on function public.confirmar_alerta_sinal(uuid, integer, jsonb, text) to service_role;
grant execute on function public.processar_alertas_sinal() to service_role;

commit;
