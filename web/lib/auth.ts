import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

/**
 * Auth.js v5 (spec §3.4). M0 uses a dev Credentials provider validated against
 * env vars so login works with no OAuth secrets. Sessions are JWT (required for
 * Credentials). The signed-in user maps to a real row in the `users` table so
 * projects link correctly and provenance stays in one store. OAuth/email
 * providers slot in behind this same session model later.
 */

const DEV_EMAIL = process.env.AUTH_DEV_EMAIL ?? "dev@climateprep.local";
const DEV_PASSWORD = process.env.AUTH_DEV_PASSWORD ?? "climateprep";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Local dev runs on localhost without AUTH_URL; trust the host to avoid
  // UntrustedHost errors. Vercel sets this automatically in production.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      name: "Dev credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase();
        const password = String(creds?.password ?? "");
        if (email !== DEV_EMAIL.toLowerCase() || password !== DEV_PASSWORD) {
          return null;
        }
        const rows = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, DEV_EMAIL))
          .limit(1);
        const user = rows[0];
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
});
