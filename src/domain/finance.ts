import type { Finance, Meat, Plate, Settings } from './model';
export const ratio = (part: number, total: number) => Number.isFinite(part) && Number.isFinite(total) && total > 0 ? part / total * 100 : null;
export const sum = <T,>(items: T[], value: (item: T) => number) => items.reduce((total, item) => total + value(item), 0);
export const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const estimateRevenue = (weight: number, saleKg: number) => roundMoney(weight / 1000 * saleKg);
export function plateRevenue(plate: Plate) {
  if (plate.finance) return plate.finance.revenue;
  return plate.weight !== null && plate.pricing ? estimateRevenue(plate.weight,plate.pricing.saleKg) : null;
}
export const meatWeight = (meats: Meat[]) => sum(meats, m => m.grams * m.count);
export const meatCost = (meats: Meat[]) => roundMoney(sum(meats, m => m.grams * m.count / 1000 * m.costKg));
export function estimate(weight: number, meats: Meat[], pricing: Pick<Settings, 'saleKg' | 'sideKg'>, at: string): Finance {
  if (!Number.isFinite(weight) || weight <= 0 || [pricing.saleKg, pricing.sideKg].some(v => !Number.isFinite(v) || v < 0))
    throw new Error('Confira o peso líquido e os valores por quilograma.');
  if (meats.some(m => !Number.isInteger(m.count) || m.count <= 0 || !Number.isFinite(m.grams) || m.grams <= 0 || !Number.isFinite(m.costKg) || m.costKg < 0))
    throw new Error('Confira as porções e os custos de carne.');
  const meatG = meatWeight(meats);
  if (meatG > weight) throw new Error('O peso estimado das carnes supera o peso líquido do prato. Corrija o peso ou as porções.');
  const sideG = weight - meatG;
  const sideCost = roundMoney(sideG / 1000 * pricing.sideKg);
  const cutsCost = meatCost(meats);
  const revenue = estimateRevenue(weight,pricing.saleKg);
  const cost = roundMoney(cutsCost + sideCost);
  return { ...pricing, meatG, meatCost: cutsCost, sideG, sideCost, revenue, cost,
    result: roundMoney(revenue - cost), cmv:ratio(cost,revenue), meatShare:ratio(meatG,weight) ?? 0, at, meatInputs:meats.map(m=>({...m})) };
}
export function estimatePlate(plate: Plate, settings: Settings, at: string) {
  if (plate.weight === null) return null;
  if (meatWeight(plate.meats) > plate.weight) throw new Error('O peso estimado das carnes supera o peso líquido do prato. Corrija o peso ou as porções.');
  if (!plate.grillKnown) return null;
  const previous = plate.finance ?? plate.financeHistory.at(-1)?.finance;
  return estimate(plate.weight, plate.meats, {
    saleKg: previous?.saleKg ?? plate.pricing?.saleKg ?? settings.saleKg, sideKg: previous?.sideKg ?? plate.pricing?.sideKg ?? settings.sideKg,
  }, at);
}
