"use server";

import { requireActor } from "@/core/auth/server/actor";
import { db } from "@/core/database/db";
import { inventoryMovements, products, serviceMaterials, services } from "@/core/database/schema";
import { getErrorMessage } from "@/core/errors";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceCatalogEntry, updateServiceCatalogEntry } from "./server/catalog";

type MaterialInput = { productId: string; quantityUsed: number };

const resourceIdSchema = z.string().uuid();
const serviceFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000),
  durationMinutes: z.coerce.number().int().positive().max(1_440),
  price: z.coerce.number().finite().nonnegative().max(99_999_999),
  isActive: z.boolean(),
});
const quickProductSchema = z.object({
  name: z.string().trim().min(1).max(255),
  costPrice: z.coerce.number().finite().nonnegative().max(99_999_999),
  currentStock: z.coerce.number().finite().nonnegative().max(99_999_999),
  minimumStock: z.coerce.number().finite().nonnegative().max(99_999_999),
});
const materialsSchema = z
  .array(
    z.object({
      productId: resourceIdSchema,
      quantityUsed: z.number().finite().positive().max(100_000),
    }),
  )
  .max(200);
const serviceImportSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(255),
      description: z.string().max(2_000).nullish(),
      durationMinutes: z.number().int().positive().max(1_440).default(30),
      price: z.number().finite().nonnegative().max(99_999_999),
    }),
  )
  .min(1)
  .max(1_000);

function parseService(formData: FormData) {
  return serviceFormSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || "",
    durationMinutes: formData.get("durationMinutes"),
    price: formData.get("price"),
    isActive: formData.get("isActive") === "true",
  });
}

export async function createServiceWithMaterials(formData: FormData, materials: MaterialInput[]) {
  try {
    const { organizationId } = await requireActor({ roles: ["ADMIN"] });
    await createServiceCatalogEntry({
      organizationId,
      values: parseService(formData),
      materials: materialsSchema.parse(materials),
    });
    revalidatePath("/servicios");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateServiceWithMaterials(
  serviceId: string,
  formData: FormData,
  materials: MaterialInput[],
) {
  try {
    const { organizationId } = await requireActor({ roles: ["ADMIN"] });
    await updateServiceCatalogEntry({
      organizationId,
      serviceId: resourceIdSchema.parse(serviceId),
      values: parseService(formData),
      materials: materialsSchema.parse(materials),
    });
    revalidatePath("/servicios");
    revalidatePath("/agenda");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteService(serviceId: string) {
  try {
    const { organizationId } = await requireActor({ roles: ["ADMIN"] });
    const validServiceId = resourceIdSchema.parse(serviceId);
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.id, validServiceId), eq(services.organizationId, organizationId)))
        .for("update");
      if (!existing) throw new Error("Servicio no encontrado");
      await tx.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, validServiceId));
      await tx
        .delete(services)
        .where(and(eq(services.id, validServiceId), eq(services.organizationId, organizationId)));
    });
    revalidatePath("/servicios");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function quickCreateProduct(formData: FormData) {
  try {
    const { organizationId } = await requireActor({ roles: ["ADMIN"] });
    const input = quickProductSchema.parse({
      name: formData.get("name"),
      costPrice: formData.get("costPrice"),
      currentStock: formData.get("currentStock"),
      minimumStock: formData.get("minimumStock") || 0,
    });

    const product = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(products)
        .values({
          organizationId,
          name: input.name,
          category: "CONSUMO",
          costPrice: input.costPrice.toFixed(2),
          salePrice: "0.00",
          currentStock: input.currentStock.toFixed(4),
          minimumStock: input.minimumStock.toFixed(4),
          isActive: true,
        })
        .returning();
      if (input.currentStock > 0) {
        await tx.insert(inventoryMovements).values({
          organizationId,
          productId: created.id,
          type: "IN",
          quantity: input.currentStock,
          previousStock: 0,
          newStock: input.currentStock,
          notes: "Ajuste inicial desde creacion rapida",
        });
      }
      return created;
    });
    revalidatePath("/servicios");
    return { success: true, data: product };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function batchImportServices(items: unknown[]) {
  try {
    const { organizationId } = await requireActor({ roles: ["ADMIN"] });
    const validItems = serviceImportSchema.parse(items);
    await db.insert(services).values(
      validItems.map((item) => ({
        organizationId,
        name: item.name,
        description: item.description || null,
        durationMinutes: item.durationMinutes,
        price: item.price.toFixed(2),
        isActive: true,
      })),
    );
    revalidatePath("/servicios");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
