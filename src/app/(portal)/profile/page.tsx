import { requireUser } from '@/lib/auth';
import { Profile } from '@/components/account-pages';
export default async function Page(){return <Profile user={await requireUser()}/>;}
