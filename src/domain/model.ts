export const levels = ['nao_avaliado', 'sem_sobra', 'pequena', 'media', 'grande'] as const;
export type Level = (typeof levels)[number];
export const levelLabels: Record<Level, string> = {
  nao_avaliado: 'Não avaliado', sem_sobra: 'Sem sobra', pequena: 'Sobra pequena',
  media: 'Sobra média', grande: 'Sobra grande',
};
export const sizes = ['pequena', 'media', 'grande'] as const;
export type Size = (typeof sizes)[number];
export const sizeLabels: Record<Size, string> = { pequena: 'Pequena', media: 'Média', grande: 'Grande' };
export type Category = { id: string; name: string };
export type Food = { id: string; name: string; categoryId: string; kind: 'buffet' | 'meat'; active: boolean; grams: Record<Size, number>; costKg: number };
export type Settings = { saleKg: number; sideKg: number; popularity: number; waste: number; minSample: number; minCoverage: number; cmvAlert: number };
export type Ticket = { id: string; number: string; openedAt: string; closedAt: string | null };
export type Meat = { foodId: string; size: Size; count: number; grams: number; costKg: number; recordedAt: string };
export type Finance = {
  saleKg: number; sideKg: number; meatG: number; meatCost: number; sideG: number; sideCost: number;
  revenue: number; cost: number; result: number; cmv: number | null; meatShare: number; at: string; meatInputs?: Meat[];
};
export type FinanceVersion = { id: string; finance: Finance };
export type Waste = { at: string; note: string; outcomes: Record<string, Level>; plateClear?: boolean };
export type Composition = 'desconhecida' | 'parcial' | 'completa';
export type Plate = {
  id: string; ticketId: string; sequence: number; createdAt: string; weighedAt: string | null;
  weight: number | null; pricing?: Pick<Settings, 'saleKg' | 'sideKg'> | null; composition: Composition; foodIds: string[]; grillKnown: boolean; meats: Meat[];
  finance: Finance | null; financeHistory: FinanceVersion[]; waste: Waste | null;
};
export type Discard = { id: string; at: string; foodId: string | null; level: Size; note: string };
export type State = {
  version: 1; simulated: boolean; revision: number; categories: Category[]; foods: Food[];
  menus: Record<string, string[]>; settings: Settings; tickets: Ticket[]; plates: Plate[]; discards: Discard[];
};
export const number = (v: number, digits = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(v);
export const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
export const pct = (v: number | null) => v === null ? '—' : number(v, 1) + '%';
export const kg = (g: number) => number(g / 1000, 1) + ' kg';
export const gram = (g: number) => number(g, 1) + ' g';
export const sequence = (n: number) => String(n).padStart(2, '0');
export const zone = 'America/Sao_Paulo';
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const day = (at: string | Date = new Date()) => typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : dayFmt.format(new Date(at));
export const time = (at: string) => timeFmt.format(new Date(at));
export const hour = (at: string) => Number(time(at).slice(0, 2));
export const shiftDay = (date: string, offset: number) => {
  const at = new Date(date + 'T12:00:00Z');
  at.setUTCDate(at.getUTCDate() + offset);
  return at.toISOString().slice(0, 10);
};
export const displayDate = (date: string, full = true) => day(date).split('-').reverse().slice(0, full ? 3 : 2).join('/');
export const dateTime = (at: string) => displayDate(at) + ' às ' + time(at);
export const localDateTime = (at: string) => day(at) + 'T' + time(at);
export const fromLocal = (value: string) => new Date(value + ':00-03:00').toISOString();
export const id = () => typeof globalThis.crypto.randomUUID === 'function'
  ? globalThis.crypto.randomUUID()
  : Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte=>byte.toString(16).padStart(2,'0')).join('');
export const plateFoods = (plate: Plate) => [...new Set([...plate.foodIds, ...plate.meats.map(m => m.foodId)])];
export const evaluated = (level: Level) => level !== 'nao_avaliado';
export const hasLeftover = (level: Level) => evaluated(level) && level !== 'sem_sobra';
