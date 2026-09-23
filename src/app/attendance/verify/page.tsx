import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { AttendanceVerification } from '@/components/verification';
export default async function Page({searchParams}:{searchParams:Promise<{t?:string}>}){const {t=''}=await searchParams;const u=await currentUser();if(!u)redirect(`/login?next=${encodeURIComponent(`/attendance/verify?t=${encodeURIComponent(t)}`)}`);return <AttendanceVerification token={t}/>;}
