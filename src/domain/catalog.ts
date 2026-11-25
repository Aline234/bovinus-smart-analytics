import type { Category, Food, Settings, State } from './model';
export const categories: Category[] = [
  {id:'bases',name:'Grãos e bases'}, {id:'quentes',name:'Pratos quentes'},
  {id:'frescos',name:'Saladas e legumes'}, {id:'carne',name:'Churrasqueira'}, {id:'outros',name:'Outros'},
];
const sides: [string, string, string][] = [
  ['arroz','Arroz branco','bases'], ['integral','Arroz integral','bases'], ['feijao','Feijão','bases'],
  ['feijoada','Feijoada','quentes'], ['lasanha','Lasanha','quentes'], ['macarrao','Macarrão','quentes'],
  ['pure','Purê de batata','quentes'], ['fritas','Batata frita','quentes'], ['farofa','Farofa','bases'],
  ['salada','Salada','frescos'], ['legumes','Legumes','frescos'], ['mandioca','Mandioca','quentes'],
  ['ovo','Ovo','quentes'], ['outros','Outros','outros'],
];
const cuts: [string, string, number, number][] = [
  ['picanha','Picanha',60,65], ['alcatra','Alcatra',60,42], ['fraldinha','Fraldinha',60,39],
  ['contrafile','Contrafilé',65,48], ['costela','Costela',80,38], ['maminha','Maminha',65,45],
  ['cupim','Cupim',70,44], ['frango','Frango',80,19], ['linguica','Linguiça',70,22], ['coracao','Coração de frango',50,28],
];
export const foods: Food[] = [
  ...sides.map(([id,name,categoryId]): Food => ({id,name,categoryId,kind:'buffet',active:true,grams:{pequena:0,media:0,grande:0},costKg:0})),
  ...cuts.map(([id,name,g,costKg]): Food => ({id,name,categoryId:'carne',kind:'meat',active:true,grams:{pequena:Math.round(g*.65),media:g,grande:Math.round(g*1.45)},costKg})),
];
export const defaultSettings: Settings = {saleKg:89.9,sideKg:12,popularity:30,waste:25,minSample:30,minCoverage:60,cmvAlert:35};
export const initialState = (simulated: boolean): State => ({
  version:1, simulated, revision:0, categories:structuredClone(categories), foods:structuredClone(foods),
  menus:{}, settings:{...defaultSettings}, tickets:[], plates:[], discards:[],
});
