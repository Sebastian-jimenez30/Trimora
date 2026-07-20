import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase con Service Role Key
// ADVERTENCIA: Este cliente NUNCA debe usarse en el cliente (navegador).
// Solo puede usarse en Server Actions o rutas de API del lado del servidor.
// Este cliente se salta el Row Level Security (RLS) y tiene permisos absolutos.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SECRET_KEY || 'dummy_key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
