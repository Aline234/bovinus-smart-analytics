begin;

create function bovinus.finance_json(f public.calculos_financeiros) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'saleKg',f.venda_kg,'sideKg',f.acompanhamento_kg,'meatG',f.carne_g,'sideG',f.acompanhamento_g,
    'meatCost',f.custo_carne,'sideCost',f.custo_acompanhamento,'revenue',f.receita,'cost',f.custo_total,
    'result',f.resultado,'cmv',f.cmv,'meatShare',f.percentual_carne,'at',f.calculado_em,'meatInputs',f.insumos
  )
$$;
revoke all on function bovinus.finance_json(public.calculos_financeiros) from public;

create function public.bovinus_load() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare w uuid := bovinus.workspace_atual();
begin
  if w is null then raise exception 'Conta sem acesso ao workspace.' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'version',1,'simulated',false,'revision',ws.revisao,
      'settings',jsonb_build_object('saleKg',c.preco_kg,'sideKg',c.custo_acompanhamento_kg,'popularity',c.popularidade,
        'waste',c.sobras,'minSample',c.amostra_minima,'minCoverage',c.cobertura_minima,'cmvAlert',c.alerta_cmv),
      'categories',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.nome) order by a.criado_em,a.id)
        from public.categorias_alimentos a where a.workspace=w),'[]'),
      'foods',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.nome,'categoryId',a.categoria_id,
        'kind',a.tipo,'active',a.ativo,'grams',coalesce((select jsonb_object_agg(s.tamanho,s.gramas) from public.porcoes_carne s
          where s.workspace=w and s.alimento_id=a.id),'{"pequena":0,"media":0,"grande":0}'),
        'costKg',coalesce((select s.custo_kg from public.custos_alimentos s where s.workspace=w and s.alimento_id=a.id order by s.id desc limit 1),0)
      ) order by a.criado_em,a.id) from public.alimentos a where a.workspace=w),'[]'),
      'menus',coalesce((select jsonb_object_agg(d.data,coalesce((select jsonb_agg(a.alimento_id order by a.alimento_id)
        from public.cardapio_diario a where a.workspace=w and a.data=d.data),'[]')) from public.cardapios d where d.workspace=w),'{}'),
      'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'number',t.numero,'openedAt',t.entrada_em,'closedAt',t.encerrada_em)
        order by t.entrada_em,t.id) from public.comandas t where t.workspace=w),'[]'),
      'plates',coalesce((select jsonb_agg(jsonb_build_object(
        'id',a.id,'ticketId',a.comanda_id,'sequence',a.sequencia,'createdAt',a.criado_em,'weighedAt',a.pesado_em,
        'weight',a.peso_liquido_g,'pricing',case when a.venda_kg is not null then jsonb_build_object('saleKg',a.venda_kg,'sideKg',a.acompanhamento_kg) end,
        'composition',a.composicao,'grillKnown',a.churrasqueira_confirmada,
        'foodIds',coalesce((select jsonb_agg(s.alimento_id order by s.alimento_id) from public.alimentos_prato s where s.workspace=w and s.prato_id=a.id),'[]'),
        'meats',coalesce((select jsonb_agg(jsonb_build_object('foodId',s.alimento_id,'size',s.tamanho,'count',s.quantidade,
          'grams',s.gramas_porcao,'costKg',s.custo_kg,'recordedAt',s.registrado_em) order by s.registrado_em,s.alimento_id,s.tamanho)
          from public.registros_churrasqueira s where s.workspace=w and s.prato_id=a.id),'[]'),
        'finance',(select bovinus.finance_json(s) from public.calculos_financeiros s where s.workspace=w and s.prato_id=a.id and s.id=a.calculo_atual_id),
        'financeHistory',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'finance',bovinus.finance_json(s)) order by s.ordem)
          from public.calculos_financeiros s where s.workspace=w and s.prato_id=a.id),'[]'),
        'waste',(select jsonb_build_object('at',s.recolhido_em,'note',s.observacoes,'plateClear',s.sem_sobras,
          'outcomes',coalesce((select jsonb_object_agg(v.alimento_id,v.intensidade) from public.registros_sobras v
            where v.workspace=w and v.prato_id=a.id),'{}'))
          from public.avaliacoes_prato s where s.workspace=w and s.prato_id=a.id)
      ) order by a.criado_em,a.id) from public.pratos a where a.workspace=w),'[]'),
      'discards',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'at',a.recolhido_em,'foodId',a.alimento_id,
        'level',a.intensidade,'note',a.observacoes) order by a.recolhido_em,a.id)
        from public.descartes_avulsos a where a.workspace=w),'[]')
    ) from bovinus.workspaces ws join public.configuracoes c on c.workspace=ws.id where ws.id=w
  );
end $$;

create function public.bovinus_commit(expected integer,p jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  w uuid := bovinus.workspace_atual();
  rev integer;
  a jsonb;
  f jsonb;
  s text;
  menu record;
  v record;
  plate_id text;
  active_finance text;
  grams_total bigint;
begin
  if w is null then raise exception 'Conta sem acesso ao workspace.' using errcode = '42501'; end if;
  select revisao into rev from bovinus.workspaces where id=w for update;
  if rev is distinct from expected then raise exception 'Revisão desatualizada.' using errcode = '40001'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Lote inválido.' using errcode = '22023'; end if;

  for a in select value from jsonb_array_elements(p->'categories') loop
    insert into public.categorias_alimentos(workspace,id,nome) values (w,a->>'id',a->>'name')
    on conflict (workspace,id) do update set nome=excluded.nome;
  end loop;
  for a in select value from jsonb_array_elements(p->'foods') loop
    if exists(select 1 from public.alimentos where workspace=w and id=a->>'id' and tipo<>a->>'kind') then
      raise exception 'O tipo do alimento não pode ser alterado.' using errcode = '23514';
    end if;
    insert into public.alimentos(workspace,id,categoria_id,nome,tipo,ativo)
    values (w,a->>'id',a->>'categoryId',a->>'name',a->>'kind',(a->>'active')::boolean)
    on conflict (workspace,id) do update set nome=excluded.nome,categoria_id=excluded.categoria_id,ativo=excluded.ativo;
    if a->>'kind'='meat' then
      if not ((a->'grams'->>'pequena')::int > 0 and (a->'grams'->>'pequena')::int <= (a->'grams'->>'media')::int
        and (a->'grams'->>'media')::int <= (a->'grams'->>'grande')::int) then
        raise exception 'Ordem inválida para as porções.' using errcode = '23514';
      end if;
      for s in select unnest(array['pequena','media','grande']) loop
        insert into public.porcoes_carne(workspace,alimento_id,tamanho,gramas) values (w,a->>'id',s,(a->'grams'->>s)::int)
        on conflict (workspace,alimento_id,tamanho) do update set gramas=excluded.gramas,alterado_em=now();
      end loop;
      if (select custo_kg from public.custos_alimentos where workspace=w and alimento_id=a->>'id' order by id desc limit 1)
        is distinct from (a->>'costKg')::numeric then
        insert into public.custos_alimentos(workspace,alimento_id,custo_kg) values (w,a->>'id',(a->>'costKg')::numeric);
      end if;
    end if;
  end loop;

  for menu in select * from jsonb_each(p->'menus') loop
    insert into public.cardapios(workspace,data) values(w,menu.key::date)
    on conflict (workspace,data) do update set alterado_em=now();
    delete from public.cardapio_diario where workspace=w and data=menu.key::date;
    insert into public.cardapio_diario(workspace,data,alimento_id)
    select w,menu.key::date,value from jsonb_array_elements_text(menu.value);
  end loop;

  a := p->'settings';
  if jsonb_typeof(a)='object' then
    insert into public.configuracoes(workspace,preco_kg,custo_acompanhamento_kg,popularidade,sobras,amostra_minima,cobertura_minima,alerta_cmv)
    values(w,(a->>'saleKg')::numeric,(a->>'sideKg')::numeric,(a->>'popularity')::numeric,(a->>'waste')::numeric,
      (a->>'minSample')::int,(a->>'minCoverage')::numeric,(a->>'cmvAlert')::numeric)
    on conflict(workspace) do update set preco_kg=excluded.preco_kg,custo_acompanhamento_kg=excluded.custo_acompanhamento_kg,
      popularidade=excluded.popularidade,sobras=excluded.sobras,amostra_minima=excluded.amostra_minima,
      cobertura_minima=excluded.cobertura_minima,alerta_cmv=excluded.alerta_cmv,alterado_em=now();
  end if;

  for a in select value from jsonb_array_elements(p->'tickets') loop
    insert into public.comandas(workspace,id,numero,entrada_em,encerrada_em)
    values (w,a->>'id',a->>'number',(a->>'openedAt')::timestamptz,(a->>'closedAt')::timestamptz)
    on conflict(workspace,id) do update set encerrada_em=excluded.encerrada_em;
  end loop;

  for a in select value from jsonb_array_elements(p->'plates') loop
    plate_id := a->>'id';
    active_finance := null;
    select coalesce(sum((m->>'count')::int * (m->>'grams')::int),0) into grams_total
      from jsonb_array_elements(a->'meats') m;
    if grams_total > coalesce((a->>'weight')::int,grams_total) then
      raise exception 'Porções acima do peso líquido.' using errcode = '23514';
    end if;
    if not (a->>'grillKnown')::boolean and grams_total>0 then
      raise exception 'Confirme as carnes registradas.' using errcode = '23514';
    end if;
    if a->>'composition'='desconhecida' and jsonb_array_length(a->'foodIds')>0 then
      raise exception 'A composição precisa ser identificada.' using errcode = '23514';
    end if;
    if exists(select 1 from public.comandas t where t.workspace=w and t.id=a->>'ticketId' and t.entrada_em>(a->>'createdAt')::timestamptz) then
      raise exception 'O prato precede a entrada da comanda.' using errcode = '23514';
    end if;
    insert into public.pratos(workspace,id,comanda_id,sequencia,criado_em,pesado_em,peso_liquido_g,venda_kg,acompanhamento_kg,composicao,churrasqueira_confirmada)
    values (w,plate_id,a->>'ticketId',(a->>'sequence')::int,(a->>'createdAt')::timestamptz,(a->>'weighedAt')::timestamptz,
      (a->>'weight')::int,(a->'pricing'->>'saleKg')::numeric,(a->'pricing'->>'sideKg')::numeric,a->>'composition',(a->>'grillKnown')::boolean)
    on conflict(workspace,id) do update set pesado_em=excluded.pesado_em,peso_liquido_g=excluded.peso_liquido_g,
      venda_kg=coalesce(pratos.venda_kg,excluded.venda_kg),acompanhamento_kg=coalesce(pratos.acompanhamento_kg,excluded.acompanhamento_kg),
      composicao=excluded.composicao,churrasqueira_confirmada=excluded.churrasqueira_confirmada;

    delete from public.alimentos_prato where workspace=w and prato_id=plate_id;
    for s in select value from jsonb_array_elements_text(a->'foodIds') loop
      if not exists(select 1 from public.alimentos where workspace=w and id=s and tipo='buffet') then
        raise exception 'Selecione acompanhamentos cadastrados.' using errcode = '23514';
      end if;
      insert into public.alimentos_prato(workspace,prato_id,alimento_id) values (w,plate_id,s);
    end loop;

    delete from public.registros_churrasqueira where workspace=w and prato_id=plate_id;
    for f in select value from jsonb_array_elements(a->'meats') loop
      insert into public.registros_churrasqueira(workspace,prato_id,alimento_id,tamanho,quantidade,gramas_porcao,custo_kg,registrado_em)
      values(w,plate_id,f->>'foodId',f->>'size',(f->>'count')::int,(f->>'grams')::int,(f->>'costKg')::numeric,(f->>'recordedAt')::timestamptz);
    end loop;

    for v in select * from jsonb_array_elements(a->'financeHistory') with ordinality loop
      f := v.value->'finance';
      insert into public.calculos_financeiros(workspace,prato_id,id,calculado_em,venda_kg,acompanhamento_kg,carne_g,acompanhamento_g,
        custo_carne,custo_acompanhamento,receita,custo_total,resultado,cmv,percentual_carne,insumos,ordem)
      values(w,plate_id,v.value->>'id',(f->>'at')::timestamptz,(f->>'saleKg')::numeric,(f->>'sideKg')::numeric,
        (f->>'meatG')::int,(f->>'sideG')::int,(f->>'meatCost')::numeric,(f->>'sideCost')::numeric,(f->>'revenue')::numeric,
        (f->>'cost')::numeric,(f->>'result')::numeric,(f->>'cmv')::numeric,(f->>'meatShare')::numeric,coalesce(f->'meatInputs','[]'),v.ordinality)
      on conflict(workspace,prato_id,id) do nothing;
      active_finance := v.value->>'id';
    end loop;
    update public.pratos set calculo_atual_id=case when jsonb_typeof(a->'finance')='object' then active_finance end where workspace=w and id=plate_id;

    f := a->'waste';
    if jsonb_typeof(f)='object' then
      if date_trunc('minute',(f->>'at')::timestamptz) < date_trunc('minute',(a->>'createdAt')::timestamptz) then
        raise exception 'Recolhimento anterior ao registro do prato.' using errcode = '23514';
      end if;
      if (f->>'plateClear')::boolean and exists(select 1 from jsonb_each_text(f->'outcomes') where value in ('pequena','media','grande')) then
        raise exception 'A avaliação sem sobras contém intensidades de sobra.' using errcode = '23514';
      end if;
      insert into public.avaliacoes_prato(workspace,prato_id,recolhido_em,observacoes,sem_sobras)
      values(w,plate_id,(f->>'at')::timestamptz,f->>'note',coalesce((f->>'plateClear')::boolean,false))
      on conflict(workspace,prato_id) do update set recolhido_em=excluded.recolhido_em,observacoes=excluded.observacoes,sem_sobras=excluded.sem_sobras;
      delete from public.registros_sobras where workspace=w and prato_id=plate_id;
      insert into public.registros_sobras(workspace,prato_id,alimento_id,intensidade)
      select w,plate_id,key,value from jsonb_each_text(f->'outcomes');
    end if;
  end loop;

  for a in select value from jsonb_array_elements(p->'discards') loop
    insert into public.descartes_avulsos(workspace,id,alimento_id,recolhido_em,intensidade,observacoes)
    values(w,a->>'id',a->>'foodId',(a->>'at')::timestamptz,a->>'level',a->>'note')
    on conflict(workspace,id) do update set alimento_id=excluded.alimento_id,recolhido_em=excluded.recolhido_em,intensidade=excluded.intensidade,observacoes=excluded.observacoes;
  end loop;

  update bovinus.workspaces set revisao=rev+1 where id=w;
  return rev+1;
end $$;

revoke all on function public.bovinus_load() from public, anon, authenticated;
revoke all on function public.bovinus_commit(integer,jsonb) from public, anon, authenticated;
grant execute on function public.bovinus_load() to authenticated;
grant execute on function public.bovinus_commit(integer,jsonb) to authenticated;
commit;
