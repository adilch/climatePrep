import { DataAcquisition } from "@/components/data/DataAcquisition";

export default async function ProjectDataPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DataAcquisition projectId={id} />;
}
