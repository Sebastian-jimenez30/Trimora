import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const connectionString = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey || !connectionString) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const client = postgres(connectionString, { prepare: false });
const db = drizzle(client);

async function run() {
  console.log("Starting deletion process...");

  try {
    // 1. Delete all table data (bottom-up to respect foreign keys if they exist)
    console.log("Deleting transaction_items...");
    await db.execute(sql`DELETE FROM transaction_items`);
    console.log("Deleting transactions...");
    await db.execute(sql`DELETE FROM transactions`);
    console.log("Deleting service_materials...");
    await db.execute(sql`DELETE FROM service_materials`);
    console.log("Deleting appointments...");
    await db.execute(sql`DELETE FROM appointments`);
    console.log("Deleting clients...");
    await db.execute(sql`DELETE FROM clients`);
    console.log("Deleting products...");
    await db.execute(sql`DELETE FROM products`);
    console.log("Deleting services...");
    await db.execute(sql`DELETE FROM services`);
    console.log("Deleting chat_messages...");
    await db.execute(sql`DELETE FROM chat_messages`);
    console.log("Deleting invitations...");
    await db.execute(sql`DELETE FROM invitations`);
    console.log("Deleting organization_members...");
    await db.execute(sql`DELETE FROM organization_members`);
    console.log("Deleting organizations...");
    await db.execute(sql`DELETE FROM organizations`);

    console.log("All application data deleted.");

    // 2. Delete non-admin users from auth.users
    const { data: users, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    const admins = ['anderjime864@gmail.com', 'trimoraerp@gmail.com', 'sebajimenez@gmail.com'];
    let deletedCount = 0;

    for (const u of users.users) {
      if (admins.includes(u.email || '')) {
        console.log(`Skipping admin user: ${u.email}`);
        
        // Also remove organization_id from their metadata to reset them
        const { error: updateError } = await supabase.auth.admin.updateUserById(u.id, {
          user_metadata: { ...u.user_metadata, organization_id: null }
        });
        if (updateError) {
          console.error(`Error updating admin ${u.email}:`, updateError);
        } else {
          console.log(`Reset organization_id for admin: ${u.email}`);
        }
      } else {
        console.log(`Deleting user: ${u.email}`);
        const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
        if (delErr) {
          console.error(`Error deleting user ${u.email}:`, delErr);
        } else {
          deletedCount++;
        }
      }
    }

    console.log(`Deleted ${deletedCount} users from auth.`);
    console.log("Process complete!");

  } catch (err) {
    console.error("Error during deletion:", err);
  } finally {
    await client.end();
  }
}

run();
