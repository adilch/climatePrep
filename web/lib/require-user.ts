import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Guarantees an authenticated user in a Server Component. Pages must guard
 * themselves rather than rely on the shell layout: in the App Router a layout
 * and its page render in parallel, so the layout's redirect does not prevent
 * the page body from executing first.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user;
}
