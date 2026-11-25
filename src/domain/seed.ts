import { initialState } from './catalog';
import { estimate, meatWeight } from './finance';
import { day, plateFoods, shiftDay, type Level, type Meat, type Plate, type State } from './model';

export function synthetic(anchor = day(), seed = 0x42b0): State {
  let n = seed >>> 0;
  const rand = () => {
    n = (Math.imul(n,1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
  const state = initialState(true);
  const sides = state.foods.filter(f => f.kind === 'buffet');
  const cuts = state.foods.filter(f => f.kind === 'meat');
  const choices = [.79,.18,.72,.27,.41,.38,.25,.4,.43,.55,.34,.23,.17,.04];
  const wasteRates = [.05,.08,.079,.34,.42,.181,.30,.14,.07,.12,.17,.16,.08,.16];
  for (let d = 0; d < 30; d++) {
    const date = shiftDay(anchor,d - 29);
    const addMinutes = (m: number) => new Date(Date.parse(date + 'T11:00:00-03:00') + m*60000).toISOString();
    const menu = sides.filter((_,i) => ![3,5,6,11].includes(i) || (d+i)%4 !== 0);
    state.menus[date] = [...menu.map(f => f.id),...cuts.map(f => f.id)];
    const count = 150 + (d*13)%35 + (d < 5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const idx = state.tickets.length + 100;
      const ticketId = 'demo-c-' + idx;
      const offset = Math.floor(14 + (rand()+rand()+rand())/3 * 205);
      const isOpen = d === 29 && i >= count - 8;
      const ticket = { id:ticketId, number:String(idx).padStart(4,'0'), openedAt:addMinutes(offset), closedAt:isOpen ? null : addMinutes(offset+53) };
      state.tickets.push(ticket);
      const plateCount = rand() < .23 ? 2 : 1;
      for (let sequence = 1; sequence <= plateCount; sequence++) {
        const plateId = ticketId + '-' + sequence;
        const minutes = offset + 2 + (sequence-1)*22;
        const at = addMinutes(minutes);
        let weight = Math.round((320 + rand()*455 + (sequence === 1 ? 48 : -65))/5)*5;
        const grillKnown = rand() > .045;
        const meatCount = grillKnown && rand() > .1 ? 1 + Math.floor(rand()*3) : 0;
        const meats: Meat[] = [];
        for (let i = 0; i < meatCount; i++) {
          const r = rand();
          const pick = r < .31 + (minutes > 60 && minutes < 120 ? .08 : 0) ? 0 : r > .88 ? 7 : 1 + Math.floor(rand()*9);
          const food = cuts[pick];
          const size = rand() < .18 ? 'pequena' : rand() > .84 ? 'grande' : 'media';
          const existing = meats.find(m => m.foodId === food.id && m.size === size);
          if (existing) existing.count++;
          else meats.push({foodId:food.id,size,count:1,grams:food.grams[size],costKg:Math.round(food.costKg*(.94+d*.004)*100)/100,recordedAt:at});
        }
        const composition = rand() < .045 ? 'desconhecida' : rand() < .11 ? 'parcial' : 'completa';
        const foodIds = composition === 'desconhecida' ? [] : sides.filter((f,i) => menu.includes(f) && rand() < choices[i] * (composition === 'parcial' ? .56 : 1)).map(f => f.id);
        weight = Math.max(weight,meatWeight(meats)+50);
        const finance = grillKnown ? estimate(weight,meats,{saleKg:state.settings.saleKg,sideKg:Math.round((11.3+d*.045)*100)/100},at) : null;
        const plate: Plate = {id:plateId,ticketId,sequence,createdAt:at,weighedAt:addMinutes(minutes+1),weight,pricing:{saleKg:state.settings.saleKg,sideKg:Math.round((11.3+d*.045)*100)/100},composition,foodIds,grillKnown,meats,
          finance,financeHistory:finance ? [{id:'demo-f-' + plateId,finance}] : [],waste:null};
        if (rand() < .73) {
          const outcomes: Record<string, Level> = {};
          const partial = rand() < .22;
          for (const k of plateFoods(plate)) {
            const foodIndex = sides.findIndex(f => f.id === k);
            const rate = foodIndex < 0 ? .07 : wasteRates[foodIndex] + (k === 'feijoada' && d > 22 ? .065 : 0);
            const r = rand();
            outcomes[k] = partial && rand() < .35 ? 'nao_avaliado' : r >= rate ? 'sem_sobra' : r < rate*.18 ? 'grande' : r < rate*.53 ? 'media' : 'pequena';
          }
          plate.waste = {at:addMinutes(minutes+31),note:'',outcomes};
        }
        state.plates.push(plate);
      }
    }
    for (let i = 0; i < 2+d%4; i++) state.discards.push({
      id:'demo-d-' + d + '-' + i, at:addMinutes(50 + Math.floor(rand()*140)),
      foodId:rand() > .24 ? menu[Math.floor(rand()*menu.length)].id : null,
      level:rand() < .6 ? 'pequena' : rand() < .7 ? 'media' : 'grande',note:'',
    });
  }
  return state;
}
