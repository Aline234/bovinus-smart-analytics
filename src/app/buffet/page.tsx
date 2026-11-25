import { Operation } from '@/components/operations';
export const metadata = {title:'Buffet e pesagem'};
export default async function BuffetPage({searchParams}:{searchParams:Promise<{prato?:string}>}) {const {prato}=await searchParams;return <Operation key={prato??''} type="buffet" initialId={typeof prato==='string'?prato:''}/>;}