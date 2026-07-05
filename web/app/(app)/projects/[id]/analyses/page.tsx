import { AnalysesTabs } from "@/components/analyses/AnalysesTabs";

export default async function ProjectAnalysesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AnalysesTabs projectId={id} />;
}
