import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from '../src/core/database/db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        email text NOT NULL,
        role text NOT NULL DEFAULT 'BARBER',
        token uuid NOT NULL DEFAULT gen_random_uuid(),
        status text NOT NULL DEFAULT 'PENDING',
        created_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `);
    console.log('Table created successfully!');
  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    process.exit(0);
  }
}

run();
