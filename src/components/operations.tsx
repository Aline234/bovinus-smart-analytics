'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { Beef, CalendarClock, Check, ChevronLeft, ChevronRight, Clock, Flame, Minus, Plus, RotateCcw, Scale, Search, Trash2, TriangleAlert, Utensils } from 'lucide-react';
import { addPlate, closeTicket, createTicket, friendlyError, menuFor, noWaste, saveBuffet, saveDiscard, saveGrill, saveWaste, type Portion } from '@/domain/actions';
import { estimatePlate, estimateRevenue, meatWeight, plateRevenue } from '@/domain/finance';
import { dateTime, day, fromLocal, gram, levelLabels, levels, localDateTime, money, pct, plateFoods, sequence, sizeLabels, sizes, type Composition, type Discard, type Finance, type Level, type Plate, type Size, type State } from '@/domain/model';
import { useData } from './data-provider';
import { Button, Card, cn, Empty, Field, PageHeading } from './ui';

const titles = {
  grill:{title:'Churrasqueira',description:'Selecione o prato e toque nos cortes para registrar as porções servidas.'},
  buffet:{title:'Buffet e pesagem',description:'Registre o peso líquido e os acompanhamentos identificados no prato.'},
  waste:{title:'Desperdício',description:'Registre as sobras observadas após o recolhimento dos pratos.'},
};
export function FinanceSummary({finance,revenue=null}:{finance:Finance|null;revenue?:number|null}) {
  if (!finance) return <div className="finance-summary">{revenue!==null&&<dl><div><dt>Receita estimada</dt><dd>{money(revenue)}</dd></div></dl>}<div className="info-box"><Scale size={18}/> O cálculo completo aguarda a pesagem e a confirmação das carnes servidas.</div></div>;
  const rows: [string,string][] = [
    ['Receita estimada',money(finance.revenue)],['Carnes · '+gram(finance.meatG),money(finance.meatCost)],
    ['Acompanhamentos · '+gram(finance.sideG),money(finance.sideCost)],['Custo alimentar',money(finance.cost)],
    ['CMV alimentar estimado',pct(finance.cmv)],['Participação de carne',pct(finance.meatShare)],
    ['Resultado após custo alimentar',money(finance.result)],
  ];
  return <div className="finance-summary"><dl>{rows.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p>Estimativa alimentar com venda a {money(finance.saleKg)}/kg e acompanhamentos a {money(finance.sideKg)}/kg. Despesas operacionais ficam fora do cálculo.</p></div>;
}
function searchMatch(number:string,search:string) {return number.includes(search) || String(Number(number)).includes(search);}

export function TicketList() {
  const {state,busy,update}=useData();
  const router=useRouter();
  const [filter,setFilter]=useState('abertas');
  const [search,setSearch]=useState('');
  const [value,setValue]=useState('');
  const [page,setPage]=useState(1);
  const [creating,setCreating]=useState(false);
  const plateCounts=useMemo(()=>{
    const counts=new Map<string,number>();
    for (const p of state?.plates ?? []) counts.set(p.ticketId,(counts.get(p.ticketId)??0)+1);
    return counts;
  },[state]);
  if (!state) return null;
  const rows=[...state.tickets].reverse().filter(t=>searchMatch(t.number,search.trim())&&(filter==='todas'||(filter==='abertas')===!t.closedAt));
  const pages=Math.max(1,Math.ceil(rows.length/15));
  const current=Math.min(page,pages);
  async function create(e:FormEvent) {
    e.preventDefault();
    let ticketId='';
    const ok=await update(s=>{const result=createTicket(s,value);ticketId=result.ticket.id;return result.state;},'Comanda criada com o prato 01.');
    if (ok) router.push('/comandas/'+ticketId);
  }
  return <>
    <PageHeading title="Comandas" description="Consulte as sessões e acompanhe todos os pratos de cada comanda." actions={<Button onClick={()=>setCreating(v=>!v)}><Plus size={17}/> Nova comanda</Button>}/>
    {creating&&<Card title="Criar comanda"><form className="inline-form" onSubmit={create}><Field label="Número da comanda"><input autoFocus inputMode="numeric" required value={value} onChange={e=>setValue(e.target.value)} placeholder="0042" maxLength={8}/></Field><Button type="submit" disabled={busy}><Plus size={16}/> Criar comanda</Button></form></Card>}
    <Card title="Sessões da comanda" action={<span className="muted">{rows.length.toLocaleString('pt-BR')} sessões</span>}>
      <div className="table-toolbar"><div className="segmented">{[['abertas','Abertas'],['encerradas','Encerradas'],['todas','Todas']].map(([k,v])=><Button key={k} variant="ghost" size="sm" aria-pressed={filter===k} onClick={()=>{setFilter(k);setPage(1);}}>{v}</Button>)}</div>
        <div className="search"><Search size={16}/><input aria-label="Buscar número da comanda" placeholder="Buscar comanda" inputMode="numeric" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div></div>
      {rows.length ? <div className="table-wrap"><table><thead><tr><th>Comanda</th><th>Entrada</th><th>Pratos</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{rows.slice((current-1)*15,current*15).map(t=><tr key={t.id}><td><strong>#{t.number}</strong></td><td>{dateTime(t.openedAt)}</td><td>{plateCounts.get(t.id)??0}</td><td><span className={cn('tag',!t.closedAt&&'tag-green')}>{t.closedAt?'Encerrada':'Aberta'}</span></td><td><Link href={'/comandas/'+t.id} className="text-link">Ver jornada</Link></td></tr>)}</tbody></table></div> : <Empty>Nenhuma comanda encontrada.</Empty>}
      {pages>1&&<div className="pagination"><Button variant="outline" size="icon" aria-label="Página anterior" disabled={current<=1} onClick={()=>setPage(current-1)}><ChevronLeft size={16}/></Button><span>Página {current} de {pages}</span><Button variant="outline" size="icon" aria-label="Próxima página" disabled={current>=pages} onClick={()=>setPage(current+1)}><ChevronRight size={16}/></Button></div>}
    </Card>
  </>;
}
export function TicketDetail({ticketId}:{ticketId:string}) {
  const {state,update,busy}=useData();
  const [confirm,setConfirm]=useState(false);
  if (!state) return null;
  const ticket=state.tickets.find(t=>t.id===ticketId);
  if (!ticket) return <><PageHeading title="Comanda não encontrada" description="Consulte as comandas disponíveis nesta sessão."/><Link href="/comandas" className="button button-outline">Voltar às comandas</Link></>;
  const plates=state.plates.filter(p=>p.ticketId===ticket.id);
  return <>
    <Link className="back-link" href="/comandas"><ChevronLeft size={16}/> Comandas</Link>
    <PageHeading title={'Comanda #'+ticket.number} description={'Entrada em '+dateTime(ticket.openedAt)} actions={!ticket.closedAt?<><Button variant="outline" onClick={()=>setConfirm(v=>!v)}>Encerrar sessão</Button><Button disabled={busy} onClick={()=>void update(s=>addPlate(s,ticket.id).state,'Novo prato associado à comanda.')}><Plus size={17}/> Adicionar prato</Button></>:<span className="tag">Encerrada em {dateTime(ticket.closedAt)}</span>}/>
    {confirm&&!ticket.closedAt&&<Card title="Encerrar esta sessão?"><div className="row"><Button variant="danger" disabled={busy} onClick={async()=>{if(await update(s=>closeTicket(s,ticket.id),'Sessão encerrada.'))setConfirm(false);}}>Confirmar encerramento</Button><Button variant="ghost" onClick={()=>setConfirm(false)}>Cancelar</Button></div></Card>}
    {plates.map(p=><Card key={p.id} title={'Prato '+sequence(p.sequence)} subtitle={'Registrado em '+dateTime(p.createdAt)} action={p.weight!==null?<span className="tag tag-green">{gram(p.weight)} medidos</span>:<span className="tag">Aguardando pesagem</span>}>
      <div className="detail-grid">
        <div><h3>Acompanhamentos</h3><p>{p.foodIds.map(id=>state.foods.find(f=>f.id===id)?.name).join(', ')||'Nenhum acompanhamento identificado.'}</p><p className="muted">Composição {p.composition}</p></div>
        <div><h3>Carnes servidas</h3>{p.meats.length?<ul className="simple-list">{p.meats.map(m=><li key={m.foodId+m.size}>{state.foods.find(f=>f.id===m.foodId)?.name} · {m.count} × {sizeLabels[m.size].toLowerCase()} · {gram(m.grams*m.count)} estimados</li>)}</ul>:<p>{p.grillKnown?'Sem carne confirmada.':'Churrasqueira não registrada.'}</p>}</div>
        <div><h3>Sobras</h3>{p.waste?<><p>{dateTime(p.waste.at)}</p><ul className="simple-list">{Object.entries(p.waste.outcomes).map(([id,level])=><li key={id}>{state.foods.find(f=>f.id===id)?.name} · {levelLabels[level]}</li>)}</ul>{p.waste.plateClear&&<p>Prato observado sem sobras.</p>}{p.waste.note&&<p>{p.waste.note}</p>}</>:<p>Sem avaliação registrada.</p>}</div>
      </div>
      <FinanceSummary finance={p.finance} revenue={plateRevenue(p)}/>
      {p.financeHistory.length>1&&<details className="detail-disclosure"><summary>Histórico de cálculos financeiros ({p.financeHistory.length})</summary><ul className="simple-list">{p.financeHistory.map(v=><li key={v.id}>{dateTime(v.finance.at)} · Custo {money(v.finance.cost)} · Venda {money(v.finance.saleKg)}/kg · Acompanhamentos {money(v.finance.sideKg)}/kg</li>)}</ul></details>}
      <div className="row card-actions"><Link className="button button-outline" href={'/churrasqueira?prato='+p.id}><Flame size={16}/> Churrasqueira</Link><Link className="button button-outline" href={'/buffet?prato='+p.id}><Utensils size={16}/> Pesagem</Link><Link className="button button-outline" href={'/desperdicio?prato='+p.id}><Trash2 size={16}/> Sobras</Link></div>
    </Card>)}
  </>;
}
function PlateSelector({value,onChange,includeClosed}:{value:string;onChange:(id:string)=>void;includeClosed:boolean}) {
  const {state}=useData();
  const [search,setSearch]=useState('');
  const selectPlate=state?.plates.find(p=>p.id===value);
  const [ticketId,setTicketId]=useState(selectPlate?.ticketId??'');
  const [showClosed,setShowClosed]=useState(includeClosed);
  if (!state) return null;
  const selectedTicket=state.tickets.find(t=>t.id===ticketId);
  const available=[...state.tickets].reverse().filter(t=>(showClosed||!t.closedAt)&&searchMatch(t.number,search.trim())).slice(0,35);
  if (selectedTicket&&!available.some(t=>t.id===ticketId)) available.unshift(selectedTicket);
  const plates=state.plates.filter(p=>p.ticketId===ticketId);
  return <Card title="Identificação do prato" className="selector">
    <div className="field-grid">
      <Field label="Buscar comanda"><input inputMode="numeric" placeholder="Ex. 0042" value={search} onChange={e=>setSearch(e.target.value)}/></Field>
      <Field label="Comanda"><select value={ticketId} onChange={e=>{const v=e.target.value;setTicketId(v);onChange(state.plates.find(p=>p.ticketId===v)?.id??'');}}><option value="">Selecionar comanda</option>{available.map(t=><option key={t.id} value={t.id}>#{t.number} · {t.closedAt?'Encerrada':'Aberta'} · {dateTime(t.openedAt)}</option>)}</select></Field>
      <Field label="Prato"><select value={value} onChange={e=>onChange(e.target.value)}><option value="">Selecionar prato</option>{plates.map(p=><option key={p.id} value={p.id}>Prato {sequence(p.sequence)}{p.weight!==null?' · '+gram(p.weight):''}</option>)}</select></Field>
    </div>
    <div className="selector-foot"><label className="checkbox"><input type="checkbox" checked={showClosed} onChange={e=>setShowClosed(e.target.checked)}/> Incluir comandas encerradas</label><Link className="text-link" href={ticketId?'/comandas/'+ticketId:'/comandas'}>{ticketId?'Ver jornada da comanda':'Abrir módulo de comandas'}</Link></div>
  </Card>;
}
export function Operation({type,initialId=''}:{type:keyof typeof titles;initialId?:string}) {
  const {state}=useData();
  const [selected,setSelected]=useState(initialId);
  const [tab,setTab]=useState('plate');
  if (!state) return null;
  const plate=state.plates.find(p=>p.id===selected);
  const isWaste=type==='waste';
  return <>
    <PageHeading {...titles[type]}/>
    {isWaste&&<div className="segmented operation-tabs">{[['plate','Avaliar prato'],['anonymous','Descarte anônimo']].map(([k,v])=><Button key={k} variant="ghost" aria-pressed={tab===k} onClick={()=>setTab(k)}>{v}</Button>)}</div>}
    {tab==='anonymous' ? <Anonymous state={state}/> : <>
      <PlateSelector value={selected} onChange={setSelected} includeClosed={isWaste||Boolean(plate&&state.tickets.find(t=>t.id===plate.ticketId)?.closedAt)}/>
      {plate ? type==='grill'?<Grill key={plate.id} state={state} plate={plate}/>:type==='buffet'?<Buffet key={plate.id} state={state} plate={plate}/>:<WasteForm key={plate.id} state={state} plate={plate}/> : <Card><Empty>Selecione a comanda e o prato para iniciar o registro.</Empty></Card>}
    </>}
  </>;
}
function useDraft<T>(initial:T) {
  const [draft,setDraft]=useState<T>(initial);
  const [history,setHistory]=useState<T[]>([]);
  const edit=(value:T)=>{setHistory(old=>[...old,draft]);setDraft(value);};
  const undo=()=>{if(history.length){setDraft(history[history.length-1]);setHistory(history.slice(0,-1));}};
  const reset=(value:T)=>{setDraft(value);setHistory([]);};
  return {draft,edit,undo,reset,canUndo:history.length>0};
}
function Grill({state,plate}:{state:State;plate:Plate}) {
  const {busy,update}=useData();
  const [size,setSize]=useState<Size>('media');
  const {draft,edit,undo,reset,canUndo}=useDraft<Portion[]>(plate.meats);
  const available=new Set(menuFor(state,day(plate.weighedAt??new Date())));
  const cuts=state.foods.filter(f=>f.kind==='meat'&&(available.has(f.id)||plate.meats.some(m=>m.foodId===f.id)));
  const grams=(p:Portion)=>plate.meats.find(m=>m.foodId===p.foodId&&m.size===p.size)?.grams??cuts.find(f=>f.id===p.foodId)?.grams[p.size]??0;
  const total=draft.reduce((n,p)=>n+grams(p)*p.count,0);
  const invalid=plate.weight!==null&&total>plate.weight;
  function bump(foodId:string,s:Size,step:number) {
    const previous=draft.find(p=>p.foodId===foodId&&p.size===s);
    const count=(previous?.count??0)+step;
    if(count<0||count>99) return;
    edit([...draft.filter(p=>p!==previous),...(count?[{foodId,size:s,count}]:[])]);
  }
  return <div className="operation-grid">
    <Card title="Cortes disponíveis" subtitle="Cada toque acrescenta uma porção.">
      <div className="segmented sizes" aria-label="Tamanho da porção">{sizes.map(s=><Button key={s} variant="ghost" aria-pressed={size===s} onClick={()=>setSize(s)}>{sizeLabels[s]}</Button>)}</div>
      {!cuts.length&&<Empty>Nenhum corte no cardápio desta data.</Empty>}
      <div className="choice-grid">{cuts.map(f=><button key={f.id} className={cn('choice',draft.some(p=>p.foodId===f.id)&&'chosen')} onClick={()=>bump(f.id,size,1)}><Beef size={18}/><span>{f.name}<small>{gram(grams({foodId:f.id,size,count:1}))} estimados</small></span><Plus size={16}/></button>)}</div>
    </Card>
    <Card title="Porções selecionadas" subtitle={'Prato '+sequence(plate.sequence)} action={<Button variant="ghost" size="icon" aria-label="Desfazer edição das porções" disabled={!canUndo} onClick={undo}><RotateCcw size={17}/></Button>}>
      {draft.length?<div className="portion-list">{draft.map(p=><div className="portion-row" key={p.foodId+p.size}><div><strong>{cuts.find(f=>f.id===p.foodId)?.name}</strong><small>{sizeLabels[p.size]} · {gram(grams(p)*p.count)}</small></div><div className="stepper"><Button variant="outline" size="icon" aria-label={'Remover porção de '+cuts.find(f=>f.id===p.foodId)?.name} onClick={()=>bump(p.foodId,p.size,-1)}><Minus size={15}/></Button><strong>{p.count}</strong><Button variant="outline" size="icon" aria-label={'Acrescentar porção de '+cuts.find(f=>f.id===p.foodId)?.name} onClick={()=>bump(p.foodId,p.size,1)}><Plus size={15}/></Button></div></div>)}</div>:<Empty>Nenhuma porção selecionada.</Empty>}
      <div className="summary-line"><span>Peso estimado</span><strong>{gram(total)}</strong></div>
      {invalid&&<div className="info-box warning" role="alert"><TriangleAlert size={18}/> As carnes superam o peso líquido. Corrija as porções ou a pesagem.</div>}
      <Button className="full" disabled={busy||invalid} onClick={async()=>{if(await update(s=>saveGrill(s,plate.id,draft),'Registro da churrasqueira salvo.')) reset(draft);}}><Check size={18}/>{draft.length?'Confirmar porções':'Confirmar sem carne'}</Button>
    </Card>
  </div>;
}
function Buffet({state,plate}:{state:State;plate:Plate}) {
  const {busy,update}=useData();
  const {draft,edit,undo,reset,canUndo}=useDraft(plate.foodIds);
  const [weight,setWeight]=useState(plate.weight?.toString()??'');
  const [composition,setComposition]=useState<Composition>(plate.composition==='desconhecida'&&plate.weight===null?'completa':plate.composition);
  const [noMeat,setNoMeat]=useState(false);
  const available=new Set(menuFor(state,day(plate.weighedAt??new Date())));
  const food=state.foods.filter(f=>f.kind==='buffet'&&(available.has(f.id)||plate.foodIds.includes(f.id)));
  const meats=meatWeight(plate.meats);
  let preview:Finance|null=null;
  let issue='';
  if(weight) try {preview=estimatePlate({...plate,weight:Number(weight),grillKnown:plate.grillKnown||noMeat},state.settings,new Date().toISOString());} catch(error) {issue=friendlyError(error);}
  async function save(e:FormEvent) {
    e.preventDefault();
    if(await update(s=>saveBuffet(s,plate.id,{weight:Number(weight),composition,foodIds:composition==='desconhecida'?[]:draft,noMeat}),'Pesagem e composição salvas.')) reset(composition==='desconhecida'?[]:draft);
  }
  return <form className="operation-grid" onSubmit={save}>
    <Card title="Acompanhamentos" subtitle="Selecione os alimentos identificados." action={<Button variant="ghost" size="icon" aria-label="Desfazer edição dos alimentos" disabled={!canUndo} onClick={undo}><RotateCcw size={17}/></Button>}>
      <Field label="Qualidade da identificação"><select value={composition} onChange={e=>setComposition(e.target.value as Composition)}><option value="completa">Composição completa</option><option value="parcial">Composição parcial</option><option value="desconhecida">Composição desconhecida</option></select></Field>
      {composition!=='desconhecida'&&<div className="chip-grid">{food.map(f=><button type="button" key={f.id} aria-pressed={draft.includes(f.id)} className={cn('chip',draft.includes(f.id)&&'chosen')} onClick={()=>edit(draft.includes(f.id)?draft.filter(k=>k!==f.id):[...draft,f.id])}>{draft.includes(f.id)?<Check size={16}/>:<Plus size={16}/>} {f.name}</button>)}</div>}
    </Card>
    <div className="card-stack">
      <Card title="Peso líquido" subtitle={'Prato '+sequence(plate.sequence)}><Field label="Peso líquido total (g)"><input className="weight-input" type="number" min="1" max="20000" step="1" value={weight} onChange={e=>setWeight(e.target.value)} required placeholder="580"/></Field>
        <div className="summary-line"><span>Carnes estimadas</span><strong>{plate.grillKnown?gram(meats):'Pendente'}</strong></div>
        {!!plate.meats.length&&<ul className="simple-list cut-list">{plate.meats.map(m=><li key={m.foodId+m.size}>{state.foods.find(f=>f.id===m.foodId)?.name} · {m.count} × {sizeLabels[m.size].toLowerCase()}</li>)}</ul>}
        {!plate.grillKnown&&<label className="checkbox"><input type="checkbox" checked={noMeat} onChange={e=>setNoMeat(e.target.checked)}/> Confirmei que o prato não contém carne</label>}
        {issue&&<div className="info-box warning" role="alert"><TriangleAlert size={17}/>{issue}</div>}
        <Button type="submit" className="full" disabled={busy||!!issue}><Check size={17}/> Salvar pesagem</Button>
      </Card>
      <Card title="Prévia financeira"><FinanceSummary finance={preview} revenue={!issue&&Number(weight)>0?estimateRevenue(Number(weight),plate.pricing?.saleKg??state.settings.saleKg):null}/></Card>
    </div>
  </form>;
}
function WasteForm({state,plate}:{state:State;plate:Plate}) {
  const {busy,update}=useData();
  const {draft,edit,undo,reset,canUndo}=useDraft({outcomes:plate.waste?.outcomes??{},plateClear:plate.waste?.plateClear??false});
  const ids=[...new Set([...plateFoods(plate),...Object.keys(draft.outcomes)])];
  const [at,setAt]=useState(localDateTime(plate.waste?.at??new Date().toISOString()));
  const [note,setNote]=useState(plate.waste?.note??'');
  const [newFood,setNewFood]=useState('');
  return <form className="operation-grid" onSubmit={async e=>{e.preventDefault();if(await update(s=>saveWaste(s,plate.id,{at:fromLocal(at),note,...draft}),'Avaliação de sobras salva.'))reset(draft);}}>
    <Card title="Avaliação por alimento" subtitle="Avalie apenas os itens observados." action={<Button variant="ghost" size="icon" aria-label="Desfazer avaliação" disabled={!canUndo} onClick={undo}><RotateCcw size={17}/></Button>}>
      {ids.length ? <><Button variant="outline" onClick={()=>edit({outcomes:noWaste(ids),plateClear:true})}><Check size={16}/> Marcar todos sem sobras</Button><div className="waste-list">{ids.map(id=><Field key={id} label={state.foods.find(f=>f.id===id)?.name??id}><select value={draft.outcomes[id]??'nao_avaliado'} onChange={e=>edit({outcomes:{...draft.outcomes,[id]:e.target.value as Level},plateClear:draft.plateClear&&e.target.value==='sem_sobra'})}>{levels.map(l=><option key={l} value={l}>{levelLabels[l]}</option>)}</select></Field>)}</div></>:<Empty>Nenhum alimento identificado neste prato.</Empty>}
      <div className="inline-form addition"><Field label="Alimento identificado no recolhimento"><select value={newFood} onChange={e=>setNewFood(e.target.value)}><option value="">Selecionar alimento</option>{state.foods.filter(f=>!ids.includes(f.id)).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></Field><Button variant="outline" disabled={!newFood} onClick={()=>{edit({...draft,outcomes:{...draft.outcomes,[newFood]:'nao_avaliado'}});setNewFood('');}}><Plus size={16}/> Incluir</Button></div>
    </Card>
    <Card title="Recolhimento"><div className="form-stack"><label className="checkbox"><input type="checkbox" checked={draft.plateClear} onChange={e=>edit({plateClear:e.target.checked,outcomes:e.target.checked?noWaste(ids):draft.outcomes})}/> Prato observado sem sobras</label><Field label="Data e hora do recolhimento"><input type="datetime-local" value={at} onChange={e=>setAt(e.target.value)} required/></Field><Field label="Observações sobre os alimentos (opcional)"><textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)} rows={4}/></Field><Button type="submit" disabled={busy}><Check size={17}/> Salvar avaliação</Button></div></Card>
  </form>;
}
function Anonymous({state}:{state:State}) {
  const {update,busy}=useData();
  const [food,setFood]=useState('');
  const [intensity,setIntensity]=useState<Size>('pequena');
  const [note,setNote]=useState('');
  const [at,setAt]=useState(localDateTime(new Date().toISOString()));
  const [editId,setEditId]=useState('');
  const open=(row?:Discard)=>{
    setEditId(row?.id??'');setFood(row?.foodId??'');setIntensity(row?.level??'pequena');
    setNote(row?.note??'');setAt(localDateTime(row?.at??new Date().toISOString()));
  };
  return <div className="operation-grid"><Card title={editId?'Corrigir descarte':'Descarte anônimo'} subtitle="Use quando a comanda do prato recolhido não estiver disponível." className="narrow-card">
    <form className="form-stack" onSubmit={async e=>{e.preventDefault();if(await update(s=>saveDiscard(s,{foodId:food||null,level:intensity,note,at:fromLocal(at)},editId||undefined),editId?'Descarte corrigido.':'Descarte anônimo registrado.'))open();}}>
      <Field label="Alimento"><select value={food} onChange={e=>setFood(e.target.value)}><option value="">Não identificado</option>{state.foods.map(f=><option value={f.id} key={f.id}>{f.name}</option>)}</select></Field>
      <div className="field-grid"><Field label="Intensidade observada"><select value={intensity} onChange={e=>setIntensity(e.target.value as Size)}>{sizes.map(s=><option key={s} value={s}>{sizeLabels[s]}</option>)}</select></Field><Field label="Data e hora"><input type="datetime-local" value={at} onChange={e=>setAt(e.target.value)} required/></Field></div>
      <Field label="Observações sobre os alimentos (opcional)"><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} rows={3}/></Field>
      <div className="row"><Button type="submit" disabled={busy}><CalendarClock size={17}/>{editId?'Salvar correção':'Registrar descarte'}</Button>{editId&&<Button variant="ghost" onClick={()=>open()}>Cancelar correção</Button>}</div>
      <p className="muted"><Clock size={14}/> {state.discards.length.toLocaleString('pt-BR')} descartes anônimos armazenados.</p>
    </form>
  </Card><Card title="Descartes recentes">{state.discards.length?<div className="table-wrap"><table><thead><tr><th>Recolhimento</th><th>Intensidade</th><th>Ação</th></tr></thead><tbody>{[...state.discards].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,8).map(item=><tr key={item.id}><td><strong>{state.foods.find(f=>f.id===item.foodId)?.name??'Não identificado'}</strong><br/>{dateTime(item.at)}</td><td>{levelLabels[item.level]}</td><td><button className="text-link" onClick={()=>open(item)}>Corrigir</button></td></tr>)}</tbody></table></div>:<Empty>Nenhum descarte registrado.</Empty>}</Card></div>;
}
