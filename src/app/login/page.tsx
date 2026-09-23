import { AuthForm } from "@/components/auth-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <AuthForm next={(await searchParams).next} />;
}
