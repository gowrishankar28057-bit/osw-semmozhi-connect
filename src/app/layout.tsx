import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'OSW · Semmozhi Connect',description:'Tamil heritage, workshops and verified learning. Central Institute of Classical Tamil.'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
