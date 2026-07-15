import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env', override: false });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log("Checking avatars bucket...");
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error("Error listing buckets:", listError);
    process.exit(1);
  }

  const avatarsBucket = buckets.find(b => b.name === 'avatars');

  if (!avatarsBucket) {
    console.log("Creating avatars bucket...");
    const { data, error } = await supabase.storage.createBucket('avatars', {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
      fileSizeLimit: 5242880 // 5MB
    });

    if (error) {
      console.error("Error creating bucket:", error);
      process.exit(1);
    }
    console.log("Bucket created successfully:", data);
    
    // Also we need to make sure we have a policy that allows uploading. 
    // Since we're doing this via Admin API, we can upload using the service role key on the backend!
    // We don't even need RLS policies for upload if we do the upload on the server side using createClient(SUPABASE_SECRET_KEY).
    console.log("We will upload via backend admin client, so no RLS policies needed for uploads.");
  } else {
    console.log("Bucket 'avatars' already exists.");
  }
}

main();
