'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, BarChart3, ChartNoAxesCombined, Check, ChevronDown, CircleAlert, ClipboardList, FileDown, FlaskConical, Flame, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Settings2, Trash2, Utensils, X } from 'lucide-react';
import { DataProvider,useData } from './data-provider';
import { cn, DataGate } from './ui';
const navigation = [
  {name:'GERENCIAL',items:[{href:'/dashboard',title:'Visão geral',icon:LayoutDashboard},{href:'/analises',title:'Análises',icon:ChartNoAxesCombined},{href:'/relatorios',title:'Relatórios',icon:FileDown}]},
  {name:'OPERAÇÃO',items:[{href:'/comandas',title:'Comandas',icon:ClipboardList},{href:'/churrasqueira',title:'Churrasqueira',icon:Flame},{href:'/buffet',title:'Buffet e pesagem',icon:Utensils},{href:'/desperdicio',title:'Desperdício',icon:Trash2}]},
  {name:'SISTEMA',items:[{href:'/configuracoes',title:'Configurações',icon:Settings2},{href:'/demonstracao',title:'Demonstração',icon:FlaskConical}]},
];
function Layout({children}:{children:ReactNode}) {
  const path=usePathname();
  const [collapsed,setCollapsed]=useState(false);
  const [drawer,setDrawer]=useState(false);
  const mobileToggle=useRef<HTMLButtonElement>(null);
  const sidebar=useRef<HTMLElement>(null);
  useEffect(()=>{
    if (!drawer) return;
    const toggle=mobileToggle.current;
    sidebar.current?.querySelector('a')?.focus();
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape') setDrawer(false);
    };
    const desktop=window.matchMedia('(min-width: 791px)');
    const resize=()=>{if(desktop.matches)setDrawer(false);};
    window.addEventListener('keydown',escape);
    desktop.addEventListener('change',resize);
    return ()=>{
      window.removeEventListener('keydown',escape);
      desktop.removeEventListener('change',resize);
      toggle?.focus();
    };
  },[drawer]);
  const {notice,dismiss,connected}=useData();
  const current=navigation.flatMap(g=>g.items).find(item=>path.startsWith(item.href))?.title ?? 'Visão geral';
  return <div className={cn('shell',collapsed&&'collapsed',drawer&&'drawer')}>
    {drawer&&<button className="scrim" aria-label="Fechar menu" onClick={()=>setDrawer(false)}/>}
    <aside ref={sidebar} className="sidebar" aria-label="Navegação do sistema">
      <Link href="/" className="brand" onClick={()=>setDrawer(false)} aria-label="Bovinu’S Smart Analytics, início">
        <span className="brand-mark"><Flame size={23} strokeWidth={2.1}/></span><span className="brand-word"><strong>Bovinu&apos;S</strong><small>SMART ANALYTICS</small></span>
      </Link>
      <div className="sidebar-divider"/>
      <nav>{navigation.map(group=><div className="nav-group" key={group.name}><p>{group.name}</p>{group.items.map(({href,title,icon:Icon})=>{
        const active=href==='/dashboard'?path==='/'||path===href:path===href||path.startsWith(href+'/');
        return <Link href={href} key={href} title={title} aria-current={active?'page':undefined} className={cn('nav-link',active&&'active')} onClick={()=>setDrawer(false)}><Icon size={17}/><span>{title}</span></Link>;
      })}</div>)}</nav>
      <div className="sidebar-bottom"><div className="unit-avatar"><Utensils size={16}/></div><div className="unit"><strong>Unidade Augusta</strong><small>São Paulo · SP</small></div></div>
    </aside>
    <div className="shell-body" inert={drawer}>
      <header className="topbar">
        <div className="breadcrumb">
          <button type="button" className="layout-toggle desktop-toggle" onClick={()=>setCollapsed(v=>!v)} aria-label={collapsed?'Expandir menu':'Recolher menu'}>{collapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button>
          <button type="button" ref={mobileToggle} className="layout-toggle mobile-toggle" onClick={()=>setDrawer(v=>!v)} aria-expanded={drawer} aria-label="Abrir menu"><Menu size={21}/></button>
          <span className="crumb-root"><Activity size={15}/> Gestão do almoço</span><span className="crumb-slash">/</span><strong>{current}</strong>
        </div>
        <Link className="environment" href={connected?'/configuracoes':'/demonstracao'}><span className="status-dot"/>{connected?'Supabase':'Modo demonstração'}<ChevronDown size={13}/></Link>
      </header>
      <main className="main-content" id="conteudo"><DataGate>{children}</DataGate></main>
      <footer className="footer"><span><BarChart3 size={14}/> Bovinu&apos;S Smart Analytics</span><span>Unidade Augusta</span></footer>
    </div>
    {notice&&<div className={cn('toast',notice.error&&'toast-error')} role={notice.error?'alert':'status'}>{notice.error?<CircleAlert size={19}/>:<Check size={19}/>}<span>{notice.text}</span><button aria-label="Dispensar mensagem" onClick={dismiss}><X size={17}/></button></div>}
  </div>;
}
export function AppShell({children}:{children:ReactNode}) {return <DataProvider><Layout>{children}</Layout></DataProvider>;}
