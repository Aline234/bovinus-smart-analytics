'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { Activity, BadgeDollarSign, Beef, ClipboardList, Download, FlaskConical, Flame, Gauge, Info, Lightbulb, Scale, Target, Trash2, TrendingUp, TriangleAlert, Utensils, Wallet, type LucideIcon } from 'lucide-react';
import { analytics, exportCsv, insights, plateAt, priorRange, range, type Analysis, type FoodMetric } from '@/domain/analytics';
import { plateRevenue } from '@/domain/finance';
import { dateTime, gram, kg, levelLabels, money, number, pct, sequence, type State } from '@/domain/model';
import { FilterBar, type Preset } from './analytics-filters';
import { Bars, CmvChart, CompositionChart, CutsChart, FoodHistory, HoursChart, Matrix, RevenueChart } from './charts';
import { useData } from './data-provider';
import { Button, Card, Empty, Field, PageHeading } from './ui';

export function Dashboard({mode='dashboard',intro=false,initialTicket=''}:{mode?:'dashboard'|'advanced'|'reports';intro?:boolean;initialTicket?:string}) {
  const {state}=useData();
  const [filters,setFilters]=useState(()=>({...range(),ticket:initialTicket}));
  const [preset,setPreset]=useState<Preset>('7 dias');
  const [tab,setTab]=useState('resumo');
  const [selected,setSelected]=useState('');
  const a=useMemo(()=>state?analytics(state,filters):null,[state,filters]);
  const previous=useMemo(()=>state&&filters.start<=filters.end?analytics(state,priorRange(filters)):null,[state,filters]);
  if(!state||!a) return null;
  const valid=filters.start<=filters.end&&(filters.fromHour===''||filters.toHour===''||+filters.fromHour<=+filters.toHour);
  const tips=previous&&valid?insights(a,previous,state):[];
  const isDefault=mode==='dashboard';
  const advanced=mode==='advanced';
  const descriptions={
    dashboard:{title:'Visão geral',description:'Acompanhe o desempenho do buffet e da churrasqueira da unidade Augusta.'},
    advanced:{title:'Análises avançadas',description:'Explore as escolhas do buffet, a demanda da churrasqueira e os padrões de sobras.'},
    reports:{title:'Relatórios',description:'Consulte e exporte os registros analíticos do recorte selecionado.'},
  };
  const download=(kind:ReportKind)=>downloadReport(a,state,filters.start,filters.end,kind);
  return <>
    <PageHeading {...descriptions[mode]} actions={isDefault&&<Button variant="outline" disabled={!valid||!a.plates.length} onClick={()=>download('plates')}><Download size={17}/> Exportar dados</Button>}/>
    {isDefault&&state.simulated&&<div className="demo-banner"><div className="demo-icon"><FlaskConical size={20}/></div><div><strong>Dados de demonstração</strong><p>Explore o painel com registros simulados do serviço de almoço.</p></div><Link href="/demonstracao" className="button button-outline">Abrir demonstração</Link></div>}
    <FilterBar state={state} filters={filters} setFilters={setFilters} preset={preset} setPreset={setPreset}/>
    {!valid ? <Card><Empty>Ajuste os filtros para visualizar os dados.</Empty></Card> : mode==='reports'?<Reports a={a} state={state} download={download}/>:<>
      {isDefault&&<div className="dashboard-toolbar"><div className="dashboard-tabs" aria-label="Seções do dashboard">{[['resumo','Resumo'],['financeiro','Financeiro'],['consumo','Consumo e sobras']].map(([v,label])=><button type="button" key={v} aria-pressed={tab===v} onClick={()=>setTab(v)}>{label}</button>)}</div><span className="dataset-label"><span className="status-dot"/> {state.simulated?'Base simulada':'Dados do workspace'}</span></div>}
      {isDefault&&tab==='resumo'&&<>
        <div className="metrics-grid">
          <Metric icon={ClipboardList} label="Comandas analisadas" value={number(a.tickets)} note="Sessões com pratos no recorte"/>
          <Metric icon={Utensils} label="Pratos registrados" value={number(a.plates.length)} note={number(a.measured)+' com pesagem'}/>
          <Metric icon={BadgeDollarSign} label="Receita estimada" value={a.priced?money(a.grossRevenue):'—'} note={number(a.priced)+' pratos pesados com preço'} color="gold"/>
          <Metric icon={Gauge} label="CMV alimentar estimado" value={pct(a.cmv)} note={'Limite de alerta '+pct(state.settings.cmvAlert)} color="gold"/>
        </div>
        <div className="chart-grid hero-charts"><RevenueChart a={a}/><CutsChart a={a}/></div>
        <h2 className="section-title">Operação e cobertura</h2>
        <div className="metrics-grid secondary-metrics">
          <Metric icon={Scale} label="Peso líquido servido" value={kg(a.weight)} note={number(a.measured)+' pratos pesados'}/>
          <Metric icon={Beef} label="Carnes servidas" value={kg(a.meatG)} note="Peso estimado pelas porções"/>
          <Metric icon={Flame} label="Carne média por prato" value={a.meatAverage===null?'—':gram(a.meatAverage)} note={number(a.knownGrill)+' com churrasqueira confirmada'}/>
          <Metric icon={Wallet} label="Custo alimentar estimado" value={a.financial?money(a.cost):'—'} note={number(a.financial)+' pratos com cálculo'} color="gold"/>
          <Metric icon={TrendingUp} label="Resultado após custo alimentar" value={a.financial?money(a.result):'—'} note="Receita estimada menos custo alimentar" color="gold"/>
          <Metric icon={Target} label="Cobertura de avaliação" value={pct(a.coverage)} note={number(a.assessed)+' de '+number(a.plates.length)+' pratos'}/>
          <Metric icon={Activity} label="Pratos avaliados com sobras" value={pct(a.wasteRate)} note={number(a.withWaste)+' de '+number(a.assessed)+' avaliados'}/>
          <Metric icon={Trash2} label="Descartes anônimos" value={number(a.discards.length)} note="Observações sem identificação de prato"/>
        </div>
        <div className="chart-grid"><Insights items={tips}/><WasteTop a={a} state={state}/></div>
        {intro&&<Card title="Sobre o projeto" subtitle="Protótipo de Hackathon para entender o que é servido, o custo alimentar estimado e as sobras observadas.">
          <div className="home-links">{[['/comandas','Comandas',ClipboardList],['/churrasqueira','Churrasqueira',Flame],['/buffet','Buffet e pesagem',Scale],['/desperdicio','Desperdício',Trash2]].map(([url,label,Icon])=>{const Symbol=Icon as LucideIcon;return <Link key={String(url)} href={String(url)} className="button button-outline"><Symbol size={17}/>{String(label)}</Link>;})}</div>
        </Card>}
      </>}
      {isDefault&&tab==='financeiro'&&<>
        <div className="metrics-grid"><Metric icon={Wallet} label="Custo alimentar estimado" value={a.financial?money(a.cost):'—'} note={number(a.financial)+' pratos com cálculo'}/><Metric icon={TrendingUp} label="Resultado após custo alimentar" value={a.financial?money(a.result):'—'} note="Receita estimada menos custo alimentar"/><Metric icon={Gauge} label="CMV alimentar estimado" value={pct(a.cmv)} note="Custo alimentar ÷ receita estimada"/><Metric icon={Beef} label="Carne média por prato" value={a.meatAverage===null?'—':gram(a.meatAverage)} note="Base com churrasqueira confirmada"/></div>
        <div className="chart-grid equal"><RevenueChart a={a}/><RevenueChart a={a} onlyCost/><CmvChart a={a} settings={state.settings}/><CutsChart a={a}/><HoursChart a={a}/><CompositionChart a={a}/></div>
        <Insights items={tips}/>
      </>}
      {(advanced||tab==='consumo')&&<Behavior a={a} state={state} selected={selected} setSelected={setSelected} tips={tips}/>}
    </>}
  </>;
}
function Metric({icon:Icon,label,value,note,color='red'}:{icon:LucideIcon;label:string;value:string;note:string;color?:'red'|'gold'}) {
  return <article className="metric"><div className="metric-top"><span>{label}</span><span className={'metric-icon '+color}><Icon size={17}/></span></div><strong>{value}</strong><p>{note}</p></article>;
}
function Insights({items}:{items:ReturnType<typeof insights>}) {
  return <Card title="Insights automáticos" subtitle="Sinais calculados para o recorte selecionado." action={<span className="metric-icon gold"><Lightbulb size={17}/></span>}>
    {items.length?<div className="insights">{items.map(i=><div className="insight" key={i.title}><span className={'insight-icon '+i.kind}>{i.kind==='alert'?<TriangleAlert size={17}/>:i.kind==='trend'?<TrendingUp size={17}/>:<Info size={17}/>}</span><div><h3>{i.title}</h3><p>{i.text}</p></div></div>)}</div>:<Empty>Amostra sem sinais pelos limites configurados.</Empty>}
  </Card>;
}
function WasteTop({a,state}:{a:Analysis;state:State}) {
  const ranked=[...a.foods].filter(f=>f.assessed>=state.settings.minSample).sort((a,b)=>(b.rate??0)-(a.rate??0)).slice(0,5);
  return <Card title="Alimentos com maior taxa de sobras" subtitle={'Mínimo de '+state.settings.minSample+' avaliações por alimento.'} action={<Link href="/analises" className="text-link">Ver análises</Link>}>
    {ranked.length?<div className="ranking">{ranked.map(f=><div key={f.id}><div><strong>{f.name}</strong><small>{number(f.leftover)} de {number(f.assessed)} avaliados</small></div><div className="rank-track"><span style={{width:(f.rate??0)+'%'}}/></div><strong>{pct(f.rate)}</strong></div>)}</div>:<Empty>Amostra insuficiente para o ranking.</Empty>}
  </Card>;
}
function Evidence({a,selected,setSelected,state}:{a:Analysis;selected:string;setSelected:(id:string)=>void;state:State}) {
  const [order,setOrder]=useState('rate');
  const ordered=[...a.foods].filter(f=>f.eligible||f.assessed).sort((a,b)=>order==='rate'?(b.rate??-1)-(a.rate??-1):order==='picked'?b.selected-a.selected:b.leftover-a.leftover);
  return <Card title="Indicadores por alimento" subtitle="Popularidade entre pratos elegíveis. Taxa de sobras entre as avaliações do item." action={<Field label="Ordenação"><select value={order} onChange={e=>setOrder(e.target.value)}><option value="rate">Taxa de sobras</option><option value="picked">Mais escolhidos</option><option value="leftover">Pratos com sobra</option></select></Field>}>
    {ordered.length?<div className="table-wrap"><table><thead><tr><th>Alimento</th><th>Escolhas / elegíveis</th><th>Popularidade</th><th>Avaliados</th><th>Com sobra</th><th>Taxa de sobras</th></tr></thead><tbody>{ordered.map(f=><tr key={f.id} className={selected===f.id?'selected-row':''}><td><button className="text-link" onClick={()=>setSelected(f.id)}>{f.name}</button></td><td>{number(f.selected)} / {number(f.eligible)}</td><td>{pct(f.popularity)}</td><td>{number(f.assessed)}</td><td>{number(f.leftover)}</td><td>{pct(f.rate)} {f.assessed>0&&f.assessed<state.settings.minSample&&<span className="tag tag-gold">Amostra pequena</span>}</td></tr>)}</tbody></table></div>:<Empty>Sem registros para os filtros selecionados.</Empty>}
  </Card>;
}
const metricBars=(items:FoodMetric[],key:'selected'|'rate'|'leftover')=>items.map(f=>({name:f.name,value:f[key]??0}));
function Behavior({a,state,selected,setSelected,tips}:{a:Analysis;state:State;selected:string;setSelected:(id:string)=>void;tips:ReturnType<typeof insights>}) {
  const sides=a.foods.filter(f=>f.kind==='buffet'&&f.eligible>0).sort((a,b)=>b.selected-a.selected);
  const rates=[...a.foods].filter(f=>f.assessed).sort((a,b)=>(b.rate??0)-(a.rate??0));
  const leftovers=[...rates].filter(f=>f.leftover).sort((a,b)=>b.leftover-a.leftover);
  const cuts=[...a.cuts].sort((a,b)=>b.count-a.count);
  const selectedFood=a.foods.find(f=>f.id===selected);
  const tickets=new Map(state.tickets.map(t=>[t.id,t.number]));
  return <>
    <div className="metrics-grid">
      <Metric icon={Target} label="Cobertura de avaliação" value={pct(a.coverage)} note={number(a.assessed)+' de '+number(a.plates.length)+' pratos'}/>
      <Metric icon={Activity} label="Pratos avaliados com sobras" value={pct(a.wasteRate)} note={number(a.withWaste)+' pratos com sobra'}/>
      <Metric icon={Utensils} label="Composição registrada" value={number(a.plates.filter(p=>p.composition!=='desconhecida').length)} note="Inclui identificações parciais"/>
      <Metric icon={Trash2} label="Descartes anônimos" value={number(a.discards.length)} note="Observações sem identificação de prato" color="gold"/>
    </div>
    <div className="chart-grid equal"><Bars title="Alimentos mais escolhidos" subtitle="Pratos com o acompanhamento registrado." data={metricBars(sides.slice(0,7),'selected')}/><Bars title="Alimentos menos escolhidos" subtitle="Entre os acompanhamentos disponíveis no recorte." data={metricBars([...sides].reverse().slice(0,7),'selected')} paint="#a57943"/><Bars title="Cortes mais solicitados" subtitle="Porções registradas na churrasqueira." data={cuts.slice(0,7).map(c=>({name:c.name,value:c.count}))}/><Bars title="Ranking de alimentos com sobras" subtitle="Quantidade de pratos com sobra observada por alimento." data={metricBars(leftovers.slice(0,7),'leftover')}/><Bars title="Taxa de sobras por alimento" subtitle="Percentual de avaliações do item com sobra." data={metricBars(rates.slice(0,7),'rate')} unit="%"/><Bars title="Intensidade das sobras" subtitle="Observações com sobra, por item avaliado." data={(['pequena','media','grande'] as const).map(k=>({name:levelLabels[k],value:a.intensity[k]})).filter(x=>x.value>0)} paint="#a57943"/></div>
    <Matrix a={a} settings={state.settings} setSelected={setSelected}/>
    <Card className="matrix-select"><Field label="Inspecionar alimento"><select value={selectedFood?.id??''} onChange={e=>setSelected(e.target.value)}><option value="">Selecionar alimento</option>{a.foods.filter(f=>f.eligible||f.assessed).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></Field></Card>
    {selectedFood&&<FoodHistory key={selectedFood.id} a={a} food={selectedFood} stateName={id=>tickets.get(id)??''}/>}
    <Evidence a={a} state={state} selected={selected} setSelected={setSelected}/>
    <Insights items={tips}/>
  </>;
}
type ReportKind='plates'|'foods'|'discards';
function Reports({a,state,download}:{a:Analysis;state:State;download:(kind:ReportKind)=>void}) {
  const ticket=new Map(state.tickets.map(t=>[t.id,t.number]));
  const [report,setReport]=useState<ReportKind>('plates');
  const columns=report==='plates'?['Comanda','Prato','Registro','Peso líquido','Receita estimada','Custo alimentar','CMV']:report==='foods'?['Alimento','Escolhas','Elegíveis','Popularidade','Avaliados','Com sobra','Taxa']:['Data e hora','Alimento','Intensidade','Observações'];
  const rows: ReactNode[][]=report==='plates'?[...a.plates].reverse().slice(0,25).map(p=>[<Link key={p.id} href={'/comandas/'+p.ticketId} className="text-link">#{ticket.get(p.ticketId)}</Link>,sequence(p.sequence),dateTime(plateAt(p)),p.weight!==null?gram(p.weight):'—',plateRevenue(p)===null?'—':money(plateRevenue(p)??0),p.finance?money(p.finance.cost):'—',pct(p.finance?.cmv??null)]):report==='foods'?a.foods.filter(f=>f.eligible||f.assessed).slice(0,25).map(f=>[f.name,f.selected,f.eligible,pct(f.popularity),f.assessed,f.leftover,pct(f.rate)]):[...a.discards].reverse().slice(0,25).map(d=>[dateTime(d.at),state.foods.find(f=>f.id===d.foodId)?.name??'Não identificado',levelLabels[d.level],d.note||'—']);
  const total=report==='plates'?a.plates.length:report==='foods'?a.foods.filter(f=>f.eligible||f.assessed).length:a.discards.length;
  return <Card title="Prévia do relatório" subtitle={'Exibindo '+number(rows.length)+' de '+number(total)+' registros. O CSV inclui todo o recorte.'} action={<Button disabled={!total} onClick={()=>download(report)}><Download size={17}/> Baixar CSV</Button>}>
    <div className="segmented report-tabs">{([['plates','Pratos e financeiro'],['foods','Alimentos e sobras'],['discards','Descartes anônimos']] as const).map(([k,v])=><Button variant="ghost" key={k} aria-pressed={report===k} onClick={()=>setReport(k)}>{v}</Button>)}</div>
    {rows.length?<div className="table-wrap"><table><thead><tr>{columns.map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>:<Empty>Nenhum registro neste relatório.</Empty>}
  </Card>;
}
function downloadReport(a:Analysis,state:State,start:string,end:string,kind:ReportKind) {
  const tickets=new Map(state.tickets.map(t=>[t.id,t.number]));
  const foods=new Map(state.foods.map(f=>[f.id,f.name]));
  const source=state.simulated?'Simulado':'Workspace';
  const rows=kind==='plates'?[
    ['Fonte','Comanda','ID do prato','Prato','Registro','Peso líquido (g)','Composição','Acompanhamentos','Carnes registradas','Receita (R$)','Custo das carnes (R$)','Peso estimado dos acompanhamentos (g)','Custo dos acompanhamentos (R$)','Custo alimentar (R$)','Resultado após custo alimentar (R$)','CMV (%)','Avaliação de sobras'],
    ...a.plates.map(p=>[source,tickets.get(p.ticketId)??'',p.id,p.sequence,dateTime(plateAt(p)),p.weight,p.composition,p.foodIds.map(k=>foods.get(k)).join(', '),p.grillKnown?p.meats.map(m=>foods.get(m.foodId)+' × '+m.count).join(', '):'Pendente',plateRevenue(p),p.finance?.meatCost??null,p.finance?.sideG??null,p.finance?.sideCost??null,p.finance?.cost??null,p.finance?.result??null,p.finance?.cmv??null,Object.entries(p.waste?.outcomes??{}).map(([k,v])=>foods.get(k)+' · '+levelLabels[v]).join(', ')||(p.waste?.plateClear?'Prato observado sem sobras':'Sem itens avaliados')]),
  ]:kind==='foods'?[
    ['Fonte','Alimento','Escolhas','Elegíveis','Popularidade (%)','Pratos avaliados','Pratos com sobras','Taxa de sobras (%)','Sem sobra','Sobra pequena','Sobra média','Sobra grande'],
    ...a.foods.filter(f=>f.eligible||f.assessed).map(f=>[source,f.name,f.selected,f.eligible,f.popularity,f.assessed,f.leftover,f.rate,f.intensity.sem_sobra,f.intensity.pequena,f.intensity.media,f.intensity.grande]),
  ]:[
    ['Fonte','Data e hora','Alimento','Intensidade','Observações'],
    ...a.discards.map(d=>[source,dateTime(d.at),foods.get(d.foodId??'')??'Não identificado',levelLabels[d.level],d.note]),
  ];
  const url=URL.createObjectURL(new Blob([exportCsv(rows)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='bovinus-'+({plates:'pratos',foods:'alimentos',discards:'descartes'})[kind]+'-'+start+'_'+end+'.csv';
  link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
