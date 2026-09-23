import { requireUser } from '@/lib/auth';
import { isDemo } from '@/lib/workshops';
import { WorkshopDetail } from '@/components/workshop-detail';
export default async function Page({params}:{params:Promise<{id:string}>}){const u=await requireUser();const {id}=await params;return <WorkshopDetail id={id} user={u} demoMode={isDemo()}/>;}
