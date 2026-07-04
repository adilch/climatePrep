import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FlaskConical } from "lucide-react";
import { requireUser } from "@/lib/require-user";
import { db, schema } from "@/lib/db/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewProjectForm } from "@/components/projects/NewProjectForm";
import { DeleteProjectButton } from "@/components/projects/DeleteProjectButton";

export default async function DashboardPage() {
  const user = await requireUser();
  const userId = user.id;

  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            A project ties a dam, its consequence classification, site, and
            analyses into one reproducible unit.
          </p>
        </div>
        <Link
          href="/analyze"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <FlaskConical className="h-4 w-4" />
          New standalone analysis
        </Link>
      </div>

      <Card>
        <CardContent className="pt-5">
          <NewProjectForm />
        </CardContent>
      </Card>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No projects yet. Create one above, or start a standalone analysis.
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Card className="transition-colors hover:border-accent/40">
                <CardContent className="flex items-center justify-between py-4">
                  <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      <Badge variant="outline">{p.status}</Badge>
                    </div>
                    {p.description && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {p.description}
                      </p>
                    )}
                  </Link>
                  <div className="flex items-center gap-3 pl-4">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(p.updatedAt).toISOString().slice(0, 10)}
                    </span>
                    <DeleteProjectButton projectId={p.id} />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
