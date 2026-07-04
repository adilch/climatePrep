import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/require-user";
import { db, schema } from "@/lib/db/client";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProjectOverviewPage({
  params,
}: {
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
    <div className="space-y-5">
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
        Start in <span className="font-medium text-foreground">Stations</span>:
        drop a pin on the dam site, review ranked candidate stations and their
        data availability, then pull data in the{" "}
        <span className="font-medium text-foreground">Data</span> tab.
      </p>
    </div>
  );
}
