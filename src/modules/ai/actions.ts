"use server";

import { db } from "@/core/database/db";
import { chatMessages } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getErrorMessage } from "@/core/errors";

export async function getWebChatHistory() {
  try {
    const { userId, organizationId } = await requireActor();
    const chatKey = `web_${userId}`;

    const history = await db.query.chatMessages.findMany({
      where: and(
        eq(chatMessages.organizationId, organizationId),
        eq(chatMessages.telegramUserId, chatKey),
      ),
      orderBy: [desc(chatMessages.createdAt)],
      limit: 20,
    });

    const messages = history.reverse().map((m) => {
      let parsedText = m.content;
      if (m.role === "assistant") {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed.type === "tool-response" && parsed.text) {
            parsedText = parsed.text;
          }
        } catch {}
      }
      return {
        id: m.id,
        role: m.role as "user" | "assistant",
        content: parsedText,
        createdAt: m.createdAt,
      };
    });

    return { success: true, data: messages };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error), data: [] };
  }
}

export async function clearWebChatHistory() {
  try {
    const { userId, organizationId } = await requireActor();
    const chatKey = `web_${userId}`;

    await db
      .delete(chatMessages)
      .where(
        and(
          eq(chatMessages.organizationId, organizationId),
          eq(chatMessages.telegramUserId, chatKey),
        ),
      );

    revalidatePath("/", "layout");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
