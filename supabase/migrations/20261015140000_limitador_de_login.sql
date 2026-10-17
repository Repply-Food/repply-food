-- Etapa 4a · Trava de tentativas de senha por e-mail (D-62, dívida 23)
--
-- Segunda camada além do limite do Supabase Auth (D-52), que na Vercel vê o
-- endereço do servidor, não o de quem tenta. A trava é por e-mail e no banco
-- (não em memória, que não sobrevive na Vercel). Só a chave de serviço executa:
-- entrarAction (lib/auth/actions.ts) consulta login_bloqueado ANTES de tentar o
-- login, registra o erro de credencial e limpa no sucesso. As funções operam
-- sobre a string do e-mail, exista ele ou não, para não revelar quem é cliente.
--
-- Regras: nada de FORCE ROW LEVEL SECURITY; função nova nasce fechada e o grant
-- vai aqui, de propósito.
begin;

create table public.tentativas_de_login (
  email         text primary key,
  tentativas    int not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);

comment on table public.tentativas_de_login is
  'Trava de tentativas de senha por e-mail (D-62). Só a chave de serviço lê e escreve, pelas funções registrar_tentativa_errada, limpar_tentativas e login_bloqueado. Sem RLS para cliente nem admin.';

alter table public.tentativas_de_login enable row level security;
-- Ninguém com login (nem sem) toca na tabela: só a chave de serviço, pelas
-- funções abaixo. auto_expose do Supabase concede tudo em tabela nova: revogar.
revoke all on public.tentativas_de_login from anon, authenticated;

-- Incrementa; a partir de 5 erros, bloqueia por uma janela que cresce (15 min,
-- 30, 60, …), com o expoente capado em 7 (sem estourar int) e teto de 24 h.
create function public.registrar_tentativa_errada(p_email text)
returns timestamptz
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  c_limite  constant int := 5;
  c_janela  constant interval := interval '15 minutes';
  c_teto    constant interval := interval '24 hours';
  v_email   text := lower(btrim(p_email));
  v_qtd     int;
  v_bloqueio timestamptz;
begin
  if v_email is null or v_email = '' then
    return null;
  end if;
  insert into public.tentativas_de_login (email, tentativas, atualizado_em)
    values (v_email, 1, now())
  on conflict (email) do update
    set tentativas = public.tentativas_de_login.tentativas + 1,
        atualizado_em = now()
  returning tentativas into v_qtd;

  if v_qtd >= c_limite then
    v_bloqueio := now() + least(c_teto, c_janela * (2 ^ least(v_qtd - c_limite, 7))::int);
    update public.tentativas_de_login
       set bloqueado_ate = v_bloqueio
     where email = v_email;
  end if;
  return v_bloqueio;
end;
$$;

-- Login certo: zera a contagem apagando a linha.
create function public.limpar_tentativas(p_email text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  delete from public.tentativas_de_login where email = lower(btrim(p_email));
end;
$$;

-- Até quando está bloqueado (null se não estiver).
create function public.login_bloqueado(p_email text)
returns timestamptz
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select bloqueado_ate
    from public.tentativas_de_login
   where email = lower(btrim(p_email))
     and bloqueado_ate is not null
     and bloqueado_ate > now();
$$;

revoke execute on function public.registrar_tentativa_errada(text) from public, anon, authenticated;
revoke execute on function public.limpar_tentativas(text) from public, anon, authenticated;
revoke execute on function public.login_bloqueado(text) from public, anon, authenticated;
grant execute on function public.registrar_tentativa_errada(text) to service_role;
grant execute on function public.limpar_tentativas(text) to service_role;
grant execute on function public.login_bloqueado(text) to service_role;

-- Rotina diária: apaga linha sem bloqueio vigente e sem atividade há mais de
-- 24 h (não acumula e-mails para sempre). Mesmo padrão de instala_rotinas.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'rf-limpa-tentativas') then
    perform cron.unschedule('rf-limpa-tentativas');
  end if;
  perform cron.schedule('rf-limpa-tentativas', '15 5 * * *', $limpa$
    delete from public.tentativas_de_login
     where (bloqueado_ate is null or bloqueado_ate < now())
       and atualizado_em < now() - interval '24 hours';
  $limpa$);
end;
$$;

commit;
