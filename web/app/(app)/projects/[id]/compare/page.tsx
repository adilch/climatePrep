import { CompareTab } from "@/components/compare/CompareTab";

export default async function ProjectComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompareTab projectId={id} />;
}
