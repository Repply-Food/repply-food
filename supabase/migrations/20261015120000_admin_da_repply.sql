-- Etapa 3 · Admin da Repply
-- (desenho: docs/superpowers/specs/2026-10-14-etapa-3-admin-design.md §2)
--
--   1. o banco confere o cadastro do restaurante: horário de funcionamento
--      (D-56), fuso do Brasil e CNPJ (D-60). Resolve a pendência 9;
--   2. histórico das ações do admin, registro_admin (D-59);
--   3. token de envio trocado numa transação só: trocar_token_envio e
--      revogar_tokens_envio (D-38);
--   4. funções da chave de serviço para os logins: id_do_login_por_email e
--      encerrar_sessoes_do_login (D-55);
--   5. visão da lista do admin, restaurantes_no_admin (security_invoker: a RLS
--      das tabelas vale para quem consulta);
--   6. privilégios explícitos nas tabelas (pendência 14).
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; função nova nasce fechada e o grant
-- é dado aqui, de propósito (seguranca-e-isolamento.md §2, item 12).
begin;

-- ---------------------------------------------------------------------------
-- 1. Cadastro conferido pelo banco
-- ---------------------------------------------------------------------------

-- Horário de funcionamento (D-56): lista de { "dia": 0–6, "abre": "HH:MM",
-- "fecha": "HH:MM" } (0 = domingo); no máximo dois por dia; abre ≠ fecha; os
-- do mesmo dia não se sobrepõem; só o último do dia passa da meia-noite
-- (fecha < abre). Lista vazia continua aceita: quer dizer "sempre aberta" e
-- existe em cadastros antigos; o formulário do admin exige um dia aberto.
-- As horas são comparadas como texto: no formato HH:MM a ordem é a mesma, e
-- assim a função não converte nada (é imutável de verdade).
-- A mesma regra está em lib/admin/horario.ts (problemaNosIntervalos), e
-- tests/admin/espelho-do-banco.test.ts compara as duas.
create function public.horario_funcionamento_valido(p_horario jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  c_hora   constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_item   jsonb;
  v_dia    int;
  v_qtd    int;
  v_cruzou boolean;
  v_fim    text;
  v_abre   text;
  v_fecha  text;
begin
  if p_horario is null or jsonb_typeof(p_horario) <> 'array' then
    return false;
  end if;

  for v_item in select * from jsonb_array_elements(p_horario) loop
    if jsonb_typeof(v_item) <> 'object' then
      return false;
    end if;
    if not coalesce(
         (select array_agg(k order by k) from jsonb_object_keys(v_item) as k)
           = array['abre', 'dia', 'fecha']
         and jsonb_typeof(v_item -> 'dia') = 'number'
         and (v_item ->> 'dia') ~ '^[0-6]$'
         and jsonb_typeof(v_item -> 'abre') = 'string'
         and jsonb_typeof(v_item -> 'fecha') = 'string'
         and (v_item ->> 'abre') ~ c_hora
         and (v_item ->> 'fecha') ~ c_hora
         and (v_item ->> 'abre') <> (v_item ->> 'fecha'),
       false) then
      return false;
    end if;
  end loop;

  for v_dia in 0..6 loop
    v_qtd := 0;
    v_cruzou := false;
    v_fim := null;
    for v_abre, v_fecha in
      select e ->> 'abre', e ->> 'fecha'
        from jsonb_array_elements(p_horario) as e
       where (e ->> 'dia')::int = v_dia
       order by 1
    loop
      v_qtd := v_qtd + 1;
      -- terceiro do dia, ou um depois do que já passou da meia-noite
      if v_qtd > 2 or v_cruzou then
        return false;
      end if;
      -- começa antes de o anterior fechar
      if v_fim is not null and v_abre < v_fim then
        return false;
      end if;
      v_cruzou := v_fecha < v_abre;
      v_fim := v_fecha;
    end loop;
  end loop;

  return true;
end;
$$;

-- CNPJ (D-60): 14 caracteres sem pontuação; os 12 primeiros podem ter letras
-- maiúsculas (CNPJ alfanumérico da Receita, julho de 2026) e os 2 últimos são
-- os dígitos verificadores, calculados com o valor ASCII − 48 de cada
-- caractere. Todos iguais (00000000000000, 11111111111111…) não vale.
-- A mesma regra está em lib/admin/cnpj.ts.
create function public.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  c_pesos1 constant int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  c_pesos2 constant int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_soma  int;
  v_resto int;
  v_dv1   int;
  v_dv2   int;
begin
  if p_cnpj is null
     or p_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$'
     or p_cnpj ~ '^(.)\1{13}$' then
    return false;
  end if;

  v_soma := 0;
  for i in 1..12 loop
    v_soma := v_soma + (ascii(substr(p_cnpj, i, 1)) - 48) * c_pesos1[i];
  end loop;
  v_resto := v_soma % 11;
  v_dv1 := case when v_resto < 2 then 0 else 11 - v_resto end;

  v_soma := 0;
  for i in 1..13 loop
    v_soma := v_soma + (ascii(substr(p_cnpj, i, 1)) - 48) * c_pesos2[i];
  end loop;
  v_resto := v_soma % 11;
  v_dv2 := case when v_resto < 2 then 0 else 11 - v_resto end;

  return substr(p_cnpj, 13, 1)::int = v_dv1
     and substr(p_cnpj, 14, 1)::int = v_dv2;
end;
$$;

-- As duas rodam DENTRO das restrições abaixo. O Postgres confere o EXECUTE de
-- quem grava, e quem grava é o admin pelo login (authenticated): sem este
-- grant, o cadastro do admin falha com "permission denied for function"
-- (medido no banco local em 15/10/2026). São puras, sem ler tabela.
grant execute on function public.horario_funcionamento_valido(jsonb) to authenticated, service_role;
grant execute on function public.cnpj_valido(text) to authenticated, service_role;

alter table public.restaurantes
  add constraint restaurantes_horario_funcionamento_valido
    check (public.horario_funcionamento_valido(horario_funcionamento)),
  -- Os fusos IANA do Brasil. A mesma lista está em lib/admin/fusos.ts.
  add constraint restaurantes_fuso_do_brasil
    check (fuso in (
      'America/Noronha', 'America/Belem', 'America/Fortaleza', 'America/Recife',
      'America/Araguaina', 'America/Maceio', 'America/Bahia', 'America/Sao_Paulo',
      'America/Santarem', 'America/Campo_Grande', 'America/Cuiaba',
      'America/Porto_Velho', 'America/Boa_Vista', 'America/Manaus',
      'America/Eirunepe', 'America/Rio_Branco'
    )),
  add constraint restaurantes_cnpj_valido
    check (cnpj is null or public.cnpj_valido(cnpj));

comment on column public.restaurantes.horario_funcionamento is
  '[{ "dia": 5, "abre": "11:00", "fecha": "02:00" }, ...] com 0 = domingo. Até dois por dia; só o último do dia passa da meia-noite (D-56). Conferido por horario_funcionamento_valido.';
comment on column public.restaurantes.cnpj is
  'Opcional (D-60). Sem pontuação, em maiúsculas; conferido por cnpj_valido e único.';

-- ---------------------------------------------------------------------------
-- 2. Histórico das ações do admin (D-59)
-- ---------------------------------------------------------------------------

create table public.registro_admin (
  id             bigint generated always as identity primary key,
  criado_em      timestamptz not null default now(),
  -- O admin que fez. Se a conta dele for apagada, o histórico fica (sem nome).
  autor          uuid references auth.users (id) on delete set null,
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  acao           text not null
                 constraint registro_admin_acao_valida check (acao in (
                   'cadastrou', 'editou_dados', 'gerou_token', 'revogou_token',
                   'criou_login', 'ligou_login', 'redefiniu_senha', 'trocou_email',
                   'pediu_reenvio', 'suspendeu', 'reativou', 'abriu_painel'
                 )),
  -- Texto curto, sem senha, token ou e-mail completo.
  detalhe        text constraint registro_admin_detalhe_curto
                 check (detalhe is null or char_length(detalhe) <= 200)
);

comment on table public.registro_admin is
  'Quem fez o quê em cada restaurante, pelo admin (D-59). Sem senha nem token. Ninguém altera nem apaga.';

create index registro_admin_restaurante_idx
  on public.registro_admin (restaurante_id, criado_em desc);

-- "abriu o painel do cliente" no máximo uma vez por hora por admin e casa.
-- date_trunc com o fuso explícito ('UTC') é imutável; o de dois argumentos
-- sobre timestamptz não é e o índice seria recusado.
create unique index registro_admin_abriu_painel_por_hora
  on public.registro_admin (autor, restaurante_id, date_trunc('hour', criado_em, 'UTC'))
  where acao = 'abriu_painel';

create trigger registro_admin_freeze_restaurante
  before update on public.registro_admin
  for each row execute function public.freeze_restaurante_id();

alter table public.registro_admin enable row level security;

create policy "admin lê o histórico" on public.registro_admin
  for select using (public.eh_admin_repply());
create policy "admin registra em nome próprio" on public.registro_admin
  for insert with check (public.eh_admin_repply() and autor = auth.uid());
-- sem update nem delete: ninguém altera nem apaga.

revoke all on public.registro_admin from anon, authenticated;
grant select, insert on public.registro_admin to authenticated;
-- Nem a chave de serviço altera o histórico. (Apagar o restaurante leva o
-- histórico junto pelo "on delete cascade", que roda como dono da tabela.)
revoke update, delete, truncate on public.registro_admin from service_role;

-- ---------------------------------------------------------------------------
-- 3. Token de envio (D-38)
-- ---------------------------------------------------------------------------

-- Troca numa transação só: os tokens válidos anteriores param agora
-- (revogado_em) ou em 24 h (expira_em, sem nunca esticar um prazo menor) e o
-- novo entra. Nunca fica sem token nem com dois "agora" por engano; dois admins
-- ao mesmo tempo entram em fila pela trava da linha do restaurante.
create function public.trocar_token_envio(
  p_restaurante uuid,
  p_hash text,
  p_prefixo text,
  p_antigo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_autor   uuid := auth.uid();
  v_antigos int;
  v_id      uuid;
begin
  if not public.eh_admin_repply() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if p_antigo is null or p_antigo not in ('agora', '24h') then
    raise exception 'p_antigo deve ser agora ou 24h' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
     or p_prefixo is null or p_prefixo !~ '^rf_[0-9A-Za-z]{4}$' then
    raise exception 'token malformado' using errcode = '22023';
  end if;

  perform 1 from public.restaurantes where id = p_restaurante for update;
  if not found then
    raise exception 'restaurante não encontrado' using errcode = 'P0002';
  end if;

  if p_antigo = 'agora' then
    update public.tokens_envio
       set revogado_em = now()
     where restaurante_id = p_restaurante
       and revogado_em is null
       and (expira_em is null or expira_em > now());
  else
    update public.tokens_envio
       set expira_em = least(coalesce(expira_em, 'infinity'::timestamptz),
                             now() + interval '24 hours')
     where restaurante_id = p_restaurante
       and revogado_em is null
       and (expira_em is null or expira_em > now());
  end if;
  get diagnostics v_antigos = row_count;

  insert into public.tokens_envio (restaurante_id, hash, prefixo, criado_por)
  values (p_restaurante, p_hash, p_prefixo, v_autor)
  returning id into v_id;

  insert into public.registro_admin (autor, restaurante_id, acao, detalhe)
  values (v_autor, p_restaurante, 'gerou_token',
          case when v_antigos = 0 then 'primeiro token'
               when p_antigo = 'agora' then 'o antigo parou na hora'
               else 'o antigo para em 24 h' end);

  return jsonb_build_object('token_id', v_id, 'antigos', v_antigos);
end;
$$;

-- Revoga todos os tokens válidos do restaurante. Zero tokens é erro: a tela
-- não pode dizer "revogado" quando não havia o que revogar.
create function public.revogar_tokens_envio(p_restaurante uuid)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_total integer;
begin
  if not public.eh_admin_repply() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  perform 1 from public.restaurantes where id = p_restaurante for update;
  if not found then
    raise exception 'restaurante não encontrado' using errcode = 'P0002';
  end if;

  update public.tokens_envio
     set revogado_em = now()
   where restaurante_id = p_restaurante
     and revogado_em is null
     and (expira_em is null or expira_em > now());
  get diagnostics v_total = row_count;

  if v_total = 0 then
    raise exception 'nenhum token válido' using errcode = 'P0001';
  end if;

  insert into public.registro_admin (autor, restaurante_id, acao, detalhe)
  values (auth.uid(), p_restaurante, 'revogou_token',
          case when v_total = 1 then '1 token' else v_total || ' tokens' end);

  return v_total;
end;
$$;

grant execute on function public.trocar_token_envio(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.revogar_tokens_envio(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Logins: só a chave de serviço (D-55)
-- ---------------------------------------------------------------------------

-- Acha a conta pelo e-mail sem listar todas as contas do Auth.
create function public.id_do_login_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select u.id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
     and u.deleted_at is null
   order by u.created_at
   limit 1;
$$;

-- Desconecta todos os aparelhos de um login (redefinir senha). Apagar a sessão
-- leva junto os refresh tokens (on delete cascade). Zero é normal: o login
-- pode não estar aberto em lugar nenhum, e o próprio Auth já derruba as
-- sessões quando o admin troca a senha (GoTrue v2.197, medido em 15/10/2026).
create function public.encerrar_sessoes_do_login(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_total integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke execute on function public.id_do_login_por_email(text) from public, anon, authenticated;
revoke execute on function public.encerrar_sessoes_do_login(uuid) from public, anon, authenticated;
grant execute on function public.id_do_login_por_email(text) to service_role;
grant execute on function public.encerrar_sessoes_do_login(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Visão da lista do admin
-- ---------------------------------------------------------------------------

create view public.restaurantes_no_admin
with (security_invoker = true) as
select r.id,
       r.slug,
       r.nome,
       r.situacao,
       r.fuso,
       s.estado,
       s.ultimo_envio_ok_em,
       ultimo.versao_scc
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

comment on view public.restaurantes_no_admin is
  'Lista do admin: restaurante, estado do vigia e versão do SCC do último envio. security_invoker: a RLS das tabelas vale para quem consulta.';

revoke all on public.restaurantes_no_admin from anon, authenticated;
grant select on public.restaurantes_no_admin to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Privilégios explícitos (pendência 14)
-- ---------------------------------------------------------------------------

-- A RLS não cobre TRUNCATE (esvaziar a tabela inteira). Gatilho, referência e
-- manutenção (MAINTAIN, do Postgres 17) também não são do produto.
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;

-- O que o produto usa, dado de propósito. A RLS continua decidindo quem.
grant select, insert, update, delete on public.restaurantes to authenticated;  -- admin cadastra, edita, suspende, pede reenvio
grant select, insert, update, delete on public.acessos to authenticated;       -- admin liga o login à casa
grant select on public.tokens_envio to authenticated;                          -- admin lê; a troca passa pelas funções da seção 3
grant select, insert, update, delete on public.metas to authenticated;         -- dono, em Ajustes (etapa 6)
grant select on public.admins_repply, public.envios, public.sinal_de_vida, public.entradas to authenticated;

commit;
