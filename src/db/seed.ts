/**
 * Seed script for provider templates
 * Run this after migrations to populate built-in provider templates
 * 
 * Usage: pnpm seed
 */

import dotenv from 'dotenv';
import { query, closePool } from './pool.js';
import { getAllTemplates } from '../providers/templates/index.js';

dotenv.config();

async function seedProviders(): Promise<void> {
  console.log('=== Seeding Provider Templates ===');
  
  const templates = getAllTemplates();
  
  for (const template of templates) {
    try {
      // Check if provider already exists
      const existing = await query<{ id: string }>(
        'SELECT id FROM providers WHERE provider_id = $1',
        [template.id]
      );
      
      if (existing.rows.length > 0) {
        // Update existing provider
        await query(
          `UPDATE providers 
           SET display_name = $1, template = $2
           WHERE provider_id = $3`,
          [template.displayName, JSON.stringify(template), template.id]
        );
        console.log(`Updated provider: ${template.id}`);
      } else {
        // Insert new provider
        await query(
          `INSERT INTO providers (provider_id, display_name, template, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [template.id, template.displayName, JSON.stringify(template)]
        );
        console.log(`Created provider: ${template.id}`);
      }
    } catch (error) {
      console.error(`Failed to seed provider ${template.id}:`, error);
      throw error;
    }
  }
  
  console.log(`=== Seeded ${templates.length} provider templates ===`);
}

async function main(): Promise<void> {
  try {
    await seedProviders();
    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run if executed directly
main();

export { seedProviders };
