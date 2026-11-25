import type { Metadata } from 'next';
import { AppShell } from '@/components/shell';
import './globals.css';

export const metadata: Metadata = {
  title: {default:"Bovinu'S Smart Analytics",template:"%s · Bovinu'S Smart Analytics"},
  description:'Inteligência financeira e comportamental para o buffet e a churrasqueira da unidade Augusta.',
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="pt-BR"><body><a className="skip-link" href="#conteudo">Ir para o conteúdo</a><AppShell>{children}</AppShell></body></html>;
}
