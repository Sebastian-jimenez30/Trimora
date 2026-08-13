import { db } from "@/core/database/db";
import { invitations, organizations } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptInvitation } from "@/modules/invitations/server/actions";
import { invitationTokenSchema } from "@/modules/invitations/domain/schemas";

export default async function InvitePage(props: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams;
  const parsedToken = invitationTokenSchema.safeParse(searchParams.token);
  const token = parsedToken.success ? parsedToken.data : null;

  if (!token) {
    return (
      <div className="min-h-screen bg-pitch flex items-center justify-center p-4 font-sans text-white">
        <div className="bg-gray-900 border border-red-900 p-8 rounded-xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Enlace Inválido</h2>
          <p className="text-gray-400 mb-6">
            El enlace de invitación no es válido o está incompleto.
          </p>
          <Link
            href="/"
            className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg text-white font-medium transition"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  // 1. Buscar la invitación
  const [invitation] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      orgId: organizations.id,
      orgName: organizations.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
    .where(eq(invitations.token, token));

  if (!invitation) {
    return (
      <div className="min-h-screen bg-pitch flex items-center justify-center p-4 font-sans text-white">
        <div className="bg-gray-900 border border-red-900 p-8 rounded-xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Invitación No Encontrada</h2>
          <p className="text-gray-400 mb-6">
            Esta invitación no existe. Pudo haber sido cancelada por el administrador.
          </p>
          <Link
            href="/"
            className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg text-white font-medium transition"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (invitation.status === "ACCEPTED") {
    return (
      <div className="min-h-screen bg-pitch flex items-center justify-center p-4 font-sans text-white">
        <div className="bg-gray-900 border border-blue-900 p-8 rounded-xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-blue-400 mb-4">Invitación Ya Aceptada</h2>
          <p className="text-gray-400 mb-6">Esta invitación ya ha sido utilizada anteriormente.</p>
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg text-white font-medium transition"
          >
            Ir a Iniciar Sesión
          </Link>
        </div>
      </div>
    );
  }

  // 2. Comprobar si el usuario actual está logueado
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si no está logueado, le pedimos que se registre o inicie sesión
  if (!user) {
    return (
      <div className="min-h-screen bg-pitch flex items-center justify-center p-4 font-sans text-white">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-white mb-2">¡Hola!</h2>
          <p className="text-gray-400 mb-6">
            Has sido invitado para unirte a <strong>{invitation.orgName}</strong> como{" "}
            <strong>{invitation.role}</strong>.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Para aceptar la invitación, necesitas iniciar sesión o registrar una cuenta con el
            correo: <strong>{invitation.email}</strong>
          </p>

          <div className="flex flex-col gap-4">
            <Link
              href={`/login?invite_token=${token}`}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg text-white font-medium transition"
            >
              Iniciar Sesión (o Entrar con Google)
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Si está logueado pero el correo NO coincide con la invitación
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    async function handleLogout() {
      "use server";
      const supabaseServer = await createClient();
      await supabaseServer.auth.signOut();
      redirect(`/login?invite_token=${token}`);
    }

    return (
      <div className="min-h-screen bg-pitch flex items-center justify-center p-4 font-sans text-white">
        <div className="bg-gray-900 border border-yellow-900 p-8 rounded-xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-yellow-500 mb-4">Correo Incorrecto</h2>
          <p className="text-gray-400 mb-4">
            Estás conectado como <strong>{user.email}</strong>, pero esta invitación es para{" "}
            <strong>{invitation.email}</strong>.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Cierra sesión e ingresa con la cuenta correcta.
          </p>

          <form action={handleLogout}>
            <button
              type="submit"
              className="bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded-lg text-white font-medium transition w-full"
            >
              Cerrar Sesión Actual
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pitch flex items-center justify-center p-4 font-sans text-white">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-xl max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Aceptar invitación</h2>
        <p className="text-gray-400 mb-6">
          Te unirás a <strong>{invitation.orgName}</strong> como <strong>{invitation.role}</strong>.
        </p>
        <form action={acceptInvitation}>
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg text-white font-medium transition w-full"
          >
            Confirmar y entrar
          </button>
        </form>
      </div>
    </div>
  );
}
