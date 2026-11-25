import { Dashboard } from '@/components/dashboard';
export const metadata = {title:'Visão geral'};
export default async function DashboardPage({searchParams}:{searchParams:Promise<{comanda?:string}>}) {
  const comanda=(await searchParams).comanda;
  return <Dashboard key={comanda??''} initialTicket={typeof comanda==='string'&&/^\d{1,8}$/.test(comanda)?comanda:''}/>;
}