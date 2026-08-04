"use server";

import { db } from "@/core/database/db";
import { invitations, organizationMembers } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { invitationRoleSchema, invitationTokenSchema } from "../domain/schemas";

export async function acceptInvitation(formData: FormData) {
  const token = invitationTokenSchema.parse(formData.get("token"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect(`/login?invite_token=${token}`);

  await db.transaction(async (databaseTransaction) => {
    const [invitation] = await databaseTransaction
      .select()
      .from(invitations)
      .where(and(eq(invitations.token, token), eq(invitations.status, "PENDING")))
      .for("update");

    if (!invitation) throw new Error("La invitación no existe o ya fue utilizada");
    if (invitation.email.toLowerCase() !== user.email!.toLowerCase()) {
      throw new Error("La invitación pertenece a otro correo");
    }

    const role = invitationRoleSchema.parse(invitation.role);
    const [existingMembership] = await databaseTransaction
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, invitation.organizationId),
          eq(organizationMembers.userId, user.id),
        ),
      )
      .limit(1);

    if (!existingMembership) {
      await databaseTransaction.insert(organizationMembers).values({
        organizationId: invitation.organizationId,
        userId: user.id,
        role,
      });
    }

    await databaseTransaction
      .update(invitations)
      .set({ status: "ACCEPTED" })
      .where(and(eq(invitations.id, invitation.id), eq(invitations.status, "PENDING")));
  });

  redirect("/dashboard");
}
