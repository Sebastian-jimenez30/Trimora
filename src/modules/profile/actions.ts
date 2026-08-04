"use server";

import { createClient } from "@/core/database/server";
import { supabaseAdmin } from "@/core/database/admin";
import { requireActor } from "@/core/auth/server/actor";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const fullNameSchema = z.string().trim().min(2).max(120);
const passwordSchema = z.string().min(12).max(128);
const avatarSchema = z
  .custom<File>(
    (value) => typeof File !== "undefined" && value instanceof File,
    "Archivo no válido",
  )
  .refine((file) => file.size > 0 && file.size <= 5_000_000, "La imagen debe pesar máximo 5 MB")
  .refine(
    (file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    "Formato de imagen no permitido",
  );

export async function updateProfileInfo(formData: FormData) {
  const supabase = await createClient();

  await requireActor();
  const parsedName = fullNameSchema.safeParse(formData.get("fullName"));
  if (!parsedName.success) return { success: false, error: parsedName.error.issues[0].message };

  const { error } = await supabase.auth.updateUser({
    data: { full_name: parsedName.data },
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();

  await requireActor();
  const newPassword = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success)
    return { success: false, error: "La contraseña debe tener entre 12 y 128 caracteres" };

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Las contraseñas no coinciden" };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsedPassword.data,
  });

  if (error) return { success: false, error: error.message };

  return { success: true };
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const actor = await requireActor();

  const parsedFile = avatarSchema.safeParse(formData.get("avatar"));
  if (!parsedFile.success) return { success: false, error: parsedFile.error.issues[0].message };
  const file = parsedFile.data;

  const fileExt = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const fileName = `${actor.userId}-${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${fileName}`;

  // Convert File to ArrayBuffer for uploading
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("avatars")
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) return { success: false, error: uploadError.message };

  // Get public URL
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("avatars").getPublicUrl(filePath);

  // Update user metadata
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(actor.userId, {
    user_metadata: { avatar_url: publicUrl, full_name: actor.displayName },
  });

  if (updateError) return { success: false, error: updateError.message };

  // Update local session as well
  await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  });

  revalidatePath("/", "layout");
  return { success: true, avatarUrl: publicUrl };
}
