import { TicketDetail } from '@/components/operations';
export const metadata = {title:'Jornada da comanda'};
export default async function TicketPage({params}:{params:Promise<{id:string}>}) { return <TicketDetail ticketId={(await params).id}/>; }