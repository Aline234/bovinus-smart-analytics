'use client';

import { useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import type { Analysis, FoodMetric } from '@/domain/analytics';
import { dateTime, displayDate, money, number, pct, type Settings } from '@/domain/model';
import { Card, Empty } from './ui';

const red='#a61919';
const gold='#d5a332';
const colors=[red,gold,'#a57161','#dfc3a5','#717a60','#c9826c','#925d30','#637988','#bd6c4a','#b25a73'];
const tooltipStyle={borderRadius:9,border:'1px solid #e7dfd9',boxShadow:'0 4px 16px #34201a17',fontSize:12,color:'#2f2622'};
const axis={fill:'#766b64',fontSize:11};
const grid='#eee6df';
export function ChartFrame({title,subtitle,children,hasData=true,className}:{title:string;subtitle?:string;children:ReactNode;hasData?:boolean;className?:string}) {
  return <Card title={title} subtitle={subtitle} className={className}>{hasData?<div className="chart">{children}</div>:<Empty>Sem registros suficientes no recorte selecionado.</Empty>}</Card>;
}
const currencyAxis=(v:number)=>v>=1000?'R$ '+number(v/1000,1)+' mil':'R$ '+number(v);
const hasIsolatedValue = (values: (number | null)[]) =>
  values.some((value,index)=>value!==null && values[index-1]==null && values[index+1]==null);
export function RevenueChart({a,onlyCost=false}:{a:Analysis;onlyCost?:boolean}) {
  const data=a.days.map(d=>({...d,label:displayDate(d.date,false),revenue:d.financial?d.revenue:null,cost:d.financial?d.cost:null}));
  const showDots=hasIsolatedValue(data.map(d=>d.cost));
  return <ChartFrame title={onlyCost?'Custo alimentar por dia':'Receita × custo alimentar'} subtitle={onlyCost?'Custo estimado nos dias com cálculo.':'Valores estimados por dia nos pratos com cálculo alimentar.'} hasData={a.financial>0}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={data} margin={{top:14,right:10,left:2,bottom:6}}>
        <defs><linearGradient id={onlyCost?'just-cost':'revenue-fill'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={onlyCost?gold:red} stopOpacity={.19}/><stop offset="100%" stopColor={onlyCost?gold:red} stopOpacity={.015}/></linearGradient></defs>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={grid}/>
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axis} tickMargin={9} minTickGap={15}/>
        <YAxis tickFormatter={currencyAxis} width={83} axisLine={false} tickLine={false} tick={axis}/>
        <Tooltip formatter={value=>money(Number(value))} contentStyle={tooltipStyle}/>
        {!onlyCost&&<Area type="monotone" dataKey="revenue" name="Receita estimada" stroke={red} strokeWidth={2.5} fill="url(#revenue-fill)" dot={showDots&&{r:4}} isAnimationActive={false}/>}
        <Area type="monotone" dataKey="cost" name="Custo alimentar" stroke={gold} strokeWidth={2.4} fill={onlyCost?'url(#just-cost)':'transparent'} dot={showDots&&{r:4}} isAnimationActive={false}/>
        {!onlyCost&&<Legend iconType="circle" iconSize={7} wrapperStyle={{fontSize:12,paddingTop:8}}/>}
      </AreaChart>
    </ResponsiveContainer>
  </ChartFrame>;
}
export function CutsChart({a}:{a:Analysis}) {
  const total=a.cuts.reduce((n,c)=>n+c.cost,0);
  return <Card title="Custo por corte" subtitle="Participação no custo estimado das carnes.">
    {total ? <><div className="donut-area"><div className="donut-center"><strong>{money(total)}</strong><small>Custo das carnes</small></div>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart><Pie data={a.cuts} dataKey="cost" nameKey="name" innerRadius="70%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={false}>{a.cuts.map((cut,i)=><Cell key={cut.id} fill={colors[i%colors.length]}/>)}</Pie><Tooltip formatter={v=>money(Number(v))} contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer>
    </div><div className="cut-legend">{a.cuts.slice(0,4).map((c,i)=><div key={c.id}><span><i style={{background:colors[i]}}/>{c.name}</span><strong>{pct(c.cost/total*100)}</strong></div>)}{a.cuts.length>4&&<details className="other-cuts"><summary>Mais {a.cuts.length-4} cortes</summary>{a.cuts.slice(4).map((c,i)=><div key={c.id}><span><i style={{background:colors[(i+4)%colors.length]}}/>{c.name}</span><strong>{pct(c.cost/total*100)}</strong></div>)}</details>}</div></>:<Empty>Sem custos de carnes no período.</Empty>}
  </Card>;
}
export function HoursChart({a}:{a:Analysis}) {
  const data=a.hours.map(h=>({label:h.label,total:h.grams/1000,...Object.fromEntries(Object.entries(h.series).map(([k,v])=>[k,v/1000]))}));
  return <ChartFrame title="Consumo de carnes por horário" subtitle="Quilos estimados por corte na hora do registro." hasData={data.length>0}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={data}>
      <CartesianGrid vertical={false} stroke={grid} strokeDasharray="4 4"/><XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false}/><YAxis tick={axis} tickFormatter={v=>number(v,1)+' kg'} axisLine={false} tickLine={false} width={66}/>
      <Tooltip formatter={v=>number(Number(v),2)+' kg'} contentStyle={tooltipStyle}/>
      {a.cuts.map((c,i)=><Bar key={c.id} dataKey={c.id} name={c.name} stackId="kg" fill={colors[i%colors.length]} isAnimationActive={false}/>)}
    </BarChart></ResponsiveContainer>
  </ChartFrame>;
}
export function CmvChart({a,settings}:{a:Analysis;settings:Settings}) {
  const showDots=a.days.length<9||hasIsolatedValue(a.days.map(d=>d.cmv));
  return <ChartFrame title="Evolução do CMV alimentar" subtitle={'Limite de alerta em '+pct(settings.cmvAlert)+'.'} hasData={a.days.some(d=>d.cmv!==null)}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={a.days.map(d=>({...d,label:displayDate(d.date,false)}))} margin={{top:14,right:12,bottom:7}}>
      <CartesianGrid vertical={false} stroke={grid} strokeDasharray="4 4"/><XAxis dataKey="label" tick={axis} minTickGap={10} axisLine={false} tickLine={false}/><YAxis tick={axis} tickFormatter={v=>pct(v)} axisLine={false} tickLine={false} width={59}/>
      <Tooltip formatter={v=>pct(Number(v))} contentStyle={tooltipStyle}/><ReferenceLine y={settings.cmvAlert} stroke={gold} strokeDasharray="5 4"/>
      <Line dataKey="cmv" name="CMV alimentar" stroke={red} strokeWidth={2.5} dot={showDots} isAnimationActive={false}/>
    </LineChart></ResponsiveContainer>
  </ChartFrame>;
}
export function CompositionChart({a}:{a:Analysis}) {
  const data=[{name:'Carnes',value:a.pairedMeatG/1000},{name:'Acompanhamentos',value:a.sideG/1000}];
  return <ChartFrame title="Carnes e acompanhamentos" subtitle={'Estimativa em '+number(a.financial)+' pratos com cálculo alimentar.'} hasData={a.financial>0}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="56%" outerRadius="76%" stroke="none" isAnimationActive={false}>{data.map((d,i)=><Cell key={d.name} fill={colors[i]}/>)}</Pie><Legend iconType="circle" iconSize={8}/><Tooltip formatter={v=>number(Number(v),1)+' kg'} contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer>
  </ChartFrame>;
}
export function Bars({title,subtitle,data,unit='',paint=red}:{title:string;subtitle:string;data:{name:string;value:number}[];unit?:string;paint?:string}) {
  return <ChartFrame title={title} subtitle={subtitle} hasData={data.length>0}><ResponsiveContainer width="100%" height="100%" minWidth={0}>
    <BarChart data={data} layout="vertical" margin={{right:15,left:5,top:4,bottom:3}}><CartesianGrid horizontal={false} stroke={grid} strokeDasharray="4 4"/><XAxis type="number" tick={axis} axisLine={false} tickLine={false} tickFormatter={v=>number(v,1)+unit} domain={unit==='%'?[0,100]:[0,'auto']}/><YAxis dataKey="name" type="category" tick={axis} axisLine={false} tickLine={false} width={114}/><Tooltip formatter={v=>number(Number(v),1)+unit} contentStyle={tooltipStyle}/><Bar dataKey="value" name={unit==='%'?'Taxa de sobras':'Total de ocorrências'} fill={paint} radius={[0,4,4,0]} maxBarSize={20} isAnimationActive={false}/></BarChart>
  </ResponsiveContainer></ChartFrame>;
}
export function Matrix({a,settings,setSelected}:{a:Analysis;settings:Settings;setSelected:(id:string)=>void}) {
  const points=a.foods.filter(f=>f.popularity!==null&&f.rate!==null);
  const yMax=Math.min(100,Math.max(50,Math.ceil(Math.max(settings.waste,...points.map(f=>f.rate??0))/10)*10+10));
  return <div id="matriz"><Card title="Matriz de popularidade e aceitação" subtitle={'Limites de '+pct(settings.popularity)+' de popularidade e '+pct(settings.waste)+' de taxa de sobras.'}>
    {points.length?<><div className="matrix-chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}><ScatterChart margin={{top:16,right:22,bottom:31,left:6}}>
        <CartesianGrid stroke={grid} strokeDasharray="3 4"/><XAxis type="number" dataKey="popularity" name="Popularidade" domain={[0,100]} tick={axis} tickFormatter={v=>pct(v)} label={{value:'Popularidade',position:'bottom',offset:12,fill:axis.fill,fontSize:12}}/>
        <YAxis type="number" dataKey="rate" name="Taxa de sobras" domain={[0,yMax]} tick={axis} tickFormatter={v=>pct(v)} width={59} label={{value:'Taxa de sobras',angle:-90,position:'insideLeft',fill:axis.fill,fontSize:12}}/><ZAxis range={[90,120]}/>
        <ReferenceLine x={settings.popularity} stroke="#8f766e" strokeDasharray="5 4"/><ReferenceLine y={settings.waste} stroke="#8f766e" strokeDasharray="5 4"/>
        <Tooltip cursor={{strokeDasharray:'3 3'}} content={({active,payload})=>{const f=payload?.[0]?.payload as FoodMetric|undefined;return active&&f?<div className="chart-tooltip"><strong>{f.name}</strong><span>Popularidade {pct(f.popularity)}</span><span>Taxa de sobras {pct(f.rate)} · n = {f.assessed}</span></div>:null;}}/>
        <Scatter data={points} onClick={(_point,index)=>{if(points[index])setSelected(points[index].id);}} isAnimationActive={false} style={{cursor:'pointer'}}>{points.map(f=><Cell key={f.id} fill={(f.rate??0)>=settings.waste?red:(f.popularity??0)>=settings.popularity?'#617951':gold} opacity={.86}/>)}</Scatter>
      </ScatterChart></ResponsiveContainer>
    </div><div className="quadrants"><span>Alta popularidade · baixa sobra: boa aceitação aparente</span><span>Alta popularidade · alta sobra: vale investigar</span><span>Baixa popularidade · alta sobra: possível dificuldade de aceitação</span><span>Baixa popularidade · baixa sobra: consumo mais específico</span></div><p className="muted">Sobras podem refletir temperatura, sabor, textura ou tamanho da porção. Amostras menores que {settings.minSample} exigem cautela.</p></>:<Empty>Registre escolhas e avalie sobras para preencher a matriz.</Empty>}
  </Card></div>;
}
export function FoodHistory({a,food,stateName}:{a:Analysis;food:FoodMetric;stateName:(ticketId:string)=>string}) {
  const [page,setPage]=useState(0);
  const rows=a.plates.filter(p=>p.foodIds.includes(food.id)||p.meats.some(m=>m.foodId===food.id)||p.waste?.outcomes[food.id]).reverse();
  const last=Math.max(0,Math.ceil(rows.length/8)-1);
  const current=Math.min(page,last);
  return <Card title={'Histórico de '+food.name} subtitle={number(food.selected)+' escolhas entre '+number(food.eligible)+' pratos elegíveis · '+number(food.assessed)+' avaliações do item.'}>
    <div className="row intensity-tags">{([['sem_sobra','Sem sobra'],['pequena','Pequena'],['media','Média'],['grande','Grande']] as const).map(([k,l])=><span className="tag" key={k}>{l} · {number(food.intensity[k])}</span>)}</div>
    {rows.length?<div className="table-wrap"><table><thead><tr><th>Comanda</th><th>Prato</th><th>Registro</th><th>Observação de sobra</th></tr></thead><tbody>{rows.slice(current*8,current*8+8).map(p=><tr key={p.id}><td><a className="text-link" href={'/comandas/'+p.ticketId}>#{stateName(p.ticketId)}</a></td><td>{p.sequence}</td><td>{dateTime(p.weighedAt??p.createdAt)}</td><td>{({sem_sobra:'Sem sobra',pequena:'Sobra pequena',media:'Sobra média',grande:'Sobra grande',nao_avaliado:'Não avaliado'})[p.waste?.outcomes[food.id]??'nao_avaliado']}</td></tr>)}</tbody></table></div>:<Empty>Nenhum registro deste item no período.</Empty>}
    {last>0&&<div className="pagination"><button className="button button-outline button-sm" disabled={current===0} onClick={()=>setPage(current-1)}>Anterior</button><span>{current+1} de {last+1}</span><button className="button button-outline button-sm" disabled={current===last} onClick={()=>setPage(current+1)}>Próxima</button></div>}
  </Card>;
}
