"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/core/database/server";
import { z } from "zod";
import { getAuthenticatedHome } from "@/core/auth/server/destination";

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(12).max(128);
const organizationNameSchema = z.string().trim().min(2).max(120);
const invitationTokenSchema = z.string().uuid();

async function getSiteUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSiteUrl) return new URL(configuredSiteUrl).origin;

  let siteUrl = "http://localhost:3000";
  try {
    const headersList = await headers();
    const host = headersList.get("x-forwarded-host") || headersList.get("host");
    if (host) {
      const protocol =
        headersList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      siteUrl = `${protocol}://${host}`;
    }
  } catch {
    // ignore
  }
  return siteUrl;
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const data = {
    email: emailSchema.parse(formData.get("email")),
    password: z.string().min(1).max(128).parse(formData.get("password")),
  };
  const { data: signInData, error } = await supabase.auth.signInWithPassword(data);
  if (error) {
    if (error.message.includes("Email not confirmed")) {
      redirect(
        `/login?message=Debes confirmar tu correo antes de iniciar sesión. Por favor revisa tu bandeja de entrada.`,
      );
    }
    redirect("/login?message=Credenciales incorrectas o usuario no encontrado");
  }
  if (!signInData.user) redirect("/login?message=No se pudo resolver el usuario autenticado");
  revalidatePath("/", "layout");

  const inviteTokenValue = formData.get("invite_token");
  const inviteToken = inviteTokenValue ? invitationTokenSchema.parse(inviteTokenValue) : null;
  if (inviteToken) {
    redirect(`/invite?token=${inviteToken}`);
  }

  redirect(await getAuthenticatedHome(signInData.user.id));
}

export async function register(formData: FormData) {
  const supabase = await createClient();
  const email = emailSchema.parse(formData.get("email"));
  const password = passwordSchema.parse(formData.get("password"));
  const name = organizationNameSchema.parse(formData.get("name") || "Mi Barbería");

  const siteUrl = await getSiteUrl();

  // 1. Generar ID de la organización
  const organizationId = crypto.randomUUID();

  // 2. Crear usuario en Supabase con metadata
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    redirect("/login?message=Error al registrar: " + error.message);
  }

  // 3. Si el registro fue exitoso (usuario creado), guardar la organización en la base de datos
  if (data?.user?.id) {
    const registeredUserId = data.user.id;
    try {
      const { db } = await import("@/core/database/db");
      const { organizations, organizationMembers } = await import("@/core/database/schema");

      const inviteTokenValue = formData.get("invite_token");
      const inviteToken = inviteTokenValue ? invitationTokenSchema.parse(inviteTokenValue) : null;

      if (!inviteToken) {
        // Solo crear organización por defecto si NO es un invitado
        await db.transaction(async (databaseTransaction) => {
          await databaseTransaction.insert(organizations).values({
            id: organizationId,
            name,
          });
          await databaseTransaction.insert(organizationMembers).values({
            organizationId,
            userId: registeredUserId,
            role: "ADMIN",
          });
        });
      }
    } catch (dbError) {
      console.error("Error setting up new user/org:", dbError);
      const { supabaseAdmin } = await import("@/core/database/admin");
      await supabaseAdmin.auth.admin.deleteUser(registeredUserId);
      redirect("/login?message=No se pudo completar el registro. Intenta nuevamente.");
    }
  }

  revalidatePath("/", "layout");

  const inviteTokenValue = formData.get("invite_token");
  const inviteToken = inviteTokenValue ? invitationTokenSchema.parse(inviteTokenValue) : null;
  if (inviteToken) {
    redirect(`/invite?token=${inviteToken}`);
  }

  // Se redirige a la pantalla de verificación
  redirect("/verify-email");
}

export async function sendPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = emailSchema.parse(formData.get("email"));
  const siteUrl = await getSiteUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error("Error enviando recuperación:", error);
  }

  redirect(
    "/login?message=Si el correo existe en nuestro sistema, hemos enviado un enlace de recuperación. Por favor revisa tu bandeja.",
  );
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();
  const newPassword = passwordSchema.parse(formData.get("password"));

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect(
      "/reset-password?error=Error al cambiar la contraseña. Es posible que tu sesión o enlace haya expirado.",
    );
  }

  // Después de actualizar la contraseña, la sesión se mantiene activa
  redirect("/dashboard");
}

export async function loginWithGoogle(formData?: FormData) {
  const supabase = await createClient();

  const siteUrl = await getSiteUrl();
  let redirectUrl = `${siteUrl}/auth/callback`;

  if (formData) {
    const inviteTokenValue = formData.get("invite_token");
    const inviteToken = inviteTokenValue ? invitationTokenSchema.parse(inviteTokenValue) : null;
    if (inviteToken) {
      redirectUrl += `?next=/invite?token=${inviteToken}`;
    }
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
    },
  });

  if (error) {
    console.error("Error from Supabase OAuth:", error);
    redirect("/login?message=Error al iniciar sesión con Google");
  }

  if (data?.url) {
    redirect(data.url);
  }
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function logoutIdle() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?message=Sesión cerrada por inactividad");
}
