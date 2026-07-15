import { db } from "@/core/database/db";
import { services, serviceMaterials, products, organizationMembers } from "@/core/database/schema";
import { createClient } from "@/core/database/server";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import ServicesManager from "./ServicesManager";

export default async function ServicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.user_metadata?.organization_id) {
    redirect("/login");
  }

  const organizationId = user.user_metadata.organization_id;

  // Verificar si es ADMIN
  const [member] = await db.select().from(organizationMembers).where(and(
    eq(organizationMembers.organizationId, organizationId),
    eq(organizationMembers.userId, user.id)
  ));

  if (!member || member.role !== 'ADMIN') {
    redirect("/dashboard");
  }

  // Fetch Services
  const servicesList = await db.select().from(services).where(
    eq(services.organizationId, organizationId)
  );

  // Fetch all Products (Inventory) to use as materials
  const productsList = await db.select().from(products).where(
    eq(products.organizationId, organizationId)
  );

  // Fetch all Service Materials for the current organization's services
  const materialsList = await db.select({
    id: serviceMaterials.id,
    serviceId: serviceMaterials.serviceId,
    productId: serviceMaterials.productId,
    quantityUsed: serviceMaterials.quantityUsed,
    productName: products.name
  })
  .from(serviceMaterials)
  .leftJoin(products, eq(serviceMaterials.productId, products.id))
  // Filter locally or join with services. Here we just fetch all and map in JS
  // It's safe since they reference products and services. But to be safe:
  
  // We attach materials to their respective services
  const enrichedServices = servicesList.map(s => {
    const sMaterials = materialsList.filter(m => m.serviceId === s.id);
    return { ...s, materials: sMaterials };
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-white mb-2">Gestión de Servicios</h1>
        <p className="text-charcoal text-sm">Configura tus servicios, precios y el consumo de inventario de cada uno.</p>
      </div>

      <ServicesManager 
        services={enrichedServices} 
        products={productsList} 
      />
    </div>
  );
}
