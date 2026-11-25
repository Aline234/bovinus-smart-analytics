import { cloneElement, useId, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react';
import { useData } from './data-provider';

export const cn = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));
const buttonVariants = cva('button',{variants:{variant:{primary:'button-primary',outline:'button-outline',ghost:'button-ghost',danger:'button-danger'},size:{default:'',sm:'button-sm',icon:'button-icon'}},defaultVariants:{variant:'primary',size:'default'}});
export function Button({className,variant,size,type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({variant,size}),className)} {...props}/>;
}
export function PageHeading({title,description,actions}:{title:string;description:string;actions?:ReactNode}) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions&&<div className="heading-actions">{actions}</div>}</div>;
}
export function Card({title,subtitle,action,children,className}:{title?:string;subtitle?:string;action?:ReactNode;children:ReactNode;className?:string}) {
  return <section className={cn('card',className)}>{(title||action)&&<header className="card-heading"><div>{title&&<h2>{title}</h2>}{subtitle&&<p>{subtitle}</p>}</div>{action}</header>}{children}</section>;
}
export function Field({label,children}:{label:string;children:ReactElement<{id?:string}>}) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{cloneElement(children,{id})}</div>;
}
export function Empty({children}:{children:ReactNode}) {return <div className="empty"><Inbox size={23}/><p>{children}</p></div>;}
export function DataGate({children}:{children:ReactNode}) {
  const {state,loadingError,retry,demo,busy}=useData();
  if (loadingError) return <div className="empty" role="alert"><CircleAlert/><p>{loadingError}</p><div className="row"><Button variant="outline" onClick={retry} disabled={busy}>Tentar novamente</Button><Button variant="outline" onClick={()=>void demo()} disabled={busy}>Abrir demonstração local</Button></div></div>;
  if (!state) return <div className="loading" role="status"><span className="loading-mark"><LoaderCircle size={22}/></span> Carregando registros…</div>;
  return children;
}
