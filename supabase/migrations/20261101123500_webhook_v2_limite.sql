begin;

create function public.consumir_limite_scc(p_restaurante_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  instante timestamptz;
  quantidade_atual integer;
begin
  if p_restaurante_id is null then
    raise exception using errcode = 'PR422', message = 'casa_invalida';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text, 0));
  if not exists (select 1 from public.restaurantes where id = p_restaurante_id) then
    raise exception using errcode = 'PR422', message = 'casa_invalida';
  end if;

  instante := clock_timestamp();
  insert into public.limites_requisicao_scc as limite (restaurante_id, inicio_janela, quantidade)
  values (p_restaurante_id, instante, 1)
  on conflict (restaurante_id) do update
    set inicio_janela = case when limite.inicio_janela <= instante - interval '1 minute'
                             then instante else limite.inicio_janela end,
        quantidade = case when limite.inicio_janela <= instante - interval '1 minute'
                          then 1 else limite.quantidade + 1 end
    where limite.inicio_janela <= instante - interval '1 minute' or limite.quantidade < 120
  returning quantidade into quantidade_atual;

  if not found then
    raise exception using errcode = 'PR429', message = 'limite_requisicoes_scc';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.consumir_limite_scc(uuid) from public, anon, authenticated;
grant execute on function public.consumir_limite_scc(uuid) to service_role;

commit;
