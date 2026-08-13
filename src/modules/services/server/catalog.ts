import "server-only";

import { db } from "@/core/database/db";
import { appointments, products, serviceMaterials, services } from "@/core/database/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

export type ServiceCatalogDatabase = typeof db;

type ServiceMaterialInput = { productId: string; quantityUsed: number };
type ServiceValues = {
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
};

async function validateMaterials(
  database: Parameters<Parameters<ServiceCatalogDatabase["transaction"]>[0]>[0],
  organizationId: string,
  materials: ServiceMaterialInput[],
) {
  const productIds = [...new Set(materials.map((material) => material.productId))];
  if (productIds.length === 0) return;

  const validProducts = await database
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
    throw new Error("Todos los consumibles deben pertenecer a la organizacion y ser CONSUMO");
  }
}

export async function createServiceCatalogEntry(input: {
  organizationId: string;
  values: ServiceValues;
  materials: ServiceMaterialInput[];
  database?: ServiceCatalogDatabase;
}) {
  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    await validateMaterials(tx, input.organizationId, input.materials);
    const [service] = await tx
      .insert(services)
      .values({
        organizationId: input.organizationId,
        ...input.values,
        price: input.values.price.toFixed(2),
      })
      .returning();
    if (input.materials.length > 0) {
      await tx.insert(serviceMaterials).values(
        input.materials.map((material) => ({
          serviceId: service.id,
          productId: material.productId,
          quantityUsed: material.quantityUsed.toFixed(4),
        })),
      );
    }
    return service;
  });
}

export async function updateServiceCatalogEntry(input: {
  organizationId: string;
  serviceId: string;
  values: ServiceValues;
  materials: ServiceMaterialInput[];
  effectiveAt?: Date;
  database?: ServiceCatalogDatabase;
}) {
  const database = input.database ?? db;
  return database.transaction(async (tx) => {
    await validateMaterials(tx, input.organizationId, input.materials);
    const [existing] = await tx
      .select({ id: services.id, durationMinutes: services.durationMinutes })
      .from(services)
      .where(
        and(eq(services.id, input.serviceId), eq(services.organizationId, input.organizationId)),
      )
      .for("update");
    if (!existing) throw new Error("Servicio no encontrado");

    await tx
      .update(services)
      .set({ ...input.values, price: input.values.price.toFixed(2) })
      .where(
        and(eq(services.id, input.serviceId), eq(services.organizationId, input.organizationId)),
      );
    await tx.delete(serviceMaterials).where(eq(serviceMaterials.serviceId, input.serviceId));
    if (input.materials.length > 0) {
      await tx.insert(serviceMaterials).values(
        input.materials.map((material) => ({
          serviceId: input.serviceId,
          productId: material.productId,
          quantityUsed: material.quantityUsed.toFixed(4),
        })),
      );
    }

    if (existing.durationMinutes !== input.values.durationMinutes) {
      await tx
        .update(appointments)
        .set({
          endTime: sql`${appointments.startTime} + (${input.values.durationMinutes} * interval '1 minute')`,
        })
        .where(
          and(
            eq(appointments.organizationId, input.organizationId),
            eq(appointments.serviceId, input.serviceId),
            inArray(appointments.status, ["PENDING", "CONFIRMED"]),
            gte(appointments.startTime, input.effectiveAt ?? new Date()),
          ),
        );
    }
  });
}
