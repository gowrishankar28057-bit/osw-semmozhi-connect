import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { WorkshopForm } from '@/components/workshop-form';
export default async function Page(){const u=await currentUser();if(u?.role!=='ORGANIZER')redirect('/');return <WorkshopForm speaker={u.name}/>;}
