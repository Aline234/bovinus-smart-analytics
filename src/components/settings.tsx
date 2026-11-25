'use client';

import { Check, Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { menuFor, saveCategory, saveFood, saveMenu, saveSettings } from '@/domain/actions';
import { day, id, sizeLabels, sizes, type Food, type Settings, type State } from '@/domain/model';
import { supabaseConfigured } from '@/storage/supabase';
import { useData } from './data-provider';
import { Button, Card, cn, Field, PageHeading } from './ui';

const tabs=[['analysis','Finanças e análise'],['foods','Alimentos e cortes'],['categories','Categorias'],['menu','Cardápio diário'],...(supabaseConfigured?[['connection','Conexão Supabase']]:[])];
const values: {key:keyof Settings;label:string;max:number;step:number;min?:number}[] = [
  {key:'saleKg',label:'Preço de venda por kg (R$)',max:99999,step:.01},
  {key:'sideKg',label:'Custo médio dos acompanhamentos por kg (R$)',max:99999,step:.01},
  {key:'cmvAlert',label:'Limite de alerta de CMV (%)',max:100,step:.1},
  {key:'popularity',label:'Limite de popularidade na matriz (%)',max:100,step:.1},
  {key:'waste',label:'Limite de sobras na matriz e nos alertas (%)',max:100,step:.1},
  {key:'minCoverage',label:'Cobertura mínima de avaliação (%)',max:100,step:.1},
  {key:'minSample',label:'Amostra mínima para alertas de sobras',max:10000,step:1,min:1},
];
export function Configuration() {
  const {state}=useData();
  const [tab,setTab]=useState('analysis');
  if(!state) return null;
  return <>
    <PageHeading title="Configurações" description="Ajuste o catálogo, as premissas financeiras e os limites de análise."/>
    <div className="segmented report-tabs">{tabs.map(([k,label])=><Button key={k} variant="ghost" aria-pressed={tab===k} onClick={()=>setTab(k)}>{label}</Button>)}</div>
    {tab==='analysis'&&<Parameters key={String(state.simulated)} settings={state.settings}/>}
    {tab==='foods'&&<Catalog key={String(state.simulated)} state={state}/>}
    {tab==='categories'&&<Categories key={String(state.simulated)} state={state}/>}
    {tab==='menu'&&<MenuForm key={String(state.simulated)} state={state}/>}
    {tab==='connection'&&<Connection/>}
  </>;
}
function Parameters({settings}:{settings:Settings}) {
  const {update,busy}=useData();
  const [draft,setDraft]=useState(settings);
  return <Card title="Premissas financeiras e de análise" subtitle="O protótipo estima a receita pelo peso líquido. Os valores por kg são preservados no histórico dos pratos gravados.">
    <form className="form-stack" onSubmit={async e=>{e.preventDefault();await update(s=>saveSettings(s,draft),'Parâmetros atualizados.');}}>
      <div className="field-grid twos">{values.map(({key,label,max,step,min})=><Field key={key} label={label}><input type="number" required min={min??0} max={max} step={step} value={Number.isNaN(draft[key])?'':draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.valueAsNumber})}/></Field>)}</div>
      <Button type="submit" disabled={busy}><Settings2 size={17}/> Salvar parâmetros</Button>
    </form>
  </Card>;
}
function Catalog({state}:{state:State}) {
  const [selection,setSelection]=useState<string|null>(null);
  return <>
    <Card title="Catálogo de alimentos" action={<Button onClick={()=>setSelection('novo')}><Plus size={17}/> Novo alimento ou corte</Button>}>
      <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Categoria</th><th>Tipo</th><th>Porção média</th><th>Custo por kg</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{state.foods.map(f=><tr key={f.id}><td><strong>{f.name}</strong></td><td>{state.categories.find(c=>c.id===f.categoryId)?.name}</td><td>{f.kind==='meat'?'Carne':'Acompanhamento'}</td><td>{f.kind==='meat'?f.grams.media+' g':'—'}</td><td>{f.kind==='meat'?f.costKg.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'}</td><td>{f.active?'Ativo':'Inativo'}</td><td><button className="text-link" onClick={()=>setSelection(f.id)}>Editar</button></td></tr>)}</tbody></table></div>
    </Card>
    {selection&&<FoodForm key={selection} original={state.foods.find(f=>f.id===selection)} state={state} close={()=>setSelection(null)}/>}
  </>;
}
function FoodForm({original,state,close}:{original?:Food;state:State;close:()=>void}) {
  const {update,busy}=useData();
  const [draft,setDraft]=useState<Food>(()=>original??{id:id(),name:'',categoryId:state.categories[0]?.id??'',kind:'buffet',active:true,grams:{pequena:40,media:60,grande:90},costKg:0});
  return <Card title={original?'Editar '+original.name:'Novo alimento ou corte'} subtitle="Peso e custo de porções se aplicam aos cortes da churrasqueira.">
    <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(await update(s=>saveFood(s,draft),'Alimento salvo.'))close();}}>
      <div className="field-grid"><Field label="Nome"><input autoFocus value={draft.name} maxLength={80} required onChange={e=>setDraft({...draft,name:e.target.value})}/></Field><Field label="Categoria"><select required value={draft.categoryId} onChange={e=>setDraft({...draft,categoryId:e.target.value})}>{state.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Tipo"><select disabled={!!original} value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as Food['kind']})}><option value="buffet">Acompanhamento</option><option value="meat">Corte de carne</option></select></Field></div>
      {draft.kind==='meat'&&<div className="field-grid twos">{sizes.map(size=><Field key={size} label={'Porção '+sizeLabels[size].toLowerCase()+' (g)'}><input type="number" min="1" max="5000" required value={Number.isNaN(draft.grams[size])?'':draft.grams[size]} onChange={e=>setDraft({...draft,grams:{...draft.grams,[size]:e.target.valueAsNumber}})}/></Field>)}<Field label="Custo por kg pronto (R$)"><input required type="number" min="0" max="99999" step=".01" value={Number.isNaN(draft.costKg)?'':draft.costKg} onChange={e=>setDraft({...draft,costKg:e.target.valueAsNumber})}/></Field></div>}
      <label className="checkbox"><input checked={draft.active} type="checkbox" onChange={e=>setDraft({...draft,active:e.target.checked})}/> Ativo no catálogo padrão</label>
      <div className="row"><Button type="submit" disabled={busy}><Check size={17}/> Salvar alimento</Button><Button variant="ghost" onClick={close}>Cancelar</Button></div>
    </form>
  </Card>;
}
function Categories({state}:{state:State}) {
  const {update,busy}=useData();
  const [selected,setSelected]=useState('');
  const [name,setName]=useState('');
  return <Card title="Categorias de alimentos">
    <form className="inline-form" onSubmit={async e=>{e.preventDefault();if(await update(s=>saveCategory(s,selected||id(),name),'Categoria salva.')){setSelected('');setName('');}}}>
      <Field label="Categoria"><select value={selected} onChange={e=>{setSelected(e.target.value);setName(state.categories.find(c=>c.id===e.target.value)?.name??'');}}><option value="">Nova categoria</option>{state.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Nome"><input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></Field><Button type="submit" disabled={busy}><Check size={17}/> Salvar categoria</Button>
    </form>
  </Card>;
}
function MenuForm({state}:{state:State}) {
  const [date,setDate]=useState(day);
  return <Card title="Disponibilidade diária" subtitle="A disponibilidade determina quais pratos entram no cálculo de popularidade. Dias sem cardápio explícito usam o catálogo ativo.">
    <Field label="Data do cardápio"><input type="date" value={date} onChange={e=>{if(e.target.value)setDate(e.target.value);}}/></Field>
    <MenuItems key={date} date={date} state={state}/>
  </Card>;
}
function MenuItems({state,date}:{state:State;date:string}) {
  const {update,busy}=useData();
  const [draft,setDraft]=useState(()=>menuFor(state,date));
  return <div className="form-stack menu-items"><div className="chip-grid">{state.foods.map(f=><button key={f.id} className={cn('chip',draft.includes(f.id)&&'chosen')} aria-pressed={draft.includes(f.id)} onClick={()=>setDraft(draft.includes(f.id)?draft.filter(id=>id!==f.id):[...draft,f.id])}>{draft.includes(f.id)?<Check size={16}/>:<Plus size={16}/>} {f.name}</button>)}</div>
    <Button disabled={busy} onClick={()=>void update(s=>saveMenu(s,date,draft),'Cardápio diário atualizado.')}><Check size={17}/> Salvar cardápio</Button>
  </div>;
}
function Connection() {
  const {login,demo,busy,connected}=useData();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  return <Card title="Conexão Supabase" subtitle="Acesso com uma conta de equipe autorizada no workspace." className="narrow-card">
    {connected?<Button variant="outline" disabled={busy} onClick={()=>void demo()}>Sair e abrir demonstração local</Button>:<form className="form-stack" onSubmit={e=>{e.preventDefault();void login(email,password);}}>
      <Field label="E-mail da equipe"><input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></Field>
      <Field label="Senha"><input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><Button type="submit" disabled={busy}>Conectar workspace</Button>
    </form>}
  </Card>;
}
