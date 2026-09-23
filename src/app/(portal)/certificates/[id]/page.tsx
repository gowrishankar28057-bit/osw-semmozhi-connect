import { CertificateView } from "@/components/account-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CertificateView id={(await params).id} />;
}
