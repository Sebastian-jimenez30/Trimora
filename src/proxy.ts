import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rutas públicas que no requieren autenticación
  const isPublicRoute = 
    request.nextUrl.pathname === '/' || 
    request.nextUrl.pathname.startsWith('/login') || 
    request.nextUrl.pathname.startsWith('/auth/callback') ||
    request.nextUrl.pathname.startsWith('/verify-email') ||
    request.nextUrl.pathname.startsWith('/invite') ||
    request.nextUrl.pathname.startsWith('/api/webhooks');

  // Proteger todas las demás rutas (si no hay usuario y no es ruta pública)
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Lógica Super Admin
  const isSuperAdmin = user?.email === 'trimoraerp@gmail.com';

  if (isSuperAdmin) {
    const isLoginOrRoot = request.nextUrl.pathname === '/' || request.nextUrl.pathname.startsWith('/login');
    const isNormalApp = request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/pos') || request.nextUrl.pathname.startsWith('/agenda') || request.nextUrl.pathname.startsWith('/clientes') || request.nextUrl.pathname.startsWith('/inventario');
    
    if (isLoginOrRoot || isNormalApp) {
      const url = request.nextUrl.clone();
      url.pathname = '/superadmin';
      return NextResponse.redirect(url);
    }
  }

  // Si NO es superadmin pero intenta entrar a /superadmin, bloquear
  if (user && !isSuperAdmin && request.nextUrl.pathname.startsWith('/superadmin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Si ya hay usuario y quiere ir al login, redirigir al dashboard
  if (user && !isSuperAdmin && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
