begin;

create table public.cargas_scc (
  restaurante_id uuid not null references public.restaurantes(id),
  id_envio uuid not null,
  tipo_envio text not null check (tipo_envio in ('entradas','cadastro_produtos','itens_vendidos','comissoes','movimentos_caixa','eventos_auditoria','notas_assinadas','financeiro')),
  modo text not null check (modo in ('janela','incremental','fotografia')),
  sequencia bigint not null check (sequencia > 0),
  natureza text not null check (natureza in ('scc','simulacao')),
  versao_scc text not null,
  enviado_em timestamptz not null,
  janela_desde date, janela_ate date,
  dia_movimento date, fonte text check (fonte in ('online','historico')),
  recursos text[] not null default '{}',
  total_paginas integer not null check (total_paginas between 1 and 200),
  total_registros integer not null check (total_registros between 0 and 100000),
  estado text not null default 'recebendo' check (estado in ('recebendo','publicada','substituida','expirada')),
  bytes_recebidos bigint not null default 0 check (bytes_recebidos between 0 and 33554432),
  recibo jsonb,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  publicada_em timestamptz,
  primary key (restaurante_id, id_envio),
  check ((tipo_envio = 'entradas' and modo = 'janela' and janela_desde is not null and janela_ate is not null and janela_desde <= janela_ate and dia_movimento is null and fonte is null)
    or (tipo_envio = 'cadastro_produtos' and modo = 'incremental' and janela_desde is null and janela_ate is null and dia_movimento is null and fonte is null)
    or (tipo_envio not in ('entradas','cadastro_produtos') and modo = 'fotografia' and janela_desde is null and janela_ate is null and dia_movimento is not null and fonte is not null))
);

create table public.paginas_scc (
  restaurante_id uuid not null, id_envio uuid not null,
  numero integer not null check (numero between 1 and 200),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  quantidade integer not null check (quantidade between 0 and 500),
  bytes integer not null check (bytes between 0 and 1048576),
  dados jsonb,
  primary key (restaurante_id,id_envio,numero),
  foreign key (restaurante_id,id_envio) references public.cargas_scc(restaurante_id,id_envio),
  check (dados is null or (jsonb_typeof(dados) = 'array' and jsonb_array_length(dados) = quantidade))
);

create table public.cursores_scc (
  restaurante_id uuid not null references public.restaurantes(id),
  tipo_envio text not null check (tipo_envio in ('entradas','cadastro_produtos','itens_vendidos','comissoes','movimentos_caixa','eventos_auditoria','notas_assinadas','financeiro')),
  chave_escopo text not null,
  sequencia bigint not null check (sequencia > 0),
  id_envio uuid not null,
  primary key (restaurante_id,tipo_envio,chave_escopo),
  foreign key (restaurante_id,id_envio) references public.cargas_scc(restaurante_id,id_envio),
  check ((tipo_envio in ('entradas','cadastro_produtos') and chave_escopo = tipo_envio)
    or (tipo_envio not in ('entradas','cadastro_produtos') and chave_escopo ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\|(online|historico)$'))
);

create table public.fotografias_scc (
  restaurante_id uuid not null references public.restaurantes(id),
  tipo_envio text not null check (tipo_envio in ('itens_vendidos','comissoes','movimentos_caixa','eventos_auditoria','notas_assinadas','financeiro')),
  dia_movimento date not null, fonte text not null check (fonte in ('online','historico')),
  id_envio uuid not null, sequencia bigint not null check (sequencia > 0),
  natureza text not null check (natureza in ('scc','simulacao')),
  recursos text[] not null, quantidade integer not null check (quantidade between 0 and 100000),
  capturado_em timestamptz not null, publicado_em timestamptz not null default now(),
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte),
  foreign key (restaurante_id,id_envio) references public.cargas_scc(restaurante_id,id_envio)
);

create table public.revisoes_scc (
  restaurante_id uuid primary key references public.restaurantes(id),
  revisao bigint not null default 0 check (revisao >= 0)
);
create table public.limites_requisicao_scc (
  restaurante_id uuid primary key references public.restaurantes(id),
  inicio_janela timestamptz not null, quantidade integer not null check (quantidade >= 0)
);
create table public.produtos_scc (
  restaurante_id uuid not null references public.restaurantes(id),
  codigo_produto text not null, produto text not null, codigo_grupo text, grupo text,
  preco_custo_atual numeric(20,6), ativo boolean not null, alterado_em timestamptz not null,
  primary key (restaurante_id,codigo_produto)
);

create table public.itens_vendidos_scc (
  restaurante_id uuid not null, tipo_envio text not null default 'itens_vendidos' check (tipo_envio = 'itens_vendidos'),
  dia_movimento date not null, fonte text not null, posicao integer not null check (posicao between 1 and 100000),
  codigo_entrada text not null, ordinal integer not null check (ordinal >= 0), codigo_produto text not null, produto text not null,
  codigo_pdv text, pdv text, codigo_grupo text, grupo text, codigo_garcom text, garcom text, mesa integer,
  quantidade numeric(20,6) not null, vendas numeric(20,6) not null, custos numeric(20,6),
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte,posicao),
  unique (restaurante_id,dia_movimento,fonte,codigo_entrada,ordinal),
  foreign key (restaurante_id,tipo_envio,dia_movimento,fonte) references public.fotografias_scc(restaurante_id,tipo_envio,dia_movimento,fonte)
);
create table public.comissoes_scc (
  restaurante_id uuid not null, tipo_envio text not null default 'comissoes' check (tipo_envio = 'comissoes'),
  dia_movimento date not null, fonte text not null, posicao integer not null check (posicao between 1 and 100000),
  codigo_operador text not null, operador text, funcao text, vendas_elegiveis numeric(20,6) not null, comissao_oficial numeric(20,6),
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte,posicao),
  unique (restaurante_id,dia_movimento,fonte,codigo_operador),
  foreign key (restaurante_id,tipo_envio,dia_movimento,fonte) references public.fotografias_scc(restaurante_id,tipo_envio,dia_movimento,fonte)
);
create table public.movimentos_caixa_scc (
  restaurante_id uuid not null, tipo_envio text not null default 'movimentos_caixa' check (tipo_envio = 'movimentos_caixa'),
  dia_movimento date not null, fonte text not null, posicao integer not null check (posicao between 1 and 100000),
  codigo_lancamento text not null, momento timestamptz not null, codigo_operador text, operador text,
  tipo text not null check (tipo in ('credito','debito')), codigo_categoria text not null, categoria text not null,
  valor numeric(20,6) not null check (valor >= 0),
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte,posicao),
  unique (restaurante_id,dia_movimento,fonte,codigo_lancamento),
  foreign key (restaurante_id,tipo_envio,dia_movimento,fonte) references public.fotografias_scc(restaurante_id,tipo_envio,dia_movimento,fonte)
);
create table public.eventos_auditoria_scc (
  restaurante_id uuid not null, tipo_envio text not null default 'eventos_auditoria' check (tipo_envio = 'eventos_auditoria'),
  dia_movimento date not null, fonte text not null, posicao integer not null check (posicao between 1 and 100000),
  tipo text not null check (tipo in ('cancelamento_produto','perda_cartao','alteracao_limites','exclusao_taxa_servico','transferencia_produtos')),
  momento timestamptz not null, codigo_operador text, operador text, cartao_anterior text, cartao_novo text,
  codigo_produto text, produto text, quantidade numeric(20,6), valor_unitario numeric(20,6), total numeric(20,6),
  limite_minimo_anterior numeric(20,6), limite_minimo_novo numeric(20,6), limite_maximo_anterior numeric(20,6), limite_maximo_novo numeric(20,6),
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte,posicao),
  foreign key (restaurante_id,tipo_envio,dia_movimento,fonte) references public.fotografias_scc(restaurante_id,tipo_envio,dia_movimento,fonte)
);
create table public.notas_assinadas_scc (
  restaurante_id uuid not null, tipo_envio text not null default 'notas_assinadas' check (tipo_envio = 'notas_assinadas'),
  dia_movimento date not null, fonte text not null, posicao integer not null check (posicao between 1 and 100000),
  codigo_nota text not null, codigo_entrada text not null, codigo_cliente text not null, valor numeric(20,6) not null check (valor >= 0),
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte,posicao),
  unique (restaurante_id,dia_movimento,fonte,codigo_nota),
  foreign key (restaurante_id,tipo_envio,dia_movimento,fonte) references public.fotografias_scc(restaurante_id,tipo_envio,dia_movimento,fonte)
);
create table public.financeiro_scc (
  restaurante_id uuid not null, tipo_envio text not null default 'financeiro' check (tipo_envio = 'financeiro'),
  dia_movimento date not null, fonte text not null, posicao integer not null default 1 check (posicao = 1),
  consumo numeric(20,6), servico numeric(20,6), complemento numeric(20,6), taxas_entrada numeric(20,6), produto_embutido numeric(20,6), flyers numeric(20,6),
  projetado numeric(20,6), recebido numeric(20,6), notas_assinadas numeric(20,6), descontos numeric(20,6),
  habilitados integer check (habilitados >= 0), reabilitados integer check (reabilitados >= 0), encerrados integer check (encerrados >= 0), abertos integer check (abertos >= 0),
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte),
  foreign key (restaurante_id,tipo_envio,dia_movimento,fonte) references public.fotografias_scc(restaurante_id,tipo_envio,dia_movimento,fonte)
);
create table public.financeiro_meios_scc (
  restaurante_id uuid not null, tipo_envio text not null default 'financeiro' check (tipo_envio = 'financeiro'),
  dia_movimento date not null, fonte text not null, posicao integer not null check (posicao between 1 and 100),
  codigo text not null, rotulo text not null, classe text not null check (classe in ('dinheiro','credito','debito','pix','nota_assinada','desconto','outro')), valor numeric(20,6) not null,
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte,posicao),
  unique (restaurante_id,dia_movimento,fonte,codigo),
  foreign key (restaurante_id,tipo_envio,dia_movimento,fonte) references public.financeiro_scc(restaurante_id,tipo_envio,dia_movimento,fonte)
);
create table public.financeiro_publico_scc (
  restaurante_id uuid not null, tipo_envio text not null default 'financeiro' check (tipo_envio = 'financeiro'),
  dia_movimento date not null, fonte text not null, posicao integer not null check (posicao between 1 and 21),
  sexo text not null check (sexo in ('masculino','feminino','nao_informado')),
  categoria text not null check (categoria in ('pagante','convidado','lista','camarote','vip','servico','outro')),
  quantidade integer not null check (quantidade >= 0),
  primary key (restaurante_id,tipo_envio,dia_movimento,fonte,posicao),
  unique (restaurante_id,dia_movimento,fonte,sexo,categoria),
  foreign key (restaurante_id,tipo_envio,dia_movimento,fonte) references public.financeiro_scc(restaurante_id,tipo_envio,dia_movimento,fonte)
);

create index cargas_scc_expiracao on public.cargas_scc (estado,criada_em);
create index fotografias_scc_intervalo on public.fotografias_scc (restaurante_id,fonte,dia_movimento);

do $$
declare tabela text;
begin
  foreach tabela in array array['cargas_scc','paginas_scc','cursores_scc','fotografias_scc','revisoes_scc','limites_requisicao_scc','produtos_scc','itens_vendidos_scc','comissoes_scc','movimentos_caixa_scc','eventos_auditoria_scc','notas_assinadas_scc','financeiro_scc','financeiro_meios_scc','financeiro_publico_scc'] loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', tabela);
    execute format('create trigger %I before update on public.%I for each row execute function public.freeze_restaurante_id()', tabela || '_freeze_restaurante', tabela);
    if tabela not in ('cargas_scc','paginas_scc','cursores_scc','limites_requisicao_scc') then
      execute format('grant select on public.%I to authenticated', tabela);
      execute format('create policy %I on public.%I for select to authenticated using (public.tem_acesso(restaurante_id) or public.eh_admin_repply())', tabela || '_leitura', tabela);
    end if;
    if tabela in ('itens_vendidos_scc','comissoes_scc','movimentos_caixa_scc','eventos_auditoria_scc','notas_assinadas_scc','financeiro_scc','financeiro_meios_scc','financeiro_publico_scc') then
      execute format('create index %I on public.%I (restaurante_id,fonte,dia_movimento)', tabela || '_intervalo', tabela);
    end if;
  end loop;
end $$;

commit;
