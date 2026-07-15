import { createClient } from "@/core/database/server";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const metadataName = user.user_metadata?.full_name || "";
  const emailName = user.email?.split("@")[0] || "Administrador";
  const fullName = metadataName || emailName;
  const avatarUrl = user.user_metadata?.avatar_url || "";
  
  // Extraer el rol (usualmente en user_metadata o podríamos buscarlo, pero dejaremos un default visual)
  const role = user.user_metadata?.role || "Usuario";

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-white mb-2">Mi Perfil</h1>
        <p className="text-charcoal text-sm">Gestiona tu información personal, foto de perfil y seguridad.</p>
      </div>

      <ProfileForm 
        initialName={fullName} 
        email={user.email || ""} 
        initialAvatarUrl={avatarUrl}
        role={role}
      />
    </div>
  );
}
