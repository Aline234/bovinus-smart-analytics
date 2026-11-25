import { evaluated, hasLeftover, day, hour, shiftDay, number, pct, money, type State, type Plate, type Level } from './model';
import { meatWeight, plateRevenue, ratio, sum } from './finance';

export type Filters = {start:string; end:string; fromHour:string; toHour:string; meat:string; food:string; category:string; ticket:string};
export const range = (days = 7, end = day()): Filters => ({start:shiftDay(end,1-days),end,fromHour:'',toHour:'',meat:'',food:'',category:'',ticket:''});
export const plateAt = (p: Plate) => p.weighedAt ?? p.createdAt;
const within = (at: string, f: Filters) => {
  const date = day(at);
  return date >= f.start && date <= f.end &&
    (f.fromHour === '' || hour(at) >= +f.fromHour) && (f.toHour === '' || hour(at) <= +f.toHour);
};
export const priorRange = (f: Filters): Filters => {
  const duration = Math.round((Date.parse(f.end)-Date.parse(f.start))/86400000)+1;
  return {...f,start:shiftDay(f.start,-Math.max(1,duration)),end:shiftDay(f.start,-1)};
};
type Intensity = Pick<Record<Level,number>,'pequena'|'media'|'grande'|'sem_sobra'>;
const counts = (): Intensity => ({pequena:0,media:0,grande:0,sem_sobra:0});
export type FoodMetric = {id:string; name:string; kind:'buffet'|'meat'; selected:number; eligible:number; assessed:number; leftover:number; popularity:number|null; rate:number|null; intensity:Intensity};
export function foodMetrics(state: State, plates: Plate[], filters: Filters): FoodMetric[] {
  const byDay = new Map<string,{buffet:number;meat:number}>();
  const picked = new Map<string,number>();
  const intensity = new Map<string,Intensity>();
  const activeIds = new Set(state.foods.filter(f=>f.active).map(f=>f.id));
  const menus = new Map(Object.entries(state.menus).map(([d,ids])=>[d,new Set(ids)]));
  for (const p of plates) {
    const d = day(plateAt(p));
    const available = menus.get(d) ?? activeIds;
    const bucket = byDay.get(d) ?? {buffet:0,meat:0};
    if (p.composition !== 'desconhecida') bucket.buffet++;
    if (p.grillKnown) bucket.meat++;
    byDay.set(d,bucket);
    const selected = [...p.foodIds,...new Set(p.meats.map(m=>m.foodId))];
    for (const id of selected) if (available.has(id)) picked.set(id,(picked.get(id) ?? 0)+1);
    for (const [id,level] of Object.entries(p.waste?.outcomes ?? {})) {
      if (level === 'nao_avaliado') continue;
      const result = intensity.get(id) ?? counts();
      result[level]++;
      intensity.set(id,result);
    }
  }
  return state.foods.filter(f =>
    (!filters.category || f.categoryId === filters.category) &&
    (!filters.food || f.kind === 'meat' || f.id === filters.food) &&
    (!filters.meat || f.kind === 'buffet' || f.id === filters.meat)
  ).map(f => {
    const eligible = [...byDay.entries()].reduce((n,[d,b]) => (menus.get(d) ?? activeIds).has(f.id) ? n + b[f.kind] : n,0);
    const i = intensity.get(f.id) ?? counts();
    const leftover = i.pequena+i.media+i.grande;
    const assessed = leftover+i.sem_sobra;
    const selected = picked.get(f.id) ?? 0;
    return {id:f.id,name:f.name,kind:f.kind,selected,eligible,assessed,leftover,popularity:ratio(selected,eligible),rate:ratio(leftover,assessed),intensity:i};
  });
}

export function analytics(state: State, filters: Filters) {
  const ticketById = new Map(state.tickets.map(t=>[t.id,t]));
  const foodsById = new Map(state.foods.map(f=>[f.id,f]));
  const categoryHas = (id: string) => foodsById.get(id)?.categoryId === filters.category;
  const plates = state.plates.filter(p =>
    within(plateAt(p),filters) &&
    (!filters.ticket || Number(ticketById.get(p.ticketId)?.number) === Number(filters.ticket)) &&
    (!filters.meat || p.meats.some(m=>m.foodId === filters.meat)) &&
    (!filters.food || p.foodIds.includes(filters.food)) &&
    (!filters.category || p.foodIds.some(categoryHas) || p.meats.some(m=>categoryHas(m.foodId)))
  );
  const ticketIds = new Set(plates.map(p=>p.ticketId));
  const measured = plates.filter(p=>p.weight !== null);
  const knownGrill = plates.filter(p=>p.grillKnown);
  const withFinance = plates.flatMap(p=>p.finance ? [p.finance] : []);
  const assessed = plates.filter(p=>p.waste?.plateClear||Object.values(p.waste?.outcomes ?? {}).some(evaluated));
  const withWaste = assessed.filter(p=>Object.values(p.waste?.outcomes ?? {}).some(hasLeftover));
  const discards = filters.ticket ? [] : state.discards.filter(d => within(d.at,filters) &&
    (!filters.food || d.foodId === filters.food) && (!filters.meat || d.foodId === filters.meat) &&
    (!filters.category || d.foodId !== null && categoryHas(d.foodId)));
  const revenues = plates.flatMap(p=>{const value=plateRevenue(p);return value===null?[]:[value];});
  const revenue = sum(withFinance,f=>f.revenue);
  const cost = sum(withFinance,f=>f.cost);
  const meatG = sum(plates,p=>meatWeight(p.meats));
  const byDay = new Map<string,{date:string; count:number; financial:number; revenue:number; cost:number; cmv:number|null}>();
  const cuts = new Map<string,{id:string;name:string;count:number;grams:number;cost:number}>();
  const hours = new Map<number,{label:string;grams:number;portions:number;series:Record<string,number>}>();
  for (const p of plates) {
    const d = day(plateAt(p));
    const row = byDay.get(d) ?? {date:d,count:0,financial:0,revenue:0,cost:0,cmv:null};
    row.count++;
    if (p.finance) {
      row.financial++;
      row.revenue += p.finance.revenue;
      row.cost += p.finance.cost;
      row.cmv = ratio(row.cost,row.revenue);
    }
    byDay.set(d,row);
    for (const m of p.meats) {
      const name = foodsById.get(m.foodId)?.name ?? m.foodId;
      const cut = cuts.get(m.foodId) ?? {id:m.foodId,name,count:0,grams:0,cost:0};
      const grams = m.count*m.grams;
      cut.cost += grams/1000*m.costKg;
      cut.grams += grams;
      cut.count += m.count;
      cuts.set(m.foodId,cut);
      const slot = hour(m.recordedAt);
      const bucket = hours.get(slot) ?? {label:String(slot).padStart(2,'0')+'h',grams:0,portions:0,series:{}};
      bucket.grams += grams;
      bucket.portions += m.count;
      bucket.series[m.foodId] = (bucket.series[m.foodId] ?? 0) + grams;
      hours.set(slot,bucket);
    }
  }
  const days = [...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if (days.length && Date.parse(filters.end)-Date.parse(filters.start)<=366*86400000) {
    days.length=0;
    for (let d=filters.start;d<=filters.end;d=shiftDay(d,1)) {
      days.push(byDay.get(d) ?? {date:d,count:0,financial:0,revenue:0,cost:0,cmv:null});
    }
  }
  const foods = foodMetrics(state,plates,filters);
  const intensity = counts();
  for (const f of foods) for (const k of Object.keys(intensity) as (keyof Intensity)[]) intensity[k] += f.intensity[k];
  return {plates,tickets:ticketIds.size,measured:measured.length,knownGrill:knownGrill.length,financial:withFinance.length,
    weight:sum(measured,p=>p.weight ?? 0),meatG,meatAverage:knownGrill.length ? meatG/knownGrill.length : null,
    pairedMeatG:sum(withFinance,f=>f.meatG),sideG:sum(withFinance,f=>f.sideG),cost,revenue,
    priced:revenues.length,grossRevenue:sum(revenues,v=>v),result:revenue-cost,cmv:ratio(cost,revenue),
    assessed:assessed.length,withWaste:withWaste.length,coverage:ratio(assessed.length,plates.length),
    wasteRate:ratio(withWaste.length,assessed.length),discards,days,cuts:[...cuts.values()].sort((a,b)=>b.cost-a.cost),foods,intensity,
    hours:[...hours.entries()].sort((a,b)=>a[0]-b[0]).map(([,h])=>h)};
}
export type Analysis = ReturnType<typeof analytics>;
export function insights(a: Analysis, b: Analysis, state: State) {
  const s = state.settings;
  const list: {kind:'alert'|'trend'|'info';title:string;text:string}[] = [];
  const top = a.cuts[0];
  if (top) list.push({kind:'trend',title:top.name + ' lidera o custo das carnes',text:pct(ratio(top.cost,sum(a.cuts,c=>c.cost))) + ' do custo dos cortes registrados no período.'});
  const waste = a.foods.filter(f=>f.assessed>=s.minSample && (f.rate ?? 0)>=s.waste).sort((a,b)=>(b.rate ?? 0)-(a.rate ?? 0))[0];
  if (waste) list.push({kind:'alert',title:waste.name + ' merece atenção',text:pct(waste.rate) + ' com sobras em ' + number(waste.assessed) + ' avaliações do alimento.'});
  const shift = a.foods.flatMap(f => {
    const previous = b.foods.find(p=>p.id===f.id);
    return f.rate !== null && f.assessed>=s.minSample && previous?.rate != null && previous.assessed>=s.minSample && f.rate-previous.rate>=3 ? [{f,delta:f.rate-previous.rate}] : [];
  }).sort((a,b)=>b.delta-a.delta)[0];
  if (shift) list.push({kind:'alert',title:'Aumento de sobras em ' + shift.f.name.toLowerCase(),text:'+' + number(shift.delta,1) + ' p.p. em relação ao período anterior de igual duração.'});
  const peak = [...a.hours].sort((a,b)=>b.portions-a.portions)[0];
  if (peak) list.push({kind:'trend',title:'Maior demanda às ' + peak.label,text:number(peak.portions) + ' porções foram registradas nessa faixa de uma hora.'});
  if (b.financial && a.financial && a.cost/a.financial > b.cost/b.financial)
    list.push({kind:'alert',title:'Custo por prato em alta',text:money(a.cost/a.financial) + ' por prato com cálculo, ante ' + money(b.cost/b.financial) + ' no período anterior.'});
  if (a.cmv !== null && a.cmv >= s.cmvAlert)
    list.push({kind:'alert',title:'CMV acima do limite configurado',text:pct(a.cmv) + ' no recorte, com limite de ' + pct(s.cmvAlert) + '.'});
  if (a.plates.length && a.assessed < s.minSample)
    list.push({kind:'info',title:'Amostra de sobras pequena',text:number(a.assessed) + ' pratos avaliados. São necessários ' + number(s.minSample) + ' para os alertas de taxa.'});
  if (a.coverage !== null && a.coverage < 100)
    list.push({kind:a.coverage<s.minCoverage?'alert':'info',title:'Cobertura da coleta de sobras',text:number(a.plates.length-a.assessed) + ' pratos sem avaliação de sobras. Cobertura de ' + pct(a.coverage) + '.'});
  return list;
}
export function exportCsv(rows: (string|number|null)[][]) {
  const clean = (v: string|number|null) => {
    const value = typeof v === 'number' ? String(v).replace('.',',') : v ?? '';
    const safe = typeof v === 'string' && /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"','""') + '"';
  };
  return '\uFEFF' + rows.map(r=>r.map(clean).join(';')).join('\r\n');
}
