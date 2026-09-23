import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Dashboard } from '@/components/dashboard';
export default async function Page(){const u=await currentUser();if(u?.role!=='ADMIN')redirect('/');return <Dashboard/>;}
