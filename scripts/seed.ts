import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  organizations,
  organizationMembers,
  services,
  products,
  serviceMaterials,
  clients,
  appointments,
  transactions,
  transactionItems,
  inventoryMovements,
  dailySummaries,
} from '../src/core/database/schema';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seed() {
  console.log('=================================');
  console.log('🌱 Iniciando Seed de Base de Datos');
  console.log('=================================');
  
  // 1. Create User via Supabase Admin
  console.log('1. Creando usuario a@gmail.com en Supabase Auth...');
  const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin.createUser({
    email: 'a@gmail.com',
    password: '123456',
    email_confirm: true,
  });
  
  let userId = userResp.user?.id;

  if (userErr) {
    if ((userErr as any).code === 'email_exists' || userErr.message.includes('already')) {
       console.log('   ⚠️ El usuario ya existe, obteniendo ID...');
       const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
       const existingUser = usersData.users.find(u => u.email === 'a@gmail.com');
       userId = existingUser?.id;
    } else {
       console.error('   ❌ Error al crear usuario:', userErr);
       process.exit(1);
    }
  }
  
  if (!userId) {
     console.error('   ❌ No se encontró un User ID.');
     process.exit(1);
  }

  // Clear previous data para evitar duplicados en pruebas
  console.log('2. Limpiando datos antiguos...');
  await db.delete(dailySummaries);
  await db.delete(inventoryMovements);
  await db.delete(transactionItems);
  await db.delete(transactions);
  await db.delete(appointments);
  await db.delete(clients);
  await db.delete(serviceMaterials);
  await db.delete(products);
  await db.delete(services);
  await db.delete(organizationMembers);
  await db.delete(organizations);

  // 2. Create Organization
  console.log('3. Creando Organización "Barbería Lucho"...');
  const [org] = await db.insert(organizations).values({
    name: 'Barbería Lucho',
  }).returning();

  // 3. Create Org Member
  console.log('4. Vinculando usuario como ADMIN de la barbería...');
  const [member] = await db.insert(organizationMembers).values({
    organizationId: org.id,
    userId: userId,
    role: 'ADMIN',
  }).returning();

  // 4. Create Services
  console.log('5. Generando Servicios...');
  const [corteClasico, ritualBarba, corteNino] = await db.insert(services).values([
    { organizationId: org.id, name: 'Corte Clásico', description: 'Corte a tijera o máquina con acabados.', durationMinutes: 30, price: '15.00' },
    { organizationId: org.id, name: 'Ritual de Barba', description: 'Arreglo con navaja, toalla caliente y aceites.', durationMinutes: 20, price: '10.00' },
    { organizationId: org.id, name: 'Corte de Niño', description: 'Corte especial para menores de 12 años.', durationMinutes: 25, price: '12.00' },
  ]).returning();

  // 5. Create Products
  console.log('6. Generando Productos (Inventario)...');
  const [cera, navaja, minoxidil] = await db.insert(products).values([
    { organizationId: org.id, name: 'Cera Moldeadora Trimora', description: 'Cera mate de fijación fuerte.', category: 'VENTA', currentStock: '50', minimumStock: '10', salePrice: '15.00', costPrice: '8.00' },
    { organizationId: org.id, name: 'Caja Hojas Navaja Derby', description: 'Insumo de barbería (Caja x100).', category: 'CONSUMO', currentStock: '200', minimumStock: '50', costPrice: '5.00' },
    { organizationId: org.id, name: 'Tónico Minoxidil 5%', description: 'Tónico para crecimiento de barba.', category: 'AMBOS', currentStock: '15', minimumStock: '5', salePrice: '25.00', costPrice: '12.00' },
  ]).returning();

  // 6. Create Service Materials (Recipes)
  console.log('7. Creando reglas de consumo (Inteligencia de inventario)...');
  await db.insert(serviceMaterials).values([
    { serviceId: ritualBarba.id, productId: navaja.id, quantityUsed: '1' }, // 1 hoja de navaja por barba
  ]);

  // 7. Create Clients
  console.log('8. Creando Clientes CRM...');
  const [client1, client2, client3] = await db.insert(clients).values([
    { organizationId: org.id, firstName: 'Sebastián', lastName: 'Jiménez', phone: '555-1234', email: 'seb@ejemplo.com', totalSpent: '40.00' },
    { organizationId: org.id, firstName: 'Andrés', lastName: 'López', phone: '555-5678', notes: 'Le gusta el desvanecido alto.', totalSpent: '15.00' },
    { organizationId: org.id, firstName: 'Mateo', lastName: 'González', phone: '555-9012' },
  ]).returning();

  // 8. Create Appointments (For today)
  console.log('9. Agendando Citas...');
  const today = new Date();
  today.setHours(0,0,0,0);
  const start1 = new Date(today.getTime() + 10 * 60 * 60 * 1000); // 10:00 AM
  const end1 = new Date(start1.getTime() + 30 * 60 * 1000); // 10:30 AM
  
  const start2 = new Date(today.getTime() + 14 * 60 * 60 * 1000); // 2:00 PM
  const end2 = new Date(start2.getTime() + 20 * 60 * 1000); // 2:20 PM

  await db.insert(appointments).values([
    { organizationId: org.id, clientId: client1.id, staffId: member.id, serviceId: corteClasico.id, startTime: start1, endTime: end1, status: 'COMPLETED' },
    { organizationId: org.id, clientId: client2.id, staffId: member.id, serviceId: ritualBarba.id, startTime: start2, endTime: end2, status: 'PENDING' },
  ]);

  // 9. Create Transactions
  console.log('10. Creando Transacciones (Tickets de Venta)...');
  const [tx1] = await db.insert(transactions).values([
    { organizationId: org.id, clientId: client1.id, staffId: member.id, totalAmount: '30.00', paymentMethod: 'CARD', status: 'COMPLETED' },
  ]).returning();

  // 10. Create Transaction Items
  await db.insert(transactionItems).values([
    { transactionId: tx1.id, itemType: 'SERVICE', itemId: corteClasico.id, quantity: '1', unitPrice: '15.00', subtotal: '15.00' },
    { transactionId: tx1.id, itemType: 'PRODUCT', itemId: cera.id, quantity: '1', unitPrice: '15.00', subtotal: '15.00' },
  ]);

  // 11. Create Inventory Movements
  console.log('11. Creando Movimientos de Inventario Históricos...');
  await db.insert(inventoryMovements).values([
    { organizationId: org.id, productId: cera.id, type: 'OUT', quantity: 1, previousStock: 21, newStock: 20, notes: 'Venta registrada' },
  ]);

  // 12. Create Daily Summary
  console.log('12. Creando Reporte Analítico Diario...');
  await db.insert(dailySummaries).values([
    { organizationId: org.id, date: today, totalRevenue: '30.00', appointmentsCount: 2, newClientsCount: 3 },
  ]);

  console.log('=================================');
  console.log('✅ Base de datos poblada exitosamente');
  console.log('=================================');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Error durante el seed:', err);
  process.exit(1);
});
