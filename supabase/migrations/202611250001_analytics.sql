begin;

create schema if not exists bovinus;
revoke all on schema bovinus from public;
grant usage on schema bovinus to authenticated;

create table bovinus.workspaces (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  revisao integer not null default 0 check (revisao >= 0),
  criado_em timestamptz not null default now()
);
create table bovinus.membros (
  usuario uuid primary key references auth.users(id) on delete cascade,
  workspace uuid not null references bovinus.workspaces(id) on delete cascade
);
create function bovinus.workspace_atual() returns uuid
language sql stable security definer set search_path = '' as $$
  select workspace from bovinus.membros where usuario = (select auth.uid())
$$;
revoke all on function bovinus.workspace_atual() from public;
grant execute on function bovinus.workspace_atual() to authenticated;

create table public.categorias_alimentos (
  workspace uuid not null references bovinus.workspaces(id),
  id text not null, nome text not null check (length(trim(nome)) between 2 and 80),
  criado_em timestamptz not null default now(), primary key (workspace,id)
);
create unique index categorias_nome on public.categorias_alimentos(workspace, lower(nome));

create table public.alimentos (
  workspace uuid not null references bovinus.workspaces(id),
  id text not null, categoria_id text not null,
  nome text not null check (length(trim(nome)) between 2 and 80),
  tipo text not null check (tipo in ('buffet','meat')), ativo boolean not null default true,
  criado_em timestamptz not null default now(), primary key (workspace,id),
  foreign key (workspace,categoria_id) references public.categorias_alimentos(workspace,id)
);
create unique index alimentos_nome on public.alimentos(workspace, lower(nome));
create index alimentos_categoria on public.alimentos(workspace,categoria_id);

create table public.porcoes_carne (
  workspace uuid not null, alimento_id text not null,
  tamanho text not null check (tamanho in ('pequena','media','grande')),
  gramas integer not null check (gramas between 1 and 5000),
  alterado_em timestamptz not null default now(), primary key (workspace,alimento_id,tamanho),
  foreign key (workspace,alimento_id) references public.alimentos(workspace,id)
);
create table public.custos_alimentos (
  id bigint generated always as identity primary key, workspace uuid not null, alimento_id text not null,
  custo_kg numeric(10,2) not null check (custo_kg between 0 and 99999), vigente_em timestamptz not null default clock_timestamp(),
  foreign key (workspace,alimento_id) references public.alimentos(workspace,id)
);
create index custos_vigencia on public.custos_alimentos(workspace,alimento_id,id desc);

create table public.cardapios (
  workspace uuid not null references bovinus.workspaces(id), data date not null,
  alterado_em timestamptz not null default now(), primary key(workspace,data)
);
create table public.cardapio_diario (
  workspace uuid not null, data date not null, alimento_id text not null,
  primary key (workspace,data,alimento_id),
  foreign key (workspace,data) references public.cardapios(workspace,data) on delete cascade,
  foreign key (workspace,alimento_id) references public.alimentos(workspace,id)
);
create index cardapio_alimento on public.cardapio_diario(workspace,alimento_id,data);

create table public.comandas (
  workspace uuid not null references bovinus.workspaces(id), id text not null,
  numero text not null check (numero ~ '^[0-9]{4,8}$'), entrada_em timestamptz not null,
  encerrada_em timestamptz check (encerrada_em >= entrada_em), primary key (workspace,id)
);
create unique index comandas_abertas on public.comandas(workspace,(numero::integer)) where encerrada_em is null;
create index comandas_entrada on public.comandas(workspace,entrada_em);

create table public.pratos (
  workspace uuid not null, id text not null, comanda_id text not null, sequencia integer not null check (sequencia > 0),
  criado_em timestamptz not null, pesado_em timestamptz check (pesado_em >= criado_em),
  peso_liquido_g integer check (peso_liquido_g between 1 and 20000),
  venda_kg numeric(10,2) check (venda_kg between 0 and 99999),
  acompanhamento_kg numeric(10,2) check (acompanhamento_kg between 0 and 99999),
  composicao text not null check (composicao in ('completa','parcial','desconhecida')),
  churrasqueira_confirmada boolean not null, calculo_atual_id text,
  check ((peso_liquido_g is null) = (pesado_em is null)),
  check ((venda_kg is null) = (acompanhamento_kg is null)),
  primary key (workspace,id), unique (workspace,comanda_id,sequencia),
  foreign key (workspace,comanda_id) references public.comandas(workspace,id)
);
create index pratos_data on public.pratos(workspace,(coalesce(pesado_em,criado_em)));
create table public.alimentos_prato (
  workspace uuid not null, prato_id text not null, alimento_id text not null, criado_em timestamptz not null default now(),
  primary key(workspace,prato_id,alimento_id),
  foreign key(workspace,prato_id) references public.pratos(workspace,id) on delete cascade,
  foreign key(workspace,alimento_id) references public.alimentos(workspace,id)
);
create index pratos_por_alimento on public.alimentos_prato(workspace,alimento_id,prato_id);
create table public.registros_churrasqueira (
  workspace uuid not null, prato_id text not null, alimento_id text not null,
  tamanho text not null check (tamanho in ('pequena','media','grande')),
  quantidade integer not null check (quantidade between 1 and 99),
  gramas_porcao integer not null check (gramas_porcao between 1 and 5000),
  custo_kg numeric(10,2) not null check (custo_kg between 0 and 99999),
  registrado_em timestamptz not null,
  primary key (workspace,prato_id,alimento_id,tamanho),
  foreign key(workspace,prato_id) references public.pratos(workspace,id) on delete cascade,
  foreign key(workspace,alimento_id,tamanho) references public.porcoes_carne(workspace,alimento_id,tamanho)
);
create index churrasqueira_data on public.registros_churrasqueira(workspace,registrado_em,alimento_id);

create table public.avaliacoes_prato (
  workspace uuid not null, prato_id text not null, recolhido_em timestamptz not null,
  observacoes text not null default '' check (length(observacoes) <= 500),
  sem_sobras boolean not null default false,
  primary key (workspace,prato_id),
  foreign key(workspace,prato_id) references public.pratos(workspace,id) on delete cascade
);
create table public.registros_sobras (
  workspace uuid not null, prato_id text not null, alimento_id text not null,
  intensidade text not null check (intensidade in ('nao_avaliado','sem_sobra','pequena','media','grande')),
  alterado_em timestamptz not null default now(), primary key(workspace,prato_id,alimento_id),
  foreign key(workspace,prato_id) references public.avaliacoes_prato(workspace,prato_id) on delete cascade,
  foreign key(workspace,alimento_id) references public.alimentos(workspace,id)
);
create index sobras_por_alimento on public.registros_sobras(workspace,alimento_id,intensidade);
create table public.descartes_avulsos (
  workspace uuid not null references bovinus.workspaces(id), id text not null, alimento_id text,
  recolhido_em timestamptz not null, intensidade text not null check (intensidade in ('pequena','media','grande')),
  observacoes text not null default '' check (length(observacoes) <= 500), primary key(workspace,id),
  foreign key(workspace,alimento_id) references public.alimentos(workspace,id)
);
create index descartes_data on public.descartes_avulsos(workspace,recolhido_em);

create table public.calculos_financeiros (
  workspace uuid not null, prato_id text not null, id text not null, calculado_em timestamptz not null,
  venda_kg numeric(10,2) not null check (venda_kg >= 0),
  acompanhamento_kg numeric(10,2) not null check (acompanhamento_kg >= 0),
  carne_g integer not null check (carne_g >= 0), acompanhamento_g integer not null check (acompanhamento_g >= 0),
  custo_carne numeric(12,2) not null check (custo_carne >= 0),
  custo_acompanhamento numeric(12,2) not null check (custo_acompanhamento >= 0),
  receita numeric(12,2) not null check (receita >= 0),
  custo_total numeric(12,2) not null check (custo_total = custo_carne + custo_acompanhamento),
  resultado numeric(12,2) not null check (resultado = receita - custo_total),
  cmv numeric check (cmv >= 0), percentual_carne numeric not null check (percentual_carne between 0 and 100),
  insumos jsonb not null check (jsonb_typeof(insumos) = 'array'),
  ordem integer not null check (ordem > 0), primary key(workspace,prato_id,id), unique(workspace,prato_id,ordem),
  foreign key(workspace,prato_id) references public.pratos(workspace,id) on delete cascade
);
alter table public.pratos add constraint pratos_calculo_atual
  foreign key (workspace,id,calculo_atual_id) references public.calculos_financeiros(workspace,prato_id,id) deferrable initially deferred;

create table public.configuracoes (
  workspace uuid primary key references bovinus.workspaces(id),
  preco_kg numeric(10,2) not null check (preco_kg between 0 and 99999),
  custo_acompanhamento_kg numeric(10,2) not null check (custo_acompanhamento_kg between 0 and 99999),
  popularidade numeric(5,2) not null check (popularidade between 0 and 100),
  sobras numeric(5,2) not null check (sobras between 0 and 100),
  amostra_minima integer not null check (amostra_minima between 1 and 10000),
  cobertura_minima numeric(5,2) not null check (cobertura_minima between 0 and 100),
  alerta_cmv numeric(5,2) not null check (alerta_cmv between 0 and 100),
  alterado_em timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['categorias_alimentos','alimentos','porcoes_carne','custos_alimentos','cardapios','cardapio_diario',
    'comandas','pratos','alimentos_prato','registros_churrasqueira','avaliacoes_prato','registros_sobras','descartes_avulsos',
    'calculos_financeiros','configuracoes']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy leitura_workspace on public.%I for select to authenticated using (workspace = (select bovinus.workspace_atual()))',t);
  end loop;
end $$;
alter table bovinus.workspaces enable row level security;
alter table bovinus.membros enable row level security;

commit;
