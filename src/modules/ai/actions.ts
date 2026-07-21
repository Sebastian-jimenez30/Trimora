"use server"

import { db } from "@/core/database/db";
import { chatMessages, organizationMembers } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

async function getAuthUserAndOrg() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Buscar miembro de la organización
  const member = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  if (!member[0]) throw new Error("No perteneces a ninguna organización");

  return {
    user,
    organizationId: member[0].organizationId,
    role: member[0].role,
    isAdmin: member[0].role === 'ADMIN'
  };
}

export async function getWebChatHistory() {
  try {
    const { user, organizationId } = await getAuthUserAndOrg();
    const chatKey = `web_${user.id}`;

    const history = await db.query.chatMessages.findMany({
      where: and(
        eq(chatMessages.organizationId, organizationId),
        eq(chatMessages.telegramUserId, chatKey)
      ),
      orderBy: [desc(chatMessages.createdAt)],
      limit: 20
    });

    const messages = history.reverse().map(m => {
      let parsedText = m.content;
      if (m.role === 'assistant') {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed.type === 'tool-response' && parsed.text) {
            parsedText = parsed.text;
          }
        } catch (_) {}
      }
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: parsedText,
        createdAt: m.createdAt,
      };
    });

    return { success: true, data: messages };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}

export async function clearWebChatHistory() {
  try {
    const { user, organizationId } = await getAuthUserAndOrg();
    const chatKey = `web_${user.id}`;

    await db.delete(chatMessages).where(
      and(
        eq(chatMessages.organizationId, organizationId),
        eq(chatMessages.telegramUserId, chatKey)
      )
    );

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
