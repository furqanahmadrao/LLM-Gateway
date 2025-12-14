import { query } from '../pool.js';
import { v4 as uuidv4 } from 'uuid';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: Date;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: Date;
}

function rowToOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new organization
 */
export async function createOrganization(name: string, slug: string): Promise<Organization> {
  const id = uuidv4();
  const result = await query<OrganizationRow>(
    'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) RETURNING *',
    [id, name, slug]
  );
  return rowToOrganization(result.rows[0]);
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  const result = await query<OrganizationRow>('SELECT * FROM organizations WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return rowToOrganization(result.rows[0]);
}

/**
 * Get organization by slug
 */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const result = await query<OrganizationRow>('SELECT * FROM organizations WHERE slug = $1', [slug]);
  if (result.rows.length === 0) return null;
  return rowToOrganization(result.rows[0]);
}

/**
 * Add member to organization
 */
export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member'
): Promise<OrganizationMember> {
  const id = uuidv4();
  const result = await query<OrganizationMemberRow>(
    'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [id, organizationId, userId, role]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role as 'owner' | 'admin' | 'member',
    createdAt: row.created_at,
  };
}

/**
 * List organizations for a user
 */
export async function getUserOrganizations(userId: string): Promise<Organization[]> {
  const result = await query<OrganizationRow>(
    `SELECT o.* FROM organizations o
     JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = $1
     ORDER BY o.name ASC`,
    [userId]
  );
  return result.rows.map(rowToOrganization);
}
