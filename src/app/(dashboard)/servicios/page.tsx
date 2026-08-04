import { db } from "@/core/database/db";
import { services, serviceMaterials, products } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { and, eq } from "drizzle-orm";
import ServicesManager from "./ServicesManager";

export default async function ServicesPage() {
  const { organizationId } = await requireActor({ roles: ["ADMIN"] });

  // Fetch Services
  const servicesList = await db
    .select()
    .from(services)
    .where(eq(services.organizationId, organizationId));

  // Fetch all Products (Inventory) to use as materials
  const productsList = await db
    .select()
    .from(products)
    .where(and(eq(products.organizationId, organizationId), eq(products.category, "CONSUMO")));

  // Fetch all Service Materials for the current organization's services
  const materialsList = await db
    .select({
      id: serviceMaterials.id,
      serviceId: serviceMaterials.serviceId,
      productId: serviceMaterials.productId,
      quantityUsed: serviceMaterials.quantityUsed,
      productName: products.name,
    })
    .from(serviceMaterials)
    .leftJoin(products, eq(serviceMaterials.productId, products.id))
    .innerJoin(services, eq(serviceMaterials.serviceId, services.id))
    .where(eq(services.organizationId, organizationId));
  // It's safe since they reference products and services. But to be safe:

  // We attach materials to their respective services
  const enrichedServices = servicesList.map((s) => {
    const sMaterials = materialsList.filter((m) => m.serviceId === s.id);
    return { ...s, materials: sMaterials };
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-white mb-2">Gestión de Servicios</h1>
        <p className="text-charcoal text-sm">
          Configura tus servicios, precios y el consumo de inventario de cada uno.
        </p>
      </div>

      <ServicesManager services={enrichedServices} products={productsList} />
    </div>
  );
}
