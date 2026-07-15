'use server'

import { createClient } from '@/core/database/server'
import { revalidatePath } from 'next/cache'

export async function updateProfileInfo(formData: FormData) {
  const supabase = await createClient()
  
  const fullName = formData.get('fullName') as string;
  if (!fullName) return { success: false, error: "El nombre es obligatorio" };

  const { error } = await supabase.auth.updateUser({
    data: { full_name: fullName }
  })

  if (error) return { success: false, error: error.message }
  
  revalidatePath('/', 'layout')
  return { success: true }
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  
  const newPassword = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "La contraseña debe tener al menos 6 caracteres" };
  }
  
  if (newPassword !== confirmPassword) {
    return { success: false, error: "Las contraseñas no coinciden" };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) return { success: false, error: error.message }
  
  return { success: true }
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return { success: false, error: "No autorizado" }

  const file = formData.get('avatar') as File
  if (!file || file.size === 0) return { success: false, error: "No se seleccionó ningún archivo" }

  // Usar admin para subir sin RLS
  const { createClient: createSupabaseAdmin } = await import('@supabase/supabase-js')
  const adminAuth = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const fileExt = file.name.split('.').pop()
  const fileName = `${user.id}-${Math.random()}.${fileExt}`
  const filePath = `${fileName}`

  // Convert File to ArrayBuffer for uploading
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError, data: uploadData } = await adminAuth.storage
    .from('avatars')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true
    })

  if (uploadError) return { success: false, error: uploadError.message }

  // Get public URL
  const { data: { publicUrl } } = adminAuth.storage.from('avatars').getPublicUrl(filePath)

  // Update user metadata
  const { error: updateError } = await adminAuth.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, avatar_url: publicUrl }
  })
  
  if (updateError) return { success: false, error: updateError.message }
  
  // Update local session as well
  await supabase.auth.updateUser({
    data: { avatar_url: publicUrl }
  })

  revalidatePath('/', 'layout')
  return { success: true, avatarUrl: publicUrl }
}
