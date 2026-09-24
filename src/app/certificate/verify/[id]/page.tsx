import { permanentRedirect } from "next/navigation";
/** Legacy path printed on earlier certificates. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  permanentRedirect(
    `/verify-certificate/${encodeURIComponent((await params).id)}`,
  );
}
