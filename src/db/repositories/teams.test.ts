import { describe, it, expect, afterAll, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import {
  createTeam,
  getTeamById,
  deleteTeam,
  createProject,
  getProjectById,
  getProjectsByTeamId,
  addTeamMember,
  getTeamMember,
  removeTeamMember,
  isTeamMember,
} from './teams.js';
import { createApiKey, validateApiKey } from '../../services/auth.js';
import { closePool } from '../pool.js';

// Skip tests if no database connection
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

skipIfNoDb('Team Repository', () => {
  // Track created resources for cleanup
  const createdTeamIds: string[] = [];

  afterEach(async () => {
    // Clean up created teams (cascades to projects)
    for (const id of createdTeamIds) {
      try {
        await deleteTeam(id);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdTeamIds.length = 0;
  });

  afterAll(async () => {
    await closePool();
  });

  /**
   * **Feature: llm-gateway, Property 20: Team Isolation**
   * 
   * *For any* two different teams, resources (projects, credentials, aliases) 
   * created in one team SHALL NOT be accessible from the other team.
   * 
   * **Validates: Requirements 8.1, 8.3**
   */
  it('Property 20: Team Isolation - projects in one team are not accessible from another team', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two unique team names
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
        ).filter(([a, b]) => a !== b),
        // Generate a project name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async ([teamName1, teamName2], projectName) => {
          // Create unique team names to avoid conflicts
          const uniqueTeamName1 = `${teamName1}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const uniqueTeamName2 = `${teamName2}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          // Create two teams
          const team1 = await createTeam(uniqueTeamName1);
          createdTeamIds.push(team1.id);
          
          const team2 = await createTeam(uniqueTeamName2);
          createdTeamIds.push(team2.id);

          // Create a project in team1
          const uniqueProjectName = `${projectName}_${Date.now()}`;
          const project = await createProject(team1.id, uniqueProjectName);

          // Verify project belongs to team1
          const team1Projects = await getProjectsByTeamId(team1.id);
          expect(team1Projects.some(p => p.id === project.id)).toBe(true);

          // Verify project is NOT accessible from team2
          const team2Projects = await getProjectsByTeamId(team2.id);
          expect(team2Projects.some(p => p.id === project.id)).toBe(false);

          // Verify project's teamId matches team1
          const fetchedProject = await getProjectById(project.id);
          expect(fetchedProject?.teamId).toBe(team1.id);
          expect(fetchedProject?.teamId).not.toBe(team2.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 20: Team Isolation - teams have isolated namespaces', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (baseName) => {
          const uniqueName1 = `${baseName}_${Date.now()}_a`;
          const uniqueName2 = `${baseName}_${Date.now()}_b`;

          // Create two teams
          const team1 = await createTeam(uniqueName1);
          createdTeamIds.push(team1.id);
          
          const team2 = await createTeam(uniqueName2);
          createdTeamIds.push(team2.id);

          // Teams should have different IDs
          expect(team1.id).not.toBe(team2.id);

          // Each team should only be accessible by its own ID
          const fetchedTeam1 = await getTeamById(team1.id);
          const fetchedTeam2 = await getTeamById(team2.id);

          expect(fetchedTeam1?.id).toBe(team1.id);
          expect(fetchedTeam2?.id).toBe(team2.id);
          expect(fetchedTeam1?.id).not.toBe(team2.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: llm-gateway, Property 21: Project-Team Association**
   * 
   * *For any* project, the project SHALL belong to exactly one team and 
   * API keys created for it SHALL inherit the team context.
   * 
   * **Validates: Requirements 8.2**
   */
  it('Property 21: Project-Team Association - projects belong to exactly one team and API keys inherit team context', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (teamName, projectName) => {
          // Create unique names to avoid conflicts
          const uniqueTeamName = `${teamName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const uniqueProjectName = `${projectName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          // Create a team
          const team = await createTeam(uniqueTeamName);
          createdTeamIds.push(team.id);

          // Create a project in the team
          const project = await createProject(team.id, uniqueProjectName);

          // Verify project belongs to exactly one team
          const fetchedProject = await getProjectById(project.id);
          expect(fetchedProject).not.toBeNull();
          expect(fetchedProject!.teamId).toBe(team.id);

          // Create an API key for the project
          const apiKeyResult = await createApiKey(project.id, 'test-key');

          // Validate the API key and check it inherits team context
          const context = await validateApiKey(apiKeyResult.key);
          expect(context).not.toBeNull();
          expect(context!.projectId).toBe(project.id);
          expect(context!.teamId).toBe(team.id);

          // Verify the project appears in the team's project list
          const teamProjects = await getProjectsByTeamId(team.id);
          expect(teamProjects.some(p => p.id === project.id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: llm-gateway, Property 32: Member Removal Access Revocation**
   * 
   * *For any* removed team member, subsequent access attempts SHALL be denied.
   * 
   * **Validates: Requirements 18.4**
   */
  it('Property 32: Member Removal Access Revocation - removed members cannot access team', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.includes('@') || s.trim().length > 0),
        fc.constantFrom('admin', 'member', 'viewer') as fc.Arbitrary<'admin' | 'member' | 'viewer'>,
        async (teamName, email, role) => {
          // Create unique team name
          const uniqueTeamName = `${teamName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const userId = uuidv4();
          const memberEmail = email.includes('@') ? email : `${email}@test.com`;

          // Create a team
          const team = await createTeam(uniqueTeamName);
          createdTeamIds.push(team.id);

          // Add a member to the team
          const member = await addTeamMember(team.id, userId, memberEmail, 'Test User', role);
          expect(member).not.toBeNull();
          expect(member.teamId).toBe(team.id);
          expect(member.userId).toBe(userId);

          // Verify member exists and has access
          const memberBefore = await getTeamMember(team.id, userId);
          expect(memberBefore).not.toBeNull();
          expect(await isTeamMember(team.id, userId)).toBe(true);

          // Remove the member
          const removed = await removeTeamMember(team.id, userId);
          expect(removed).toBe(true);

          // Verify member no longer has access
          const memberAfter = await getTeamMember(team.id, userId);
          expect(memberAfter).toBeNull();
          expect(await isTeamMember(team.id, userId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
