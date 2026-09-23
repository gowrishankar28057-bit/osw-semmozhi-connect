import { requireUser } from '@/lib/auth';
import { WorkshopList } from '@/components/workshop-list';
export default async function Page(){const u=await requireUser();return <WorkshopList role={u.role}/>;}
