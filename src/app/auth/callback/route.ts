import { NextResponse } from 'next/server'
import { createClient } from '@/core/database/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && sessionData.session) {
      const user = sessionData.session.user;
      
      // Si el usuario no tiene una organización (e.g. Registro con Google), se la creamos aquí
      if (!user.user_metadata?.organization_id) {
        const organizationId = crypto.randomUUID();
        
        try {
          const { db } = await import('@/core/database/db');
          const { organizations, organizationMembers } = await import('@/core/database/schema');
          
          // Crear organización
          await db.insert(organizations).values({
            id: organizationId,
            name: user.user_metadata?.full_name ? `Barbería de ${user.user_metadata.full_name}` : 'Mi Barbería'
          });

          // Asignar al usuario como ADMIN
          await db.insert(organizationMembers).values({
            organizationId: organizationId,
            userId: user.id,
            role: 'ADMIN'
          });
          
          // Actualizar la metadata del usuario usando el cliente de Admin
          const { createClient: createSupabaseAdmin } = await import('@supabase/supabase-js');
          const adminAuth = createSupabaseAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SECRET_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
          ).auth.admin;
          
          await adminAuth.updateUserById(user.id, {
            user_metadata: { ...user.user_metadata, organization_id: organizationId }
          });
          
          // Actualizar la sesión actual de Supabase
          await supabase.auth.updateUser({
             data: { organization_id: organizationId }
          });
          
        } catch (dbError) {
          console.error("Error auto-creando la organización en el callback:", dbError);
        }
      }
      
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?message=No se pudo iniciar sesión con Google`)
}
