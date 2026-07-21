import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@/core/database/db';
import { organizationMembers, products, services } from '@/core/database/schema';
import { createClient } from '@/core/database/server';
import { eq } from 'drizzle-orm';

// Define expected output schemas
const productSchema = z.object({
  items: z.array(z.object({
    name: z.string().describe("Nombre descriptivo del producto"),
    description: z.string().nullable().describe("Descripción corta del producto"),
    category: z.enum(["VENTA", "CONSUMO"]).describe("VENTA si se vende a clientes, CONSUMO si es de uso interno"),
    currentStock: z.number().describe("Cantidad en inventario. Por defecto 0 si no se indica."),
    minimumStock: z.number().nullable().describe("Alerta de stock mínimo, por defecto 0"),
    salePrice: z.number().nullable().describe("Precio de venta al público en número entero"),
    costPrice: z.number().nullable().describe("Costo de compra en número entero")
  }))
});

const serviceSchema = z.object({
  items: z.array(z.object({
    name: z.string().describe("Nombre del servicio"),
    description: z.string().nullable().describe("Descripción del servicio"),
    durationMinutes: z.number().describe("Duración aproximada en minutos (ej. 30, 45, 60). Por defecto 30"),
    price: z.number().describe("Precio de venta del servicio en número entero")
  }))
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
    if (!members[0]) {
      return NextResponse.json({ success: false, error: "El usuario no pertenece a ninguna organización" }, { status: 403 });
    }

    const organizationId = members[0].organizationId;

    const body = await req.json();
    const { entityType, data, isImage } = body; // data can be text or base64 image string

    if (!entityType || !data) {
      return NextResponse.json({ success: false, error: "Faltan parámetros requeridos" }, { status: 400 });
    }

    // Configure the AI model (gpt-4o-mini is multimodal and extremely cheap)
    const model = openai('gpt-4o-mini');

    let systemPrompt = "Se te proporcionará información importada. Tu trabajo es limpiar, estandarizar y extraer los datos requeridos. Ignora datos inválidos.";
    let messages: any[] = [];
    
    if (isImage) {
      systemPrompt = `Extrae la información de ${entityType === 'products' ? 'los productos' : 'los servicios'} de esta imagen. Trata de deducir precios, duraciones o categorías si es posible. Ignora datos irrelevantes y devuélvelo estandarizado.`;
      messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: "Analiza la siguiente imagen y extrae el catálogo:" },
            { type: 'image', image: data } // base64 string
          ],
        },
      ];
    } else {
      systemPrompt = `Se te proporcionará una lista de ${entityType === 'products' ? 'productos' : 'servicios'} importados (puede ser un CSV, JSON o texto crudo). Tu trabajo es limpiarlos, estandarizarlos y mapearlos a la estructura JSON solicitada. Ignora filas vacías o datos inválidos. Si el precio tiene símbolos, conviértelo a un número puro. Mapea la categoría inteligentemente ("VENTA" para productos que se venden, "CONSUMO" para productos de uso interno como geles de barberos).`;
      messages = [
        {
          role: 'user',
          content: data
        }
      ];
    }

    // Generate Object ensures the output exactly matches the Zod schema
    const { object } = await generateObject({
      model,
      system: systemPrompt,
      schema: entityType === 'products' ? productSchema : serviceSchema,
      messages,
      temperature: 0.1, // Low temperature for deterministic formatting
    });

    // Return data to frontend for preview
    const items = object.items;
    
    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, error: "No se encontraron elementos válidos para importar." }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      data: items,
      message: `Se han procesado ${items.length} elementos. Por favor, revisa la información antes de guardar.` 
    });

  } catch (error: any) {
    console.error("Error importando:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
