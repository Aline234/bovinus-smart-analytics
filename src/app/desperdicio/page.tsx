import { Operation } from '@/components/operations';
export const metadata = {title:'Desperdício'};
export default async function WastePage({searchParams}:{searchParams:Promise<{prato?:string}>}) {const {prato}=await searchParams;return <Operation key={prato??''} type="waste" initialId={typeof prato==='string'?prato:''}/>;}