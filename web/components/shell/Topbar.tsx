import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";
import { APP_VERSION } from "@/lib/version";
import { Badge } from "@/components/ui/badge";
import { EngineStatus } from "@/components/EngineStatus";

export function Topbar({ userEmail }: { userEmail?: string | null }) {
  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-5">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          No project selected
        </span>
      </div>
      <div className="flex items-center gap-4">
        <EngineStatus />
        {/* App version is part of provenance (spec §2.3, §9). */}
        <Badge variant="outline" className="font-mono">
          v{APP_VERSION}
        </Badge>
        {userEmail && (
          <span className="text-sm text-muted-foreground">{userEmail}</span>
        )}
        <form action={doSignOut}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
