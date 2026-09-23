import { AuthForm } from "@/components/auth-form";
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <AuthForm register next={(await searchParams).next} />;
}
