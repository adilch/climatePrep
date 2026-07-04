import { PfaTab } from "@/components/pfa/PfaTab";

export default async function ProjectAnalysesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PfaTab projectId={id} />;
}
