import { Operation } from '@/components/operations';
export const metadata = {title:'Churrasqueira'};
export default async function GrillPage({searchParams}:{searchParams:Promise<{prato?:string}>}) {const {prato}=await searchParams;return <Operation key={prato??''} type="grill" initialId={typeof prato==='string'?prato:''}/>;}