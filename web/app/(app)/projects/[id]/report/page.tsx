import { ReportTab } from "@/components/report/ReportTab";

export default async function ProjectReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportTab projectId={id} />;
}
