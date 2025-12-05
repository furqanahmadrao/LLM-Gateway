import { query, transaction } from '../pool.js';
import { v4 as uuidv4 } from 'uuid';
import type { Team, Project, TeamMember } from '../../types/index.js';

interface TeamRow {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

interface ProjectRow {
  id: string;
  team_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  token_quota: number | null;
  tokens_used: number;
  quota_reset_at: Date | null;
}

interface TeamMemberRow {
  id: string;
  team_id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: string;
  created_at: Date;
  last_active_at: Date | null;
}

/**
 * Creates a new team with an isolated namespace
 * 
 * Requirements: 8.1 - Initialize isolated namespace for projects and credentials
 */
export async function createTeam(name: string): Promise<Team> {
  const id = uuidv4();
  const result = await query<TeamRow>(
    'INSERT INTO teams (id, name) VALUES ($1, $2) RETURNING *',
    [id, name]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Gets a team by ID
 */
export async function getTeamById(id: string): Promise<Team | null> {
  const result = await query<TeamRow>('SELECT * FROM teams WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Gets a team by name
 */
export async function getTeamByName(name: string): Promise<Team | null> {
  const result = await query<TeamRow>('SELECT * FROM teams WHERE name = $1', [name]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Lists all teams
 */
export async function listTeams(): Promise<Team[]> {
  const result = await query<TeamRow>('SELECT * FROM teams ORDER BY created_at DESC');
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Updates a team's name
 * 
 * @param id - Team ID
 * @param name - New team name
 * @returns Updated team or null if not found
 */
export async function updateTeam(id: string, name: string): Promise<Team | null> {
  const result = await query<TeamRow>(
    'UPDATE teams SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [name, id]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Deletes a team and all associated resources (cascades via FK)
 * 
 * Requirements: 8.1 - Team deletion removes isolated namespace
 */
export async function deleteTeam(id: string): Promise<boolean> {
  const result = await query('DELETE FROM teams WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Creates a new project within a team
 * 
 * Requirements: 8.2 - Associate projects with teams
 */
export async function createProject(teamId: string, name: string): Promise<Project> {
  const id = uuidv4();
  const result = await query<ProjectRow>(
    'INSERT INTO projects (id, team_id, name) VALUES ($1, $2, $3) RETURNING *',
    [id, teamId, name]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Gets a project by ID
 */
export async function getProjectById(id: string): Promise<Project | null> {
  const result = await query<ProjectRow>('SELECT * FROM projects WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Gets all projects for a team
 */
export async function getProjectsByTeamId(teamId: string): Promise<Project[]> {
  const result = await query<ProjectRow>(
    'SELECT * FROM projects WHERE team_id = $1 ORDER BY created_at DESC',
    [teamId]
  );
  return result.rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Updates a project's name
 * 
 * @param id - Project ID
 * @param name - New project name
 * @returns Updated project or null if not found
 */
export async function updateProject(id: string, name: string): Promise<Project | null> {
  const result = await query<ProjectRow>(
    'UPDATE projects SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [name, id]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Deletes a project
 */
export async function deleteProject(id: string): Promise<boolean> {
  const result = await query('DELETE FROM projects WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Adds a member to a team with a specified role
 * 
 * Requirements: 18.1 - Add members with roles (admin, member, viewer)
 */
export async function addTeamMember(
  teamId: string,
  userId: string,
  email: string,
  name: string | null,
  role: 'admin' | 'member' | 'viewer'
): Promise<TeamMember> {
  const id = uuidv4();
  const result = await query<TeamMemberRow>(
    `INSERT INTO team_members (id, team_id, user_id, email, name, role) 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, teamId, userId, email, name, role]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role as 'admin' | 'member' | 'viewer',
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

/**
 * Gets a team member by team ID and user ID
 */
export async function getTeamMember(teamId: string, userId: string): Promise<TeamMember | null> {
  const result = await query<TeamMemberRow>(
    'SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role as 'admin' | 'member' | 'viewer',
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

/**
 * Gets a team member by member ID
 */
export async function getTeamMemberById(memberId: string): Promise<TeamMember | null> {
  const result = await query<TeamMemberRow>(
    'SELECT * FROM team_members WHERE id = $1',
    [memberId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role as 'admin' | 'member' | 'viewer',
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

/**
 * Lists all members of a team
 * 
 * Requirements: 18.3 - Display name, email, role, and last active time
 */
export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const result = await query<TeamMemberRow>(
    'SELECT * FROM team_members WHERE team_id = $1 ORDER BY created_at ASC',
    [teamId]
  );
  return result.rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role as 'admin' | 'member' | 'viewer',
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  }));
}

/**
 * Updates a team member's role
 * 
 * @param teamId - Team ID
 * @param userId - User ID
 * @param role - New role
 * @returns Updated member or null if not found
 */
export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer'
): Promise<TeamMember | null> {
  const result = await query<TeamMemberRow>(
    'UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3 RETURNING *',
    [role, teamId, userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role as 'admin' | 'member' | 'viewer',
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

/**
 * Updates a team member's last active timestamp
 */
export async function updateMemberLastActive(teamId: string, userId: string): Promise<void> {
  await query(
    'UPDATE team_members SET last_active_at = NOW() WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
}

/**
 * Removes a member from a team
 * 
 * Requirements: 18.4 - Revoke access immediately
 */
export async function removeTeamMember(teamId: string, userId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Checks if a user is a member of a team
 */
export async function isTeamMember(teamId: string, userId: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2) as exists',
    [teamId, userId]
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * Gets a member's role in a team
 */
export async function getMemberRole(teamId: string, userId: string): Promise<'admin' | 'member' | 'viewer' | null> {
  const result = await query<{ role: string }>(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].role as 'admin' | 'member' | 'viewer';
}

export { transaction };
