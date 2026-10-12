begin;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'rf-vigia') then
    perform cron.unschedule('rf-vigia');
  end if;
  perform cron.schedule('rf-vigia', '*/5 * * * *', 'select public.atualizar_estados()');

  if exists (select 1 from cron.job where jobname = 'rf-retencao') then
    perform cron.unschedule('rf-retencao');
  end if;
  perform cron.schedule('rf-retencao', '0 5 * * *', $ret$
    update public.envios set payload = null
     where http_status = 200 and recebido_em < now() - interval '48 hours' and payload is not null;
    update public.envios set payload = null
     where http_status <> 200 and recebido_em < now() - interval '90 days' and payload is not null;
  $ret$);
end;
$$;

commit;
