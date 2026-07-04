"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, FlaskConical, Database, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Projects", icon: FolderOpen },
  { href: "/analyze", label: "Standalone", icon: FlaskConical },
  { href: "/reference", label: "Reference data", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="h-6 w-6 rounded bg-accent" aria-hidden />
        <span className="font-semibold tracking-tight">climatePrep</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
