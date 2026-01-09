import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set. Set it in your environment or .env file.');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found at ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, { encoding: 'utf-8' });

  const client = new Client({ connectionString: databaseUrl });
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Applying schema...');
    await client.query(sql);
    console.log('✅ Schema applied successfully');
  } catch (err:any) {
    console.error('❌ Failed to apply schema:', err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});