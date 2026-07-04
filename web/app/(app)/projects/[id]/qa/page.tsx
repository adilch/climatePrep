import { QcTab } from "@/components/qc/QcTab";

export default async function ProjectQaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QcTab projectId={id} />;
}
