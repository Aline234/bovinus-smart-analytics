'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { friendlyError } from '@/domain/actions';
import type { State } from '@/domain/model';
import { BrowserRepository, Conflict, type Repository } from '@/storage/repository';
import { SupabaseRepository, supabase, supabaseConfigured } from '@/storage/supabase';

type Notice = {text:string; error?:boolean};
type Context = {
  state:State|null; busy:boolean; notice:Notice|null; loadingError:string; connected:boolean;
  update:(change:(current:State)=>State, message:string)=>Promise<boolean>;
  login:(email:string,password:string)=>Promise<void>; demo:()=>Promise<void>; retry:()=>void;
  show:(text:string,error?:boolean)=>void; dismiss:()=>void;
};
const DataContext = createContext<Context|null>(null);
async function clearAuth() {
  if (!supabaseConfigured) return;
  try { await supabase().auth.signOut({scope:'local'}); }
  catch { /* A sessão local de demonstração continua disponível. */ }
}
export function DataProvider({children}:{children:ReactNode}) {
  const [state,setState] = useState<State|null>(null);
  const [busy,setBusy] = useState(false);
  const [loadingError,setLoadingError] = useState('');
  const [notice,setNotice] = useState<Notice|null>(null);
  const [connected,setConnected] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const current = useRef<State|null>(null);
  const repository = useRef<Repository|null>(null);
  const locked = useRef(false);
  const apply = (value: State) => {current.current=value;setState(value);};
  const show = useCallback((text:string,error = false) => setNotice({text,error}),[]);
  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const remote = supabaseConfigured && Boolean((await supabase().auth.getSession()).data.session);
        const repo = remote ? new SupabaseRepository() : new BrowserRepository();
        const value = await repo.load();
        if (canceled) return;
        setConnected(remote);
        repository.current=repo;
        apply(value);
        setLoadingError('');
      } catch (error) { if (!canceled) setLoadingError(friendlyError(error)); }
    }
    void load();
    return () => { canceled=true; };
  },[attempt]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(()=>setNotice(null),notice.error?7500:4000);
    return () => window.clearTimeout(timer);
  },[notice]);
  async function update(change:(current:State)=>State,message:string) {
    if (!current.current || !repository.current || locked.current) return false;
    locked.current=true;
    setBusy(true);
    try {
      const previous = current.current;
      apply(await repository.current.commit(change(previous),previous));
      show(message);
      return true;
    } catch (error) {
      if (error instanceof Conflict) {
        try { apply(await repository.current.load()); }
        catch { show('Falha ao recarregar os registros. Atualize a página.',true); return false; }
      }
      show(friendlyError(error),true);
      return false;
    } finally { locked.current=false;setBusy(false); }
  }
  async function switchStore(remote:boolean,changeAuth:()=>Promise<void>) {
    if (locked.current) return;
    locked.current=true;
    setBusy(true);
    try {
      await changeAuth();
      const repo = remote ? new SupabaseRepository() : new BrowserRepository();
      const value = await repo.load();
      repository.current=repo;
      apply(value);
      setConnected(remote);
      setLoadingError('');
      show(remote?'Workspace conectado ao Supabase.':'Modo demonstração ativo.');
    } catch (error) {
      if (remote && !connected) await clearAuth();
      show(friendlyError(error),true);
    }
    finally {locked.current=false;setBusy(false);}
  }
  const login = (email:string,password:string) => switchStore(true,async()=>{
    const {error} = await supabase().auth.signInWithPassword({email,password});
    if (error) throw error;
  });
  const demo = () => switchStore(false,clearAuth);
  return <DataContext.Provider value={{state,busy,notice,loadingError,connected,update,login,demo,show,
    retry:()=>setAttempt(v=>v+1),dismiss:()=>setNotice(null)}}>{children}</DataContext.Provider>;
}
export function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error('O provedor de dados deve conter esta tela.');
  return value;
}
