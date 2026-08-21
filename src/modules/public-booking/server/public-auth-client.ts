import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const PUBLIC_AUTH_COOKIE = "trimora-public-auth";

export async function createPublicAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: PUBLIC_AUTH_COOKIE,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot write cookies; Route Handlers refresh them.
          }
        },
      },
    },
  );
}
