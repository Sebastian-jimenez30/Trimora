import { drizzle } from 'drizzle-orm/postgres-js'; 
import postgres from 'postgres'; 
import { sql } from 'drizzle-orm'; 
import dotenv from 'dotenv'; 
dotenv.config({ path: '.env.local' }); 

const client = postgres(process.env.DATABASE_URL!, { prepare: false }); 
const db = drizzle(client); 
db.execute(sql`SELECT name, price, duration_minutes FROM services`).then(res => {
  console.log(res);
}).catch(console.error).finally(() => client.end());
