/**
 * Seed script for provider templates
 * Run this after migrations to populate built-in provider templates
 * 
 * Usage: pnpm seed
 */

import dotenv from 'dotenv';
import crypto from 'crypto';
import { query, closePool } from './pool.js';
import { getAllTemplates } from '../providers/templates/index.js';

dotenv.config();

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

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

async function seedDefaultData(): Promise<void> {
  console.log('=== Seeding Default Data ===');

  try {
    // 1. Create Default Team
    let teamId: string;
    const teamResult = await query<{ id: string }>('SELECT id FROM teams WHERE name = $1', ['Default Team']);

    if (teamResult.rows.length > 0) {
      teamId = teamResult.rows[0].id;
      console.log('Default Team already exists');
    } else {
      const newTeam = await query<{ id: string }>(
        'INSERT INTO teams (name) VALUES ($1) RETURNING id',
        ['Default Team']
      );
      teamId = newTeam.rows[0].id;
      console.log('Created Default Team');
    }

    // 2. Create Default Project
    let projectId: string;
    const projectResult = await query<{ id: string }>(
      'SELECT id FROM projects WHERE team_id = $1 AND name = $2',
      [teamId, 'Default Project']
    );

    if (projectResult.rows.length > 0) {
      projectId = projectResult.rows[0].id;
      console.log('Default Project already exists');
    } else {
      const newProject = await query<{ id: string }>(
        'INSERT INTO projects (team_id, name) VALUES ($1, $2) RETURNING id',
        [teamId, 'Default Project']
      );
      projectId = newProject.rows[0].id;
      console.log('Created Default Project');
    }

    // 3. Create Default Admin API Key
    const apiKey = 'llmgw_admin_secret_key';
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = apiKey.slice(0, 8);

    const keyResult = await query(
      'SELECT id FROM api_keys WHERE key_hash = $1',
      [keyHash]
    );

    if (keyResult.rows.length > 0) {
      console.log('Default Admin API Key already exists');
    } else {
      await query(
        `INSERT INTO api_keys (key_hash, key_prefix, project_id, name)
         VALUES ($1, $2, $3, $4)`,
        [keyHash, keyPrefix, projectId, 'Default Admin Key']
      );
      console.log('Created Default Admin API Key: llmgw_admin_secret_key');
    }

  } catch (error) {
    console.error('Failed to seed default data:', error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    await seedProviders();
    await seedDefaultData();
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
