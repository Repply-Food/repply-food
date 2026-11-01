begin;

alter table public.cargas_scc
  add column chave_escopo text generated always as (
    case when tipo_envio in ('entradas','cadastro_produtos') then tipo_envio
    else lpad(extract(year from dia_movimento)::integer::text,4,'0') || '-' ||
      lpad(extract(month from dia_movimento)::integer::text,2,'0') || '-' ||
      lpad(extract(day from dia_movimento)::integer::text,2,'0') || '|' || fonte end
  ) stored,
  add constraint cargas_scc_cursor_chave unique (restaurante_id,id_envio,tipo_envio,sequencia,chave_escopo),
  add constraint cargas_scc_fotografia_chave unique (restaurante_id,id_envio,tipo_envio,sequencia,dia_movimento,fonte);

alter table public.cursores_scc
  add constraint cursores_scc_carga_escopo_fk
  foreign key (restaurante_id,id_envio,tipo_envio,sequencia,chave_escopo)
  references public.cargas_scc (restaurante_id,id_envio,tipo_envio,sequencia,chave_escopo);

alter table public.fotografias_scc
  add constraint fotografias_scc_carga_escopo_fk
  foreign key (restaurante_id,id_envio,tipo_envio,sequencia,dia_movimento,fonte)
  references public.cargas_scc (restaurante_id,id_envio,tipo_envio,sequencia,dia_movimento,fonte);

do $$
declare alvo record;
begin
  for alvo in select * from (values
    ('produtos_scc','codigo_produto'),('produtos_scc','codigo_grupo'),
    ('itens_vendidos_scc','codigo_entrada'),('itens_vendidos_scc','codigo_produto'),
    ('itens_vendidos_scc','codigo_pdv'),('itens_vendidos_scc','codigo_grupo'),('itens_vendidos_scc','codigo_garcom'),
    ('comissoes_scc','codigo_operador'),
    ('movimentos_caixa_scc','codigo_lancamento'),('movimentos_caixa_scc','codigo_operador'),('movimentos_caixa_scc','codigo_categoria'),
    ('eventos_auditoria_scc','codigo_operador'),('eventos_auditoria_scc','cartao_anterior'),('eventos_auditoria_scc','cartao_novo'),('eventos_auditoria_scc','codigo_produto'),
    ('notas_assinadas_scc','codigo_nota'),('notas_assinadas_scc','codigo_entrada'),('notas_assinadas_scc','codigo_cliente'),
    ('financeiro_meios_scc','codigo')
  ) as campos(tabela,coluna) loop
    execute format('alter table public.%I add constraint %I check (%I ~ %L)',
      alvo.tabela, alvo.coluna || '_formato_scc', alvo.coluna, '^[A-Za-z0-9_.-]{1,80}$');
  end loop;

  for alvo in select * from (values
    ('produtos_scc','produto',120),('produtos_scc','grupo',120),
    ('itens_vendidos_scc','produto',120),('itens_vendidos_scc','pdv',120),('itens_vendidos_scc','grupo',120),('itens_vendidos_scc','garcom',120),
    ('comissoes_scc','operador',120),('comissoes_scc','funcao',80),
    ('movimentos_caixa_scc','operador',120),('movimentos_caixa_scc','categoria',120),
    ('eventos_auditoria_scc','operador',120),('eventos_auditoria_scc','produto',120),
    ('financeiro_meios_scc','rotulo',120)
  ) as campos(tabela,coluna,tamanho) loop
    execute format('alter table public.%I add constraint %I check (char_length(%I) between 1 and %s and %I !~ %L)',
      alvo.tabela, alvo.coluna || '_formato_scc', alvo.coluna, alvo.tamanho, alvo.coluna, U&'[\0001-\001F\007F-\009F]');
  end loop;

  for alvo in select unnest(array['cargas_scc','fotografias_scc']) as tabela loop
    execute format($sql$alter table public.%I add constraint recursos_formato_scc check (
      array_position(recursos,null) is null and
      recursos <@ array['pdv','grupo','garcom','mesa','operador','tipo','categoria','cliente']::text[] and
      cardinality(recursos) = (
        (case when 'pdv'=any(recursos) then 1 else 0 end) +
        (case when 'grupo'=any(recursos) then 1 else 0 end) +
        (case when 'garcom'=any(recursos) then 1 else 0 end) +
        (case when 'mesa'=any(recursos) then 1 else 0 end) +
        (case when 'operador'=any(recursos) then 1 else 0 end) +
        (case when 'tipo'=any(recursos) then 1 else 0 end) +
        (case when 'categoria'=any(recursos) then 1 else 0 end) +
        (case when 'cliente'=any(recursos) then 1 else 0 end)))$sql$, alvo.tabela);
  end loop;
end $$;

commit;
