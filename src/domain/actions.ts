import { z } from 'zod';
import { estimatePlate } from './finance';
import { day, id, levels, sizes, type Discard, type Food, type Level, type Plate, type Settings, type State, type Ticket } from './model';

const dateValue = z.iso.datetime({offset:true});
const ticketNumber = z.string().trim().regex(/^\d{1,8}$/, 'Informe um número de comanda com até 8 dígitos.').transform(v => v.padStart(4,'0'));
const positiveGrams = z.number().int().positive().max(20000);
const currency = z.number().finite().min(0).max(99999);
const threshold = z.number().finite().min(0).max(100);
const name = z.string().trim().min(2,'Informe um nome com pelo menos 2 caracteres.').max(80);
const settingsSchema = z.object({saleKg:currency,sideKg:currency,popularity:threshold,waste:threshold,minSample:z.number().int().min(1).max(10000),minCoverage:threshold,cmvAlert:threshold});
const foodSchema = z.object({id:z.string().min(1),name,categoryId:z.string().min(1),kind:z.enum(['meat','buffet']),active:z.boolean(),
  grams:z.object({pequena:z.number().int().min(0).max(5000),media:z.number().int().min(0).max(5000),grande:z.number().int().min(0).max(5000)}),costKg:currency});
const portionSchema = z.array(z.object({ foodId:z.string().min(1), size:z.enum(sizes), count:z.number().int().min(1).max(99) })).max(300);
const buffetSchema = z.object({weight:positiveGrams,composition:z.enum(['desconhecida','parcial','completa']), foodIds:z.array(z.string()), noMeat:z.boolean()});
const wasteSchema = z.object({at:dateValue,note:z.string().max(500).trim(),outcomes:z.record(z.string(),z.enum(levels)),plateClear:z.boolean().optional()});
const discardSchema = z.object({at:dateValue,foodId:z.string().nullable(),level:z.enum(sizes),note:z.string().max(500).trim()});
export type Portion = z.infer<typeof portionSchema>[number];
export type BuffetInput = z.infer<typeof buffetSchema>;
export type WasteInput = z.infer<typeof wasteSchema>;
export const friendlyError = (error: unknown) => error instanceof z.ZodError ? error.issues[0]?.message ?? 'Confira os campos.' : error instanceof Error ? error.message : 'Não foi possível salvar.';

function newPlate(ticketId: string, sequence: number, at: string, plateId = id()): Plate {
  return { id:plateId,ticketId,sequence,createdAt:at,weighedAt:null,weight:null,composition:'desconhecida',foodIds:[],
    grillKnown:false,meats:[],finance:null,financeHistory:[],waste:null };
}
function writePlate(state: State, plate: Plate) {
  return {...state, plates:state.plates.map(p => p.id === plate.id ? plate : p)};
}
function getPlate(state: State, plateId: string, allowNew = true) {
  const plate = state.plates.find(p => p.id === plateId);
  if (!plate) throw new Error('Prato não encontrado.');
  if (!allowNew && state.tickets.find(t => t.id === plate.ticketId)?.closedAt) throw new Error('A comanda já foi encerrada.');
  return plate;
}
function calculate(state: State, plate: Plate, at: string) {
  const finance = estimatePlate(plate,state.settings,at);
  if (finance && plate.finance) {
    const previous = plate.finance;
    const signature = (items: Plate['meats'] = []) => items.map(m=>[m.foodId,m.size,m.count,m.grams,m.costKg].join('/')).sort().join('|');
    if (finance.meatG===previous.meatG && finance.sideG===previous.sideG && finance.saleKg===previous.saleKg &&
      finance.sideKg===previous.sideKg && signature(finance.meatInputs)===signature(previous.meatInputs)) return plate;
  }
  return {...plate,finance,financeHistory:finance ? [...plate.financeHistory,{id:id(),finance}] : plate.financeHistory};
}
export interface TicketIntegration {
  open(number: string, at: string): Ticket;
  close(ticket: Ticket, at: string): Ticket;
}
export const simulatedTickets: TicketIntegration = {
  open: (number, at) => ({id:id(),number,openedAt:at,closedAt:null}),
  close: (ticket, at) => ({...ticket,closedAt:at}),
};
export function createTicket(state: State, input: string, at = new Date().toISOString(), integration = simulatedTickets) {
  const number = ticketNumber.parse(input);
  dateValue.parse(at);
  if (state.tickets.some(t => Number(t.number) === Number(number) && !t.closedAt)) throw new Error('Já há uma sessão aberta para esta comanda.');
  const ticket = integration.open(number,at);
  const plate = newPlate(ticket.id,1,at);
  return {state:{...state,tickets:[...state.tickets,ticket],plates:[...state.plates,plate]},ticket,plate};
}
export function closeTicket(state: State, ticketId: string, at = new Date().toISOString(), integration = simulatedTickets) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket || ticket.closedAt) throw new Error('Selecione uma comanda aberta.');
  dateValue.parse(at);
  if (Date.parse(at) < Date.parse(ticket.openedAt)) throw new Error('O encerramento deve ocorrer depois da entrada.');
  return {...state,tickets:state.tickets.map(t => t.id === ticketId ? integration.close(t,at) : t)};
}
export function addPlate(state: State, ticketId: string, at = new Date().toISOString()) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket || ticket.closedAt) throw new Error('Selecione uma comanda aberta.');
  dateValue.parse(at);
  if (Date.parse(at) < Date.parse(ticket.openedAt)) throw new Error('O prato deve ser registrado após a entrada.');
  const sequence = Math.max(0, ...state.plates.filter(p => p.ticketId === ticketId).map(p => p.sequence)) + 1;
  const plate = newPlate(ticketId,sequence,at);
  return {state:{...state,plates:[...state.plates,plate]},plate};
}
export const menuFor = (state: State, date: string) => state.menus[date] ?? state.foods.filter(f => f.active).map(f => f.id);
export function saveGrill(state: State, plateId: string, input: Portion[], at = new Date().toISOString()) {
  const current = getPlate(state,plateId);
  const plate = getPlate(state,plateId,current.grillKnown || current.weighedAt !== null);
  const items = portionSchema.parse(input);
  dateValue.parse(at);
  if (new Set(items.map(p => p.foodId + '/' + p.size)).size !== items.length) throw new Error('Agrupe as porções de cada corte e tamanho.');
  const date=day(plate.weighedAt??at);
  const available=menuFor(state,date);
  const meats = items.map(p => {
    const previous = plate.meats.find(m => m.foodId === p.foodId && m.size === p.size);
    if (previous) return {...previous,count:p.count};
    const food = state.foods.find(f => f.id === p.foodId && f.kind === 'meat' && available.includes(f.id));
    if (!food) throw new Error('Corte de carne indisponível.');
    return {...p,grams:food.grams[p.size],costKg:food.costKg,recordedAt:at};
  });
  const catalog=state.menus[date] ? state : {...state,menus:{...state.menus,[date]:available}};
  return writePlate(catalog,calculate(state,{...plate,grillKnown:true,meats},at));
}
export function saveBuffet(state: State, plateId: string, input: BuffetInput, at = new Date().toISOString()) {
  const current = getPlate(state,plateId);
  const plate = getPlate(state,plateId,current.weighedAt !== null);
  const {foodIds,weight,composition,noMeat} = buffetSchema.parse(input);
  dateValue.parse(at);
  const unique = [...new Set(foodIds)];
  const date = day(plate.weighedAt ?? at);
  const available = menuFor(state,date);
  if (unique.some(k => !state.foods.some(f => f.id === k && f.kind === 'buffet') || (!available.includes(k) && !plate.foodIds.includes(k)))) throw new Error('Confira os alimentos disponíveis.');
  if (composition === 'desconhecida' && unique.length) throw new Error('Selecione composição parcial ou completa para registrar acompanhamentos.');
  if (noMeat && plate.meats.length) throw new Error('Corrija as porções na churrasqueira antes de confirmar um prato sem carne.');
  const catalog = state.menus[date] ? state : {...state,menus:{...state.menus,[date]:available}};
  const pricing = plate.pricing ?? {saleKg:state.settings.saleKg,sideKg:state.settings.sideKg};
  return writePlate(catalog,calculate(state,{...plate,weight,pricing,composition,foodIds:unique,
    weighedAt:plate.weighedAt ?? at,grillKnown:plate.grillKnown || noMeat},at));
}
export function saveWaste(state: State, plateId: string, input: WasteInput) {
  const plate = getPlate(state,plateId);
  const waste = wasteSchema.parse(input);
  if (Math.floor(Date.parse(waste.at)/60000) < Math.floor(Date.parse(plate.createdAt)/60000)) throw new Error('O recolhimento deve ocorrer depois da criação do prato.');
  if (Object.keys(waste.outcomes).some(k => !state.foods.some(f => f.id === k))) throw new Error('Selecione alimentos cadastrados.');
  if (waste.plateClear && Object.values(waste.outcomes).some(level=>level!=='nao_avaliado'&&level!=='sem_sobra')) throw new Error('Revise as sobras observadas antes de marcar o prato sem sobras.');
  return writePlate(state,{...plate,waste});
}
export function saveDiscard(state: State, input: Omit<Discard,'id'>, discardId?: string) {
  const discard = discardSchema.parse(input);
  if (discard.foodId && !state.foods.some(f => f.id === discard.foodId)) throw new Error('Selecione um alimento cadastrado.');
  if (!discardId) return {...state,discards:[...state.discards,{...discard,id:id()}]};
  if (!state.discards.some(item=>item.id===discardId)) throw new Error('Descarte não encontrado.');
  return {...state,discards:state.discards.map(item=>item.id===discardId?{...discard,id:discardId}:item)};
}
export const saveSettings = (state: State, input: Settings) => ({...state,settings:settingsSchema.parse(input)});
export function saveCategory(state: State, categoryId: string, input: string) {
  const category = {id:categoryId,name:name.parse(input)};
  if (state.categories.some(c => c.id !== categoryId && c.name.toLocaleLowerCase('pt-BR') === category.name.toLocaleLowerCase('pt-BR'))) throw new Error('Já existe uma categoria com este nome.');
  return {...state,categories:[...state.categories.filter(c => c.id !== categoryId),category]};
}
export function saveFood(state: State, input: Food) {
  const food = foodSchema.parse(input);
  if (!state.categories.some(c => c.id === food.categoryId)) throw new Error('Selecione uma categoria.');
  if (state.foods.some(f => f.id !== food.id && f.name.toLocaleLowerCase('pt-BR') === food.name.toLocaleLowerCase('pt-BR'))) throw new Error('Já existe um alimento com este nome.');
  if (food.kind === 'meat' && !(food.grams.pequena > 0 && food.grams.pequena <= food.grams.media && food.grams.media <= food.grams.grande))
    throw new Error('Informe pesos positivos em ordem crescente para as três porções.');
  const existing = state.foods.find(f => f.id === food.id);
  if (existing && existing.kind !== food.kind) throw new Error('O tipo de um alimento cadastrado é permanente.');
  return {...state,foods:existing ? state.foods.map(f => f.id === food.id ? food : f) : [...state.foods,food]};
}
export function saveMenu(state: State, date: string, ids: string[]) {
  z.iso.date().parse(date);
  if (ids.some(k => !state.foods.some(f => f.id === k))) throw new Error('Selecione alimentos cadastrados.');
  return {...state,menus:{...state.menus,[date]:[...new Set(ids)]}};
}
export const noWaste = (ids: string[]) => Object.fromEntries(ids.map(k => [k,'sem_sobra' as Level]));
