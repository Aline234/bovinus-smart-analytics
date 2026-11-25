import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Conflict, type Repository } from './repository';
import { initialState } from '../domain/catalog';
import type { State } from '../domain/model';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabaseConfigured = Boolean(url && key);
let client: SupabaseClient | undefined;
export function supabase() {
  if (!url || !key) throw new Error('Supabase não configurado.');
  return client ??= createClient(url,key);
}
const changed = <T extends {id:string}>(next: T[], prev: T[]) => {
  const old = new Map(prev.map(item=>[item.id,item]));
  return next.filter(item=>old.get(item.id)!==item);
};
export function stateChanges(next: State, prev: State) {
  return {
    categories:changed(next.categories,prev.categories),foods:changed(next.foods,prev.foods),
    menus:Object.fromEntries(Object.entries(next.menus).filter(([d,menu])=>prev.menus[d]!==menu)),
    settings:next.settings===prev.settings ? null : next.settings,
    tickets:changed(next.tickets,prev.tickets),plates:changed(next.plates,prev.plates),
    discards:changed(next.discards,prev.discards),
  };
}
export class SupabaseRepository implements Repository {
  constructor(private client = supabase()) {}
  async load(): Promise<State> {
    const {data,error} = await this.client.rpc('bovinus_load');
    if (error) throw new Error(error.message);
    if (data) return data as State;
    const empty = initialState(false);
    const baseline = {...empty,foods:[],categories:[],settings:{...empty.settings}};
    try { return await this.commit(empty,baseline); }
    catch (error) {
      if (!(error instanceof Conflict)) throw error;
      const {data,error:readError} = await this.client.rpc('bovinus_load');
      if (readError || !data) throw readError ? new Error(readError.message) : error;
      return data as State;
    }
  }
  async commit(next: State, previous: State): Promise<State> {
    const {data,error} = await this.client.rpc('bovinus_commit',{expected:previous.revision,p:stateChanges(next,previous)});
    if (error?.code === '40001') throw new Conflict();
    if (error) throw new Error(error.message);
    return {...next,revision:Number(data)};
  }
}
