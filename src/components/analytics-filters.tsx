'use client';

import { CalendarDays, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { range, type Filters } from '@/domain/analytics';
import { day, displayDate, type State } from '@/domain/model';
import { Button, Field } from './ui';

export type Preset = 'Hoje' | '7 dias' | '30 dias' | 'Data específica' | 'Personalizado';
export function FilterBar({state,filters,setFilters,preset,setPreset}:{state:State;filters:Filters;setFilters:(v:Filters)=>void;preset:Preset;setPreset:(v:Preset)=>void}) {
  const [expanded,setExpanded]=useState(false);
  const extra=(['fromHour','toHour','meat','food','category','ticket'] as const).filter(k=>filters[k]!=='').length;
  const update=(key:keyof Filters,value:string)=>setFilters({...filters,[key]:value});
  const invalid=filters.start>filters.end||(filters.fromHour!==''&&filters.toHour!==''&&+filters.fromHour>+filters.toHour);
  const active = ([
    ['fromHour',filters.fromHour && 'A partir de '+filters.fromHour.padStart(2,'0')+'h'],
    ['toHour',filters.toHour && 'Até '+filters.toHour.padStart(2,'0')+'h'],
    ['meat',state.foods.find(f=>f.id===filters.meat)?.name],
    ['food',state.foods.find(f=>f.id===filters.food)?.name],
    ['category',state.categories.find(c=>c.id===filters.category)?.name],
    ['ticket',filters.ticket && 'Comanda #'+filters.ticket.padStart(4,'0')],
  ] as const).filter(([,label])=>label);
  function choose(v:Preset) {
    setPreset(v);
    if(v==='Hoje'||v==='Data específica')setFilters({...filters,start:day(),end:day()});
    else if(v==='7 dias'||v==='30 dias') {
      const next=range(v==='7 dias'?7:30);
      setFilters({...filters,start:next.start,end:next.end});
    }
  }
  return <section className="filter-section" aria-label="Filtros analíticos">
    <div className="filter-bar">
      <div className="date-control"><CalendarDays size={17}/><span>{filters.start===filters.end?displayDate(filters.end):displayDate(filters.start,false)+' a '+displayDate(filters.end)}</span></div>
      <div className="segmented period">{(['Hoje','7 dias','30 dias','Data específica','Personalizado'] as const).map(v=><Button key={v} variant="ghost" size="sm" aria-pressed={preset===v} onClick={()=>choose(v)}>{v}</Button>)}</div>
      <Button variant="outline" className="filters-button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><SlidersHorizontal size={16}/> Filtros{extra>0?' ('+extra+')':''}</Button>
    </div>
    {(preset==='Personalizado'||preset==='Data específica'||expanded)&&<div className="filter-panel">
      {preset==='Data específica'&&<Field label="Data"><input type="date" value={filters.start} required onChange={e=>{if(e.target.value)setFilters({...filters,start:e.target.value,end:e.target.value});}}/></Field>}
      {preset==='Personalizado'&&<><Field label="De"><input type="date" value={filters.start} required max={filters.end} onChange={e=>{if(e.target.value)update('start',e.target.value);}}/></Field><Field label="Até"><input type="date" value={filters.end} required min={filters.start} onChange={e=>{if(e.target.value)update('end',e.target.value);}}/></Field></>}
      {expanded&&<>
        {([['fromHour','Hora inicial'],['toHour','Hora final (inclusiva)']] as const).map(([key,label])=><Field key={key} label={label}><select value={filters[key]} onChange={e=>update(key,e.target.value)}><option value="">Qualquer hora</option>{Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}h</option>)}</select></Field>)}
        {([['meat','Corte de carne','meat'],['food','Alimento','buffet']] as const).map(([key,label,kind])=><Field key={key} label={label}><select value={filters[key]} onChange={e=>update(key,e.target.value)}><option value="">Todos</option>{state.foods.filter(f=>f.kind===kind).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>)}
        <Field label="Categoria"><select value={filters.category} onChange={e=>update('category',e.target.value)}><option value="">Todas</option>{state.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Comanda"><input inputMode="numeric" maxLength={8} value={filters.ticket} onChange={e=>update('ticket',e.target.value.replace(/\D/g,''))} placeholder="Ex. 0042"/></Field>
        <Button variant="ghost" onClick={()=>{setFilters(range());setPreset('7 dias');}}>Limpar filtros</Button>
      </>}
    </div>}
    {active.length>0&&<div className="row active-filters" aria-label="Filtros ativos">{active.map(([key,label])=><button type="button" className="tag" key={key} onClick={()=>update(key,'')} aria-label={'Remover filtro: '+label}>{label}<X size={13}/></button>)}</div>}
    {invalid&&<p className="field-error" role="alert">Confira a ordem das datas e das horas.</p>}
  </section>;
}
