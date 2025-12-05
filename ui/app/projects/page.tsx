'use client';

import { useState } from 'react';
import { isDemoMode } from '../../lib/demoMode';

// Project interface
interface Project {
  id: string;
  name: string;
  description: string;
  apiKeyCount: number;
  tokenQuota: number;
  tokensUsed: number;
  createdAt: Date;
  status: 'active' | 'inactive';
}

// Mock data for demonstration (only used when DEMO_MODE is enabled)
const mockProjects: Project[] = [
  {
    id: '1',
    name: 'Production App',
    description: 'Main production application',
    apiKeyCount: 3,
    tokenQuota: 1000000,
    tokensUsed: 456789,
    createdAt: new Date('2024-11-01'),
    status: 'active',
  },
  {
    id: '2',
    name: 'Development',
    description: 'Development and testing environment',
    apiKeyCount: 5,
    tokenQuota: 500000,
    tokensUsed: 123456,
    createdAt: new Date('2024-11-15'),
    status: 'active',
  },
  {
    id: '3',
    name: 'Staging',
    description: 'Pre-production staging environment',
    apiKeyCount: 2,
    tokenQuota: 250000,
    tokensUsed: 0,
    createdAt: new Date('2024-12-01'),
    status: 'inactive',
  },
];

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  const styles = {
    active: 'bg-live-bg text-live border-live-border',
    inactive: 'bg-[rgba(255,255,255,0.1)] text-text-secondary border-border',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border ${styles[status]}`}>
      {status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-live shadow-live-glow" />}
      {status}
    </span>
  );
}

// Create/Edit Project Modal
function ProjectModal({ 
  isOpen, 
  onClose, 
  onSave, 
  editingProject 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (project: Partial<Project>) => void;
  editingProject: Project | null;
}) {
  const [name, setName] = useState(editingProject?.name || '');
  const [description, setDescription] = useState(editingProject?.description || '');
  const [tokenQuota, setTokenQuota] = useState(editingProject?.tokenQuota || 1000000);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, description, tokenQuota });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-panel border border-border rounded-[12px] w-full max-w-md shadow-xl">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">
            {editingProject ? 'Edit Project' : 'Create Project'}
          </h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter project name"
                className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter project description"
                rows={3}
                className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
              />
            </div>
            <div>
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">
                Monthly Token Quota
              </label>
              <input
                type="number"
                value={tokenQuota}
                onChange={(e) => setTokenQuota(parseInt(e.target.value, 10) || 0)}
                min={0}
                className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
              />
              <p className="text-xs text-text-muted mt-1">Set to 0 for unlimited</p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-transparent border border-border text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.05)] rounded-button text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors"
            >
              {editingProject ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  // Use mock data only in demo mode, otherwise start with empty array
  const [projects, setProjects] = useState<Project[]>(isDemoMode() ? mockProjects : []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const handleCreateProject = () => {
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setIsModalOpen(true);
  };

  const handleSaveProject = (projectData: Partial<Project>) => {
    if (editingProject) {
      setProjects(prev => prev.map(p =>
        p.id === editingProject.id ? { ...p, ...projectData } : p
      ));
    } else {
      const newProject: Project = {
        id: Date.now().toString(),
        name: projectData.name || '',
        description: projectData.description || '',
        apiKeyCount: 0,
        tokenQuota: projectData.tokenQuota || 1000000,
        tokensUsed: 0,
        createdAt: new Date(),
        status: 'active',
      };
      setProjects(prev => [...prev, newProject]);
    }
    setIsModalOpen(false);
    setEditingProject(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Projects</h1>
        <button
          onClick={handleCreateProject}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors"
        >
          Create Project
        </button>
      </div>

      <div className="bg-panel rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Project</th>
              <th className="text-left px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">API Keys</th>
              <th className="text-left px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Usage</th>
              <th className="text-right px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const usagePercent = project.tokenQuota > 0 
                ? Math.min((project.tokensUsed / project.tokenQuota) * 100, 100) 
                : 0;
              
              return (
                <tr key={project.id} className="border-b border-border-subtle last:border-b-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-text-primary">{project.name}</div>
                      <div className="text-xs text-text-muted">{project.description}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-sm">
                    {project.apiKeyCount} keys
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <div className="text-sm text-text-primary">
                        {formatNumber(project.tokensUsed)} / {project.tokenQuota > 0 ? formatNumber(project.tokenQuota) : '∞'}
                      </div>
                      {project.tokenQuota > 0 && (
                        <div className="w-24 h-1 bg-border rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-accent rounded-full transition-all"
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEditProject(project)}
                        className="p-2 text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.05)] rounded-button transition-colors"
                        title="Edit project"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No projects yet. Click "Create Project" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProjectModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProject(null);
        }}
        onSave={handleSaveProject}
        editingProject={editingProject}
      />
    </div>
  );
}
