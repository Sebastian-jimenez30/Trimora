import { createClient } from "@/core/database/server";
import { db } from "@/core/database/db";
import { organizationMembers, products } from "@/core/database/schema";
import { eq, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import InventoryManager from "./InventoryManager";

export default async function InventarioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Obtener la Organización
  const member = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
  const orgId = member[0]?.organizationId;

  if (!orgId) {
    return <div className="p-10 text-white">No tienes una organización asignada.</div>;
  }

  // Cargar productos
  const inventory = await db.select()
    .from(products)
    .where(eq(products.organizationId, orgId))
    .orderBy(asc(products.name));

  return (
    <div className="p-[30px] flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif text-sterling mb-1">Manejo de Inventario</h1>
          <p className="text-sm text-charcoal">Administra tus productos de venta y materiales de consumo.</p>
        </div>
      </div>
      
      <InventoryManager initialProducts={inventory} />
    </div>
  );
}
