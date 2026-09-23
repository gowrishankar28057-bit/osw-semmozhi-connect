import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { OrganizerManager } from '@/components/organizers';
export default async function Page(){const u=await currentUser();if(u?.role!=='ADMIN')redirect('/');return <OrganizerManager/>;}
