import { StationFinder } from "@/components/stations/StationFinder";

export default async function ProjectStationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StationFinder projectId={id} />;
}
