import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { organizationMembers } from '../src/core/database/schema';
import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';

dotenv.config({ path: '.env' });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function patch() {
  console.log('Obteniendo usuario a@gmail.com...');
  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
  const user = users.find(u => u.email === 'a@gmail.com');

  if (!user) {
    console.error('Usuario no encontrado');
    process.exit(1);
  }

  console.log(`Usuario encontrado: ${user.id}`);
  
  const member = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  
  if (member.length === 0) {
    console.error('El usuario no tiene un registro en organization_members');
    process.exit(1);
  }

  const orgId = member[0].organizationId;
  console.log(`Encontrada Organización ID: ${orgId}. Actualizando metadata...`);

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { organization_id: orgId }
  });

  if (error) {
    console.error('Error al actualizar metadata:', error);
  } else {
    console.log('Metadata actualizada exitosamente. El usuario ya puede iniciar sesión correctamente.');
  }

  process.exit(0);
}

patch();
