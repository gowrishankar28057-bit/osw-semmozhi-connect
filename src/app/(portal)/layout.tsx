import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
export default async function PortalLayout({children}:{children:React.ReactNode}){const user=await currentUser();if(!user)redirect('/login');return <Shell user={user}>{children}</Shell>;}
