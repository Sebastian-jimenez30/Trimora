import { db } from "@/core/database/db";
import { products } from "@/core/database/schema";
import { requireActor } from "@/core/auth/server/actor";
import { eq, asc } from "drizzle-orm";
import InventoryManager from "./InventoryManager";

export default async function InventarioPage() {
  const { organizationId: orgId } = await requireActor();

  // Cargar productos
  const inventory = await db
    .select()
    .from(products)
    .where(eq(products.organizationId, orgId))
    .orderBy(asc(products.name));

  return (
    <div className="p-[30px] flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-serif text-sterling mb-1">Manejo de Inventario</h1>
          <p className="text-sm text-charcoal">
            Administra tus productos de venta y materiales de consumo.
          </p>
        </div>
      </div>

      <InventoryManager initialProducts={inventory} />
    </div>
  );
}
