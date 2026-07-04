import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/require-user";
import { db, schema } from "@/lib/db/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Project shell tabs (spec §2.3). Wired up module-by-module through M1–M4.
const TABS = [
  "Overview",
  "Stations",
  "Data",
  "QA/QC",
  "Analyses",
  "Compare",
  "Report",
];

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const userId = user.id;

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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

      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab, i) => (
          <span
            key={tab}
            className={
              i === 0
                ? "border-b-2 border-accent px-3 py-2 text-sm font-medium text-accent"
                : "cursor-not-allowed px-3 py-2 text-sm text-muted-foreground/50"
            }
            title={i === 0 ? undefined : "Available in a later milestone"}
          >
            {tab}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5 text-sm">
          {project.description ? (
            <p>{project.description}</p>
          ) : (
            <p className="text-muted-foreground">No description.</p>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
            <div>
              <dt className="inline">status: </dt>
              <dd className="inline text-foreground">{project.status}</dd>
            </div>
            <div>
              <dt className="inline">created with: </dt>
              <dd className="inline text-foreground">
                app v{project.appVersionCreated}
              </dd>
            </div>
            <div>
              <dt className="inline">id: </dt>
              <dd className="inline text-foreground">{project.id}</dd>
            </div>
            <div>
              <dt className="inline">created: </dt>
              <dd className="inline text-foreground">
                {new Date(project.createdAt).toISOString().slice(0, 10)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Station finder, data acquisition, QA/QC, PFA/IDF, and reporting arrive in
        milestones M1–M4.
      </p>
    </div>
  );
}
