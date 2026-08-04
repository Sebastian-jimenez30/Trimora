"use server";

import { db } from "@/core/database/db";
import { services, serviceMaterials, products, inventoryMovements } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getErrorMessage } from "@/core/errors";
import { z } from "zod";

type MaterialInput = {
  productId: string;
  quantityUsed: number;
};

const resourceIdSchema = z.string().uuid();
const serviceFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000),
  durationMinutes: z.coerce.number().int().positive().max(1_440),
  price: z.coerce.number().finite().nonnegative().max(999_999_999),
  isActive: z.boolean(),
});
const quickProductSchema = z.object({
  name: z.string().trim().min(1).max(255),
  costPrice: z.coerce.number().finite().nonnegative().max(999_999_999),
  currentStock: z.coerce.number().finite().nonnegative().max(999_999_999),
  minimumStock: z.coerce.number().finite().nonnegative().max(999_999_999),
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
      price: z.number().finite().nonnegative().max(999_999_999),
    }),
  )
  .min(1)
  .max(1_000);

async function validateMaterials(organizationId: string, input: MaterialInput[]) {
  const materials = materialsSchema.parse(input);
  const productIds = [...new Set(materials.map((material) => material.productId))];
  if (productIds.length === 0) return materials;

  const validProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.category, "CONSUMO"),
        inArray(products.id, productIds),
      ),
    );
  if (validProducts.length !== productIds.length) {
    throw new Error(
      "Todos los consumibles deben pertenecer a la organización y tener categoría CONSUMO",
    );
  }
  return materials;
}

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
    const validMaterials = await validateMaterials(organizationId, materials);

    const { name, description, durationMinutes, price, isActive } = parseService(formData);

    // Insert Service
    const [service] = await db
      .insert(services)
      .values({
        organizationId,
        name,
        description,
        durationMinutes,
        price: price.toString(),
        isActive,
      })
      .returning();

    // Insert Materials
    if (validMaterials.length > 0) {
      await db.insert(serviceMaterials).values(
        validMaterials.map((m) => ({
          serviceId: service.id,
          productId: m.productId,
          quantityUsed: m.quantityUsed.toString(),
        })),
      );
    }

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
    const validServiceId = resourceIdSchema.parse(serviceId);
    const validMaterials = await validateMaterials(organizationId, materials);

    const { name, description, durationMinutes, price, isActive } = parseService(formData);

    // Asegurarse de que el servicio pertenece a la org
    const existing = await db
      .select()
      .from(services)
      .where(and(eq(services.id, validServiceId), eq(services.organizationId, organizationId)));
    if (existing.length === 0) throw new Error("Servicio no encontrado");

    // Update Service
    await db
      .update(services)
      .set({
        name,
        description,
        durationMinutes,
        price: price.toString(),
        isActive,
      })
      .where(and(eq(services.id, validServiceId), eq(services.organizationId, organizationId)));

    // Update Materials: Delete all existing, insert new ones
    await db.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, validServiceId));

    if (validMaterials.length > 0) {
      await db.insert(serviceMaterials).values(
        validMaterials.map((m) => ({
          serviceId: validServiceId,
          productId: m.productId,
          quantityUsed: m.quantityUsed.toString(),
        })),
      );
    }

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

    const existing = await db
      .select()
      .from(services)
      .where(and(eq(services.id, validServiceId), eq(services.organizationId, organizationId)));
    if (existing.length === 0) throw new Error("Servicio no encontrado");

    // Delete materials first due to foreign key
    await db.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, validServiceId));

    // Delete service
    await db
      .delete(services)
      .where(and(eq(services.id, validServiceId), eq(services.organizationId, organizationId)));

    revalidatePath("/servicios");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function quickCreateProduct(formData: FormData) {
  try {
    const { organizationId } = await requireActor({ roles: ["ADMIN"] });

    const { name, costPrice, currentStock, minimumStock } = quickProductSchema.parse({
      name: formData.get("name"),
      costPrice: formData.get("costPrice"),
      currentStock: formData.get("currentStock"),
      minimumStock: formData.get("minimumStock") || 0,
    });

    // Insert Product as CONSUMO
    const [product] = await db
      .insert(products)
      .values({
        organizationId,
        name,
        category: "CONSUMO",
        costPrice: costPrice.toString(),
        salePrice: "0", // Not for sale
        currentStock: currentStock.toString(),
        minimumStock: minimumStock.toString(),
        isActive: true,
      })
      .returning();

    // Log initial stock in inventory_movements if > 0
    if (currentStock > 0) {
      await db.insert(inventoryMovements).values({
        organizationId,
        productId: product.id,
        type: "IN",
        quantity: Math.floor(currentStock), // Note: Movement quantity is integer in schema currently
        previousStock: 0,
        newStock: Math.floor(currentStock),
        notes: "Ajuste inicial desde creación rápida",
      });
    }

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

    const inserts = validItems.map((item) => ({
      organizationId,
      name: item.name,
      description: item.description || null,
      durationMinutes: item.durationMinutes || 30,
      price: item.price.toString(),
      isActive: true,
    }));

    await db.insert(services).values(inserts);
    revalidatePath("/servicios");

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
