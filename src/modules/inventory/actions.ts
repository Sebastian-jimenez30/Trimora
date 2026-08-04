"use server";

import { db } from "@/core/database/db";
import { products } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getErrorMessage } from "@/core/errors";
import { z } from "zod";

const productIdSchema = z.string().uuid();
const stockSchema = z.coerce.number().finite().nonnegative().max(999_999_999).transform(String);
const optionalPriceSchema = z.union([
  z.literal("").transform(() => null),
  z.coerce.number().finite().nonnegative().max(999_999_999).transform(String),
]);
const productFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000),
  category: z.enum(["VENTA", "CONSUMO"]),
  currentStock: stockSchema,
  minimumStock: stockSchema,
  salePrice: optionalPriceSchema,
  costPrice: optionalPriceSchema,
});

function parseProduct(formData: FormData) {
  return productFormSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || "",
    category: formData.get("category"),
    currentStock: formData.get("currentStock") || "0",
    minimumStock: formData.get("minimumStock") || "0",
    salePrice: formData.get("salePrice") || "",
    costPrice: formData.get("costPrice") || "",
  });
}

export async function createProduct(formData: FormData) {
  try {
    const { organizationId: orgId } = await requireActor();
    const input = parseProduct(formData);

    await db.insert(products).values({
      organizationId: orgId,
      ...input,
    });

    revalidatePath("/inventario");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function updateProduct(id: string, formData: FormData) {
  try {
    const { organizationId: orgId } = await requireActor();
    const input = parseProduct(formData);

    await db
      .update(products)
      .set(input)
      .where(and(eq(products.id, productIdSchema.parse(id)), eq(products.organizationId, orgId)));

    revalidatePath("/inventario");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteProduct(id: string) {
  try {
    const { organizationId: orgId } = await requireActor();

    await db
      .delete(products)
      .where(and(eq(products.id, productIdSchema.parse(id)), eq(products.organizationId, orgId)));

    revalidatePath("/inventario");
    return { success: true };
  } catch {
    return {
      success: false,
      error: "No se puede eliminar el producto porque está vinculado a servicios o ventas.",
    };
  }
}

const ProductImportSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255),
  description: z.string().optional().nullable(),
  category: z.enum(["VENTA", "CONSUMO"]),
  currentStock: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => v?.toString() || "0"),
  minimumStock: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => v?.toString() || "0"),
  salePrice: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v ? v.toString() : null)),
  costPrice: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v ? v.toString() : null)),
});

export async function batchImportProducts(items: unknown[]) {
  try {
    const { organizationId: orgId } = await requireActor();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: "No hay productos para importar o formato inválido" };
    }

    // Validar y sanear los datos de entrada
    const parsedItems = [];
    for (const item of items) {
      const parsed = ProductImportSchema.safeParse(item);
      if (!parsed.success) {
        const itemName =
          typeof item === "object" &&
          item !== null &&
          "name" in item &&
          typeof item.name === "string"
            ? item.name
            : "Desconocido";
        throw new Error(
          `Error validando el producto "${itemName}": ${parsed.error.issues[0].message}`,
        );
      }
      parsedItems.push(parsed.data);
    }

    const inserts = parsedItems.map((item) => ({
      organizationId: orgId,
      name: item.name,
      description: item.description,
      category: item.category,
      currentStock: item.currentStock,
      minimumStock: item.minimumStock,
      salePrice: item.salePrice,
      costPrice: item.costPrice,
      isActive: true,
    }));

    await db.insert(products).values(inserts);
    revalidatePath("/inventario");

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
