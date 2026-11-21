import './styles.css';
import './journal.css';
import './editorial.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Kin · Family records', description: 'A private family bloodwork history.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
