import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function getExecutedMigrations(): Promise<string[]> {
  const result = await query<{ name: string }>('SELECT name FROM migrations ORDER BY id');
  return result.rows.map(row => row.name);
}

async function runMigration(name: string, sql: string): Promise<void> {
  console.log(`Running migration: ${name}`);
  await query(sql);
  await query('INSERT INTO migrations (name) VALUES ($1)', [name]);
  console.log(`Completed migration: ${name}`);
}

async function migrate(): Promise<void> {
  try {
    await createMigrationsTable();
    const executedMigrations = await getExecutedMigrations();
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      if (!executedMigrations.includes(file)) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        await runMigration(file, sql);
      }
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run migrations if this file is executed directly
migrate().catch(console.error);

export { migrate };
