import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/require-user";
import { db, schema } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { ProjectTabs } from "@/components/projects/ProjectTabs";

/** Project shell (spec §2.3): header + tabbed nav shared by all project pages. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, id), eq(schema.projects.userId, user.id)),
    )
    .limit(1);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All projects
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{project.name}</h1>
        <Badge variant="accent">{project.status}</Badge>
      </div>

      <ProjectTabs projectId={project.id} />

      {children}
    </div>
  );
}
