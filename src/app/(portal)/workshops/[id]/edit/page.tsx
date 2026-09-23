import { redirect,notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { publicOrganizer } from '@/lib/workshops';
import { WorkshopForm } from '@/components/workshop-form';
import type { Workshop } from '@/lib/types';
export default async function Page({params}:{params:Promise<{id:string}>}){const u=await requireUser();const {id}=await params;const w=await db.workshop.findUnique({where:{id},include:{organizer:{select:publicOrganizer},_count:{select:{registrations:true}}}});if(!w)notFound();if(u.role!=='ORGANIZER'||w.organizerId!==u.id)redirect('/');return <WorkshopForm speaker={u.name} workshop={JSON.parse(JSON.stringify(w)) as Workshop}/>;}
