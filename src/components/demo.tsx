'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BarChart3, Check, ClipboardList, Flame, FlaskConical, RotateCcw, Scale, Trash2 } from 'lucide-react';
import { createTicket, noWaste, saveBuffet, saveGrill, saveWaste } from '@/domain/actions';
import { gram, number, plateFoods, type State } from '@/domain/model';
import { synthetic } from '@/domain/seed';
import { FinanceSummary } from './operations';
import { useData } from './data-provider';
import { Button, Card, cn, PageHeading } from './ui';

const sideIds=['arroz','feijao','salada','lasanha'];
const portions=[{foodId:'picanha',size:'media',count:2},{foodId:'frango',size:'media',count:1}] as const;
const steps=[
  {title:'Criar comanda 0042',description:'Abra a sessão e associe o prato 01.',icon:ClipboardList,action:'Criar comanda 0042'},
  {title:'Registrar as carnes',description:'Duas porções médias de picanha e uma de frango.',icon:Flame,action:'Registrar porções'},
  {title:'Registrar composição e pesagem',description:'Arroz branco, feijão, salada e lasanha. Peso líquido de 580 g.',icon:Scale,action:'Registrar prato de 580 g'},
  {title:'Avaliar as sobras',description:'Lasanha com sobra grande. Demais alimentos sem sobra.',icon:Trash2,action:'Registrar sobras'},
  {title:'Ver o impacto no painel',description:'Consulte o cálculo do prato, o ranking de sobras e a matriz.',icon:BarChart3,action:''},
];
function progress(state:State){
  const ticket=[...state.tickets].reverse().find(t=>Number(t.number)===42&&!t.closedAt);
  const plate=state.plates.find(p=>p.ticketId===ticket?.id&&p.sequence===1);
  const meatDone=plate?.meats.length===2&&portions.every(m=>plate.meats.some(p=>p.foodId===m.foodId&&p.size===m.size&&p.count===m.count));
  const buffetDone=plate?.weight===580&&plate.composition==='completa'&&sideIds.every(k=>plate.foodIds.includes(k))&&plate.foodIds.length===sideIds.length;
  const wasteDone=plate?.waste?.outcomes.lasanha==='grande'&&plateFoods(plate).filter(k=>k!=='lasanha').every(k=>plate.waste?.outcomes[k]==='sem_sobra');
  const current=!ticket||!plate?0:!meatDone?1:!buffetDone?2:!wasteDone?3:4;
  return {ticket,plate,current};
}
export function Demo() {
  const {state,update,busy,demo}=useData();
  const [restore,setRestore]=useState(false);
  if(!state) return null;
  const {ticket,plate,current}=progress(state);
  const run=(step:number)=>void update(s=>{
    const {plate,current}=progress(s);
    if(step!==current) throw new Error('Atualize o roteiro para continuar.');
    if(step===0) return createTicket(s,'0042').state;
    if(!plate) throw new Error('Abra a comanda para continuar.');
    if(step===1) return saveGrill(s,plate.id,[...portions]);
    if(step===2) return saveBuffet(s,plate.id,{weight:580,composition:'completa',foodIds:sideIds,noMeat:false});
    return saveWaste(s,plate.id,{at:new Date().toISOString(),note:'',outcomes:{...noWaste(plateFoods(plate)),lasanha:'grande'}});
  },'Etapa do roteiro registrada.');
  return <>
    <PageHeading title="Demonstração guiada" description="Percorra a jornada do prato 01 da comanda 0042 e acompanhe os registros no dashboard." actions={state.simulated&&<Button variant="outline" onClick={()=>setRestore(v=>!v)}><RotateCcw size={17}/> Restaurar dados</Button>}/>
    {!state.simulated?<Card title="A demonstração usa dados simulados"><Button disabled={busy} onClick={()=>void demo()}><FlaskConical size={17}/> Ativar demonstração local</Button></Card>:<>
      {restore&&<Card title="Restaurar a base de demonstração?" subtitle="Os registros e ajustes feitos neste navegador serão substituídos pela base sintética."><div className="row"><Button variant="danger" disabled={busy} onClick={async()=>{if(await update(()=>synthetic(),'Base de demonstração restaurada.'))setRestore(false);}}>Confirmar restauração</Button><Button variant="ghost" onClick={()=>setRestore(false)}>Cancelar</Button></div></Card>}
      <div className="demo-banner"><div className="demo-icon"><FlaskConical size={20}/></div><div><strong>Base de demonstração</strong><p>{number(state.tickets.length)} comandas · {number(state.plates.length)} pratos · dados simulados</p></div></div>
      <div className="operation-grid">
        <Card title="Jornada do prato">
          <ol className="demo-steps">{steps.map(({title,description,icon:Icon,action},i)=><li key={title} className={cn('demo-step',i===current&&'current',i<current&&'complete')} aria-current={i===current?'step':undefined}><span className="step-icon">{i<current?<Check size={18}/>:<Icon size={18}/>}</span><div><h3>{i+1}. {title}</h3><p>{description}</p>{i===current&&action&&<Button disabled={busy} onClick={()=>run(i)}>{action}</Button>}{i===4&&current===4&&<div className="row"><Link className="button button-primary" href="/dashboard?comanda=0042"><BarChart3 size={17}/> Ver impacto no dashboard</Link><Link className="button button-outline" href="/analises#matriz">Ranking e matriz</Link></div>}</div></li>)}</ol>
        </Card>
        <div className="card-stack"><Card title="Cálculo financeiro" subtitle={plate?.weight?gram(plate.weight)+' de peso líquido medido':'Aguardando a pesagem do prato.'}><FinanceSummary finance={plate?.finance??null}/></Card>
          {ticket&&<Card title="Consulta operacional"><Link className="button button-outline" href={'/comandas/'+ticket.id}><ClipboardList size={17}/> Abrir comanda #{ticket.number}</Link></Card>}</div>
      </div>
    </>}
  </>;
}
