import { requireActor } from "@/core/auth/server/actor";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const actor = await requireActor();

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-white mb-2">Mi Perfil</h1>
        <p className="text-charcoal text-sm">
          Gestiona tu información personal, foto de perfil y seguridad.
        </p>
      </div>

      <ProfileForm
        initialName={actor.displayName}
        email={actor.email || ""}
        initialAvatarUrl={actor.avatarUrl || ""}
        role={actor.role}
      />
    </div>
  );
}
