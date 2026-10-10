-- ============================================================================
-- Fundação do esquema do repply food.
--
-- Uma única migration (é a primeira do projeto) com:
--   * as 8 tabelas do modelo de dados (docs/arquitetura/modelo-de-dados.md);
--   * RLS habilitada e políticas no MESMO arquivo (seguranca-e-isolamento.md §2);
--   * triggers obrigatórios (set_updated_at e restaurante_id imutável);
--   * helpers tem_acesso / eh_admin_repply / dia_operacao_de / esta_aberto_agora;
--   * processar_envio(), atualizar_estados(), recalcular_dia_operacao(), atualizar_turnos();
--   * agendamento no pg_cron (vigia a cada 5 min e retenção diária);
--   * grants explícitos para anon, authenticated e service_role.
--
-- Regras que este arquivo respeita:
--   * nenhum FORCE ROW LEVEL SECURITY (recursão no Imob);
--   * funções auxiliares de RLS com security definer + row_security off;
--   * dinheiro em numeric(12,2); momentos em timestamptz;
--   * dados pessoais (NomeCliente/RG/FoneCliente/Sexo) nunca entram no banco:
--     são descartados na recepção e, defensivamente, aqui também (D-29).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.restaurantes (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,
  nome                     text not null,
  cnpj                     text unique,
  fuso                     text not null default 'America/Fortaleza',
  hora_virada              time not null default '05:00',
  horario_funcionamento    jsonb not null default '[]',
  turnos                   jsonb not null default '{"almoco_ate": "17:00"}',
  limite_conta_esquecida   interval not null default '4 hours',
  intervalo_envio_segundos int not null default 300,
  pedido_reenvio_desde     date,
  situacao                 text not null default 'ativo' check (situacao in ('ativo', 'suspenso')),
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

comment on table public.restaurantes is
  'Um restaurante cliente. Escreve: só o admin; a exceção são os turnos (atualizar_turnos, D-35).';
comment on column public.restaurantes.horario_funcionamento is
  '[{ "dia": 5, "abre": "11:00", "fecha": "02:00" }, ...] com 0 = domingo. Pode atravessar a meia-noite.';

create table public.acessos (
  user_id        uuid not null references auth.users (id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  criado_em      timestamptz not null default now(),
  primary key (user_id, restaurante_id)
);

comment on table public.acessos is
  'Login (auth.users) <-> restaurante. Na prática é 1:N, mas o modelo aceita o dono com duas casas.';

create table public.admins_repply (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

comment on table public.admins_repply is
  'Quem está aqui entra no /admin. Admin Repply é um tipo de usuário da plataforma (D-32).';

create table public.tokens_envio (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  hash           text not null unique,      -- SHA-256 do token; o token em si nunca é guardado
  prefixo        text not null,             -- ex.: 'rf_8f3k', para reconhecer no admin
  criado_em      timestamptz not null default now(),
  criado_por     uuid references auth.users (id),
  ultimo_uso_em  timestamptz,
  expira_em      timestamptz,               -- troca "em 24h" (D-38)
  revogado_em    timestamptz
);

comment on table public.tokens_envio is
  'Token do SCC. Só o SHA-256 é guardado; o token é mostrado uma única vez, na criação (D-03).';
comment on column public.tokens_envio.hash is
  'Token válido = revogado_em is null and (expira_em is null or expira_em > now()).';

create table public.envios (
  id             bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  recebido_em    timestamptz not null default now(),
  http_status    int not null,
  modo           text,
  versao_formato int,
  versao_scc     text,
  janela_desde   date,
  janela_ate     date,
  recebidas      int,
  gravadas       int,
  inalteradas    int,
  removidas      int,
  erro           text,                   -- mensagem curta, sem dado pessoal
  payload        jsonb,                  -- JSON original já sem os campos pessoais
  duracao_ms     int
);

create index envios_restaurante_recebido_idx
  on public.envios (restaurante_id, recebido_em desc);

comment on table public.envios is
  'Resumo de cada envio do SCC. O payload é limpo por retenção (pg_cron): 200 > 48 h, erro > 90 dias.';

create table public.sinal_de_vida (
  restaurante_id     uuid primary key references public.restaurantes (id) on delete cascade,
  primeiro_envio_em  timestamptz,
  ultimo_envio_em    timestamptz,
  ultimo_envio_ok_em timestamptz,
  ultimo_erro_em     timestamptz,
  estado             text not null default 'aguardando'
                     check (estado in ('aguardando', 'em_dia', 'atrasado', 'parado', 'fechado')),
  estado_desde       timestamptz not null default now(),
  alarme_enviado_em  timestamptz                -- um e-mail por incidente
);

comment on table public.sinal_de_vida is
  'Sinal de vida do SCC por restaurante. O vigia (atualizar_estados) calcula o estado.';

create table public.entradas (
  restaurante_id           uuid not null references public.restaurantes (id) on delete cascade,
  cod_entrada              bigint not null,               -- codEntrada do SCC, chave dentro do restaurante (D-01)
  cod_cartao_mesa          int,
  cod_garcom               int,
  cod_cliente              int,
  cod_operador_abertura    int,
  cod_operador_fechamento  int,
  aberta_em                timestamptz not null,
  fechada_em               timestamptz,                   -- null = aberta
  dia_operacao             date not null,                 -- data(aberta_em local - hora_virada)
  valor_itens              numeric(12, 2) not null default 0,
  valor_descontos          numeric(12, 2) not null default 0,
  valor_acrescimos         numeric(12, 2) not null default 0,
  taxa_servico             numeric(12, 2) not null default 0,
  complemento              numeric(12, 2) not null default 0,
  valor_consumido          numeric(12, 2) not null,
  pago                     boolean not null,
  numero_ocupantes         int,
  tipo_ocupacao            text,
  tipo_cartao              text,
  extras                   jsonb not null default '{}',   -- Flyer, ECF, CER, COO, Reabilitado... (H3, B17)
  hash_origem              text not null,                 -- se o envio repetir igual, não regrava
  removida_em              timestamptz,                   -- sumiu da janela do SCC: sai das métricas, não é apagada
  recebida_em              timestamptz not null default now(),
  atualizada_em            timestamptz not null default now(),
  primary key (restaurante_id, cod_entrada)
);

create index entradas_dia_idx
  on public.entradas (restaurante_id, dia_operacao) where removida_em is null;
create index entradas_abertas_idx
  on public.entradas (restaurante_id) where fechada_em is null and removida_em is null;

comment on table public.entradas is
  'Sessões de mesa/cartão vindas do SCC. Nunca guarda NomeCliente, RG, FoneCliente ou Sexo (D-29).';

create table public.metas (
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  mes            date not null check (extract(day from mes) = 1),
  valor          numeric(12, 2) not null check (valor > 0),
  atualizado_em  timestamptz not null default now(),
  primary key (restaurante_id, mes)
);

comment on table public.metas is
  'Meta de faturamento do mês (cliente escreve em Ajustes, D-35). Mês sem meta herda o anterior na tela.';

-- ---------------------------------------------------------------------------
-- Triggers obrigatórios (padrão do Imob)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- entradas usa "atualizada_em" (o resto do modelo usa "atualizado_em")
create or replace function public.set_atualizada_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizada_em := now();
  return new;
end;
$$;

create or replace function public.freeze_restaurante_id()
returns trigger
language plpgsql
as $$
begin
  if new.restaurante_id is distinct from old.restaurante_id then
    raise exception 'restaurante_id é imutável' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger restaurantes_set_updated_at
  before update on public.restaurantes
  for each row execute function public.set_updated_at();

create trigger metas_set_updated_at
  before update on public.metas
  for each row execute function public.set_updated_at();

create trigger entradas_set_updated_at
  before update on public.entradas
  for each row execute function public.set_atualizada_em();

create trigger acessos_freeze_restaurante
  before update on public.acessos
  for each row execute function public.freeze_restaurante_id();

create trigger tokens_envio_freeze_restaurante
  before update on public.tokens_envio
  for each row execute function public.freeze_restaurante_id();

create trigger envios_freeze_restaurante
  before update on public.envios
  for each row execute function public.freeze_restaurante_id();

create trigger sinal_de_vida_freeze_restaurante
  before update on public.sinal_de_vida
  for each row execute function public.freeze_restaurante_id();

create trigger entradas_freeze_restaurante
  before update on public.entradas
  for each row execute function public.freeze_restaurante_id();

create trigger metas_freeze_restaurante
  before update on public.metas
  for each row execute function public.freeze_restaurante_id();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- auth.uid() é fornecido pelo Supabase Auth (lê request.jwt.claim.sub).

create or replace function public.eh_admin_repply()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.admins_repply a where a.user_id = auth.uid()
  );
$$;

create or replace function public.tem_acesso(p_restaurante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.acessos a
    where a.user_id = auth.uid() and a.restaurante_id = p_restaurante_id
  ) or public.eh_admin_repply();
$$;

-- Dia de operação: data da abertura no fuso do restaurante, menos a hora da virada
-- (B6: abertura + virada às 5h até a resposta da SCC).
create or replace function public.dia_operacao_de(p_momento timestamptz, p_fuso text, p_virada time)
returns date
language sql
stable
as $$
  select ((p_momento at time zone p_fuso)::timestamp - (p_virada::text)::interval)::date;
$$;

-- O restaurante está aberto agora? Considera horário que atravessa a meia-noite;
-- o dia que vale é o da abertura (recepcao-de-dados.md §7).
-- Sem horário configurado (null, não-array ou lista vazia) nunca é "fechado":
-- desconhecido não pode virar "parado com desculpa de fechado".
create or replace function public.esta_aberto_agora(p_horario jsonb, p_fuso text)
returns boolean
language plpgsql
stable
as $$
declare
  v_local  timestamp := now() at time zone p_fuso;
  v_dia    int       := extract(dow from v_local)::int;   -- 0 = domingo
  v_hora   interval  := (v_local::time)::text::interval;
  v_item   jsonb;
  v_dia_abre int;
  v_abre   interval;
  v_fecha  interval;
begin
  if p_horario is null
     or jsonb_typeof(p_horario) <> 'array'
     or jsonb_array_length(p_horario) = 0 then
    return true;
  end if;

  for v_item in select * from jsonb_array_elements(p_horario) loop
    v_dia_abre := (v_item ->> 'dia')::int;
    v_abre     := ((v_item ->> 'abre')::time)::text::interval;
    v_fecha    := ((v_item ->> 'fecha')::time)::text::interval;

    if v_fecha > v_abre then
      if v_dia = v_dia_abre and v_hora >= v_abre and v_hora < v_fecha then
        return true;
      end if;
    else
      -- atravessa a meia-noite: aberto das v_abre (dia v_dia_abre) até v_fecha (dia seguinte)
      if (v_dia = v_dia_abre and v_hora >= v_abre) or
         (v_dia = (v_dia_abre + 1) % 7 and v_hora < v_fecha) then
        return true;
      end if;
    end if;
  end loop;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: habilitar + políticas, no mesmo arquivo (seguranca-e-isolamento.md §2)
-- ---------------------------------------------------------------------------

alter table public.restaurantes enable row level security;
alter table public.acessos enable row level security;
alter table public.admins_repply enable row level security;
alter table public.tokens_envio enable row level security;
alter table public.envios enable row level security;
alter table public.sinal_de_vida enable row level security;
alter table public.entradas enable row level security;
alter table public.metas enable row level security;

-- restaurantes: cliente lê o dele; admin lê e escreve todos. A escrita do cliente
-- nos turnos passa só por atualizar_turnos().
create policy "cliente ou admin leem o restaurante" on public.restaurantes
  for select using (public.tem_acesso(id) or public.eh_admin_repply());
create policy "só admin cria restaurante" on public.restaurantes
  for insert with check (public.eh_admin_repply());
create policy "só admin altera restaurante" on public.restaurantes
  for update using (public.eh_admin_repply()) with check (public.eh_admin_repply());
create policy "só admin exclui restaurante" on public.restaurantes
  for delete using (public.eh_admin_repply());

-- acessos: cliente lê os dele; admin lê e escreve todos.
create policy "quem é dono do acesso lê" on public.acessos
  for select using (user_id = auth.uid() or public.eh_admin_repply());
create policy "admin escreve acessos" on public.acessos
  for insert with check (public.eh_admin_repply());
create policy "admin altera acessos" on public.acessos
  for update using (public.eh_admin_repply()) with check (public.eh_admin_repply());
create policy "admin exclui acessos" on public.acessos
  for delete using (public.eh_admin_repply());

-- admins_repply: só admin Repply lê; ninguém escreve por RLS (só servidor).
create policy "admin repply lê" on public.admins_repply
  for select using (public.eh_admin_repply());

-- tokens_envio: só admin. A recepção (service role + processar_envio) passa por cima.
create policy "só admin lê token" on public.tokens_envio
  for select using (public.eh_admin_repply());
create policy "só admin cria token" on public.tokens_envio
  for insert with check (public.eh_admin_repply());
create policy "só admin altera token" on public.tokens_envio
  for update using (public.eh_admin_repply()) with check (public.eh_admin_repply());
create policy "só admin revoga token" on public.tokens_envio
  for delete using (public.eh_admin_repply());

-- envios: administrativo; a recepção escreve via processar_envio (service role).
create policy "admin lê envios" on public.envios
  for select using (public.eh_admin_repply());

-- sinal_de_vida: cliente lê o dele (selo "há X min"), admin lê todos.
create policy "cliente ou admin leem o sinal de vida" on public.sinal_de_vida
  for select using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());

-- entradas: cliente lê o dele; admin lê todos ("ver o painel do cliente", D-38 — só lê).
create policy "cliente ou admin leem entradas" on public.entradas
  for select using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());

-- metas: cliente lê e escreve o dele; admin lê todos, sem política de escrita.
create policy "cliente ou admin leem a meta" on public.metas
  for select using (public.tem_acesso(restaurante_id) or public.eh_admin_repply());
create policy "cliente cria a meta dele" on public.metas
  for insert with check (public.tem_acesso(restaurante_id));
create policy "cliente altera a meta dele" on public.metas
  for update using (public.tem_acesso(restaurante_id)) with check (public.tem_acesso(restaurante_id));
create policy "cliente exclui a meta dele" on public.metas
  for delete using (public.tem_acesso(restaurante_id));

-- ---------------------------------------------------------------------------
-- processar_envio: toda a gravação de um envio numa transação só
-- (recepcao-de-dados.md §3.8). Retorna o corpo do 200.
-- ---------------------------------------------------------------------------

-- Btrim que transforma texto vazio em NULL (normalização da recepção).
create or replace function public.btrim_null(p_texto text)
returns text
language sql
immutable
as $$ select nullif(btrim(p_texto), '') $$;

-- Valor monetário vindo do SCC -> numeric(12,2); vazio/nulo vira 0.
create or replace function public.normaliza_numeric(p_valor text)
returns numeric
language sql
immutable
as $$ select round(coalesce(nullif(btrim(p_valor), '')::numeric, 0), 2) $$;

create or replace function public.processar_envio(p_restaurante_id uuid, p_envelope jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_inicio        timestamptz := clock_timestamp();
  v_fuso          text;
  v_virada        time;
  v_intervalo     int;
  v_pedido        date;
  v_desde         date;
  v_ate           date;
  v_entradas      jsonb;
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
  v_desde      := (p_envelope -> 'janela' ->> 'desde')::date;
  v_ate        := (p_envelope -> 'janela' ->> 'ate')::date;
  v_modo       := p_envelope ->> 'modo';
  v_versao     := (p_envelope ->> 'versao_formato')::int;
  v_versao_scc := p_envelope ->> 'versao_scc';

  -- 4. defesa em profundidade (D-29): tira os dados pessoais das entradas ANTES
  --    de qualquer gravação, inclusive do payload guardado em envios
  select coalesce(jsonb_agg(
           ent - 'NomeCliente' - 'RG' - 'FoneCliente' - 'Sexo'
         ), '[]'::jsonb)
    into v_entradas
    from jsonb_array_elements(
           case when jsonb_typeof(p_envelope -> 'entradas') = 'array'
                then p_envelope -> 'entradas'
                else '[]'::jsonb
           end
         ) as ent;

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

    -- campos desconhecidos vão para extras (H3, B17): tudo que não é coluna
    v_extras := v_item
      - 'codEntrada' - 'DataEntrada' - 'HoraEntrada' - 'DataSaida' - 'HoraSaida'
      - 'ValorItens' - 'ValorDescontos' - 'ValorAcrescimos' - 'TaxaServico'
      - 'Complemento' - 'ValorConsumido' - 'Pago'
      - 'codCartaoMesa' - 'CodGarcon' - 'codOperadorHab' - 'codOperadorDesab'
      - 'codCliente' - 'NumeroOcupantes' - 'TipoOcupacao' - 'TipoCartao'
      - 'NomeCliente' - 'RG' - 'FoneCliente' - 'Sexo';

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

  -- 10. resumo do envio (payload já sem dados pessoais)
  v_duracao := greatest(1, round(extract(epoch from (clock_timestamp() - v_inicio)) * 1000)::int);

  insert into public.envios (
    restaurante_id, http_status, modo, versao_formato, versao_scc,
    janela_desde, janela_ate, recebidas, gravadas, inalteradas, removidas,
    payload, duracao_ms
  ) values (
    p_restaurante_id, 200, v_modo, v_versao, v_versao_scc,
    v_desde, v_ate, v_recebidas, v_gravadas, v_inalteradas, v_removidas,
    jsonb_set(p_envelope, '{entradas}', v_entradas), v_duracao
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

-- ---------------------------------------------------------------------------
-- atualizar_turnos: a única escrita do cliente em restaurantes (D-35)
-- ---------------------------------------------------------------------------

create or replace function public.atualizar_turnos(p_restaurante_id uuid, p_turnos jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.tem_acesso(p_restaurante_id) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  update public.restaurantes
     set turnos = p_turnos
   where id = p_restaurante_id;
  if not found then
    raise exception 'restaurante não encontrado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- recalcular_dia_operacao: depois de mudar fuso ou hora_virada (modelo-de-dados.md)
-- ---------------------------------------------------------------------------

create or replace function public.recalcular_dia_operacao(p_restaurante_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_fuso   text;
  v_virada time;
begin
  select fuso, hora_virada into v_fuso, v_virada
    from public.restaurantes where id = p_restaurante_id;
  if not found then
    raise exception 'restaurante não encontrado';
  end if;

  update public.entradas
     set dia_operacao = public.dia_operacao_de(aberta_em, v_fuso, v_virada),
         atualizada_em = now()
   where restaurante_id = p_restaurante_id and removida_em is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- atualizar_estados: o vigia do sinal de vida (recepcao-de-dados.md §7),
-- agendado no pg_cron a cada 5 minutos.
-- Estado: aguardando | fechado | em_dia | atrasado | parado.
-- O alarme chama a função enviar-alerta (tarefa futura) via pg_net, com a URL
-- guardada no Vault; sem a chave no Vault, o vigia apenas calcula os estados.
-- ---------------------------------------------------------------------------

create or replace function public.atualizar_estados()
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rec      record;
  v_estado   text;
  v_delta    interval;
  v_fechado  boolean;
  v_url      text;
  v_body     jsonb;
begin
  for v_rec in
    select s.restaurante_id, s.primeiro_envio_em, s.ultimo_envio_ok_em,
           s.estado as estado_atual, s.alarme_enviado_em,
           r.fuso, r.horario_funcionamento, r.nome
      from public.sinal_de_vida s
      join public.restaurantes r on r.id = s.restaurante_id
  loop
    v_fechado := not public.esta_aberto_agora(v_rec.horario_funcionamento, v_rec.fuso);

    if v_rec.primeiro_envio_em is null then
      v_estado := 'aguardando';
    elsif v_fechado then
      v_estado := 'fechado';
    else
      v_delta := now() - coalesce(v_rec.ultimo_envio_ok_em, v_rec.primeiro_envio_em);
      if v_delta <= interval '15 minutes' then
        v_estado := 'em_dia';
      elsif v_delta <= interval '45 minutes' then
        v_estado := 'atrasado';
      else
        v_estado := 'parado';
      end if;
    end if;

    if v_estado <> v_rec.estado_atual then
      update public.sinal_de_vida
         set estado = v_estado, estado_desde = now()
       where restaurante_id = v_rec.restaurante_id;
    end if;

    -- alarme: virou parado sem alarme neste incidente -> um e-mail
    if v_estado = 'parado' and v_rec.alarme_enviado_em is null then
      begin
        select decrypted_secret into v_url
          from vault.decrypted_secrets where name = 'pg_net_alert_url';
        if v_url is not null then
          v_body := jsonb_build_object(
            'tipo', 'parado',
            'restaurante_id', v_rec.restaurante_id,
            'nome', v_rec.nome
          );
          perform net.http_post(
            url := v_url,
            body := v_body,
            headers := '{"Content-Type": "application/json"}'::jsonb
          );
        end if;
      exception when others then
        null;  -- sem alarme não derruba o vigia
      end;
      update public.sinal_de_vida
         set alarme_enviado_em = now()
       where restaurante_id = v_rec.restaurante_id;
    elsif v_estado in ('em_dia', 'fechado') and v_rec.alarme_enviado_em is not null then
      -- voltou: avisa e limpa o alarme
      begin
        select decrypted_secret into v_url
          from vault.decrypted_secrets where name = 'pg_net_alert_url';
        if v_url is not null then
          v_body := jsonb_build_object(
            'tipo', 'voltou',
            'restaurante_id', v_rec.restaurante_id,
            'nome', v_rec.nome
          );
          perform net.http_post(
            url := v_url,
            body := v_body,
            headers := '{"Content-Type": "application/json"}'::jsonb
          );
        end if;
      exception when others then
        null;
      end;
      update public.sinal_de_vida
         set alarme_enviado_em = null
       where restaurante_id = v_rec.restaurante_id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Agendamentos no pg_cron (existem no Supabase gerenciado; aqui com guarda)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'cron' and p.proname = 'schedule'
  ) then
    -- vigia do sinal de vida, a cada 5 minutos
    perform cron.unschedule('rf-vigia') where exists (
      select 1 from cron.job where jobname = 'rf-vigia'
    );
    perform cron.schedule('rf-vigia', '*/5 * * * *', $cron$ select public.atualizar_estados() $cron$);

    -- retenção do payload de envios (recepcao-de-dados.md §6), uma vez por dia
    perform cron.unschedule('rf-retencao') where exists (
      select 1 from cron.job where jobname = 'rf-retencao'
    );
    perform cron.schedule('rf-retencao', '0 5 * * *', $ret$
      update public.envios set payload = null
       where http_status = 200 and recebido_em < now() - interval '48 hours'
         and payload is not null;
      update public.envios set payload = null
       where http_status <> 200 and recebido_em < now() - interval '90 days'
         and payload is not null;
    $ret$);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants explícitos
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select on public.restaurantes to authenticated;
grant select on public.acessos to authenticated;
grant select on public.admins_repply to authenticated;
grant select on public.envios to authenticated;
grant select on public.sinal_de_vida to authenticated;
grant select on public.entradas to authenticated;
grant select, insert, update, delete on public.metas to authenticated;
grant select, insert, update, delete on public.tokens_envio to authenticated;

grant execute on function public.eh_admin_repply() to anon, authenticated, service_role;
grant execute on function public.tem_acesso(uuid) to anon, authenticated, service_role;
grant execute on function public.dia_operacao_de(timestamptz, text, time) to anon, authenticated, service_role;
grant execute on function public.esta_aberto_agora(jsonb, text) to anon, authenticated, service_role;
grant execute on function public.processar_envio(uuid, jsonb) to service_role;
grant execute on function public.atualizar_turnos(uuid, jsonb) to authenticated, service_role;
grant execute on function public.recalcular_dia_operacao(uuid) to service_role;
grant execute on function public.atualizar_estados() to service_role;