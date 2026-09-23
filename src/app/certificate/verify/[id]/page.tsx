import { PublicCertificate } from "@/components/verification";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PublicCertificate id={(await params).id} />;
}
