-- Casa de demonstração: o vigia calcula o selo normalmente, mas não dispara o
-- alarme por e-mail para ela (para não encher a equipe entre demonstrações).
begin;

alter table public.restaurantes
  add column demonstracao boolean not null default false;

comment on column public.restaurantes.demonstracao is
  'Casa de demonstração: o vigia calcula o selo normalmente, mas não dispara o alarme por e-mail para ela.';

-- A view da lista do admin passa a expor a marca (coluna acrescentada ao fim,
-- para o create or replace preservar os grants, sem drop).
create or replace view public.restaurantes_no_admin
with (security_invoker = true) as
select r.id,
       r.slug,
       r.nome,
       r.situacao,
       r.fuso,
       s.estado,
       s.ultimo_envio_ok_em,
       ultimo.versao_scc,
       r.demonstracao
  from public.restaurantes r
  left join public.sinal_de_vida s on s.restaurante_id = r.id
  left join lateral (
    select e.versao_scc
      from public.envios e
     where e.restaurante_id = r.id
       and e.versao_scc is not null
     order by e.recebido_em desc
     limit 1
  ) as ultimo on true;

-- O vigia ignora a casa de demonstração só na hora de registrar a parada; o
-- cálculo e a atualização do selo continuam iguais para todas as casas.
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
           s.estado as estado_atual, r.fuso, r.horario_funcionamento,
           r.demonstracao
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

      if v_estado = 'parado' and not v_rec.demonstracao then
        perform public.registrar_parada_sinal(v_rec.restaurante_id, now());
      end if;
    exception when others then
      raise warning 'rf-vigia: restaurante % ignorado (%)', v_rec.restaurante_id, sqlstate;
    end;
  end loop;
end;
$$;

commit;
