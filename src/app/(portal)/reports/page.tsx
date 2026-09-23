import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Reports } from '@/components/account-pages';
export default async function Page(){if((await currentUser())?.role!=='ADMIN')redirect('/');return <Reports/>;}
