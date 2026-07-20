'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/core/database/server'

async function getSiteUrl() {
  let siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  try {
    const headersList = await headers();
    const host = headersList.get('x-forwarded-host') || headersList.get('host');
    if (host) {
      const protocol = headersList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
      siteUrl = `${protocol}://${host}`;
    }
  } catch (e) {
    // ignore
  }
  return siteUrl;
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }
  const { error } = await supabase.auth.signInWithPassword(data)
  if (error) {
    if (error.message.includes('Email not confirmed')) {
      redirect(`/login?message=Debes confirmar tu correo antes de iniciar sesión. Por favor revisa tu bandeja de entrada.`);
    }
    redirect('/login?message=Credenciales incorrectas o usuario no encontrado')
  }
  revalidatePath('/', 'layout')
  
  const inviteToken = formData.get('invite_token') as string;
  if (inviteToken) {
    redirect(`/invite?token=${inviteToken}`);
  }
  
  redirect('/dashboard')
}

export async function register(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const name = formData.get('name') as string || 'Mi Barbería';
  
  const siteUrl = await getSiteUrl();
  
  // 1. Generar ID de la organización
  const organizationId = crypto.randomUUID();
  
  // 2. Crear usuario en Supabase con metadata
  const { data, error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: {
        organization_id: organizationId
      }
    }
  })
  
  if (error) {
    redirect('/login?message=Error al registrar: ' + error.message)
  }

  // 3. Si el registro fue exitoso (usuario creado), guardar la organización en la base de datos
  if (data?.user?.id) {
    try {
      const { db } = await import('@/core/database/db');
      const { organizations, organizationMembers } = await import('@/core/database/schema');
      
      const inviteToken = formData.get('invite_token') as string;
      
      if (!inviteToken) {
        // Solo crear organización por defecto si NO es un invitado
        await db.insert(organizations).values({
          id: organizationId,
          name: name
        });
        
        await db.insert(organizationMembers).values({
          organizationId: organizationId,
          userId: data.user.id,
          role: 'ADMIN'
        });
      }
    } catch (dbError) {
      console.error("Error setting up new user/org:", dbError);
    }
  }

  revalidatePath('/', 'layout')
  
  const inviteToken = formData.get('invite_token') as string;
  if (inviteToken) {
    redirect(`/invite?token=${inviteToken}`);
  }
  
  // Se redirige a la pantalla de verificación
  redirect('/verify-email')
}

export async function sendPasswordReset(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string;
  const siteUrl = await getSiteUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error("Error enviando recuperación:", error);
  }
  
  redirect('/login?message=Si el correo existe en nuestro sistema, hemos enviado un enlace de recuperación. Por favor revisa tu bandeja.');
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const newPassword = formData.get('password') as string;

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect('/reset-password?error=Error al cambiar la contraseña. Es posible que tu sesión o enlace haya expirado.');
  }

  // Después de actualizar la contraseña, la sesión se mantiene activa
  redirect('/dashboard');
}

export async function loginWithGoogle(formData?: FormData) {
  const supabase = await createClient()
  
  const siteUrl = await getSiteUrl();
  let redirectUrl = `${siteUrl}/auth/callback`;
  
  if (formData) {
    const inviteToken = formData.get('invite_token') as string;
    if (inviteToken) {
      redirectUrl += `?next=/invite?token=${inviteToken}`;
    }
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
    },
  })
  
  if (error) {
    console.error("Error from Supabase OAuth:", error);
    redirect('/login?message=Error al iniciar sesión con Google')
  }
  
  if (data?.url) {
    redirect(data.url)
  }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function logoutIdle() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login?message=Sesión cerrada por inactividad')
}
