import { auth } from "@/lib/auth";
import { APP_VERSION } from "@/lib/version";
import { Card, CardContent } from "@/components/ui/card";

export default async function SettingsPage() {
  const session = await auth();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <Card>
        <CardContent className="space-y-2 pt-5 font-mono text-xs text-muted-foreground">
          <div>
            <span>signed in as: </span>
            <span className="text-foreground">{session?.user?.email}</span>
          </div>
          <div>
            <span>app version: </span>
            <span className="text-foreground">v{APP_VERSION}</span>
          </div>
          <div>
            <span>units: </span>
            <span className="text-foreground">SI (mm, m, m/s, m³/s)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
