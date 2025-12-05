'use client';

import { useState } from 'react';
import { isDemoMode } from '../../lib/demoMode';

// Model interface matching backend types
interface UnifiedModel {
  id: string;
  unifiedId: string;
  providerId: string;
  providerModelId: string;
  displayName: string | null;
  contextLength: number | null;
  aliases: string[];
}

// Mock data for demonstration (only used when DEMO_MODE is enabled)
const mockModels: UnifiedModel[] = [
  {
    id: '1',
    unifiedId: 'openai:gpt-4',
    providerId: 'openai',
    providerModelId: 'gpt-4',
    displayName: 'GPT-4',
    contextLength: 8192,
    aliases: ['gpt4', 'smart'],
  },
  {
    id: '2',
    unifiedId: 'openai:gpt-4-turbo',
    providerId: 'openai',
    providerModelId: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    contextLength: 128000,
    aliases: ['gpt4-turbo'],
  },
  {
    id: '3',
    unifiedId: 'openai:gpt-3.5-turbo',
    providerId: 'openai',
    providerModelId: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    contextLength: 16385,
    aliases: ['gpt35', 'fast'],
  },
  {
    id: '4',
    unifiedId: 'anthropic:claude-3-opus',
    providerId: 'anthropic',
    providerModelId: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    contextLength: 200000,
    aliases: ['opus', 'claude-opus'],
  },
  {
    id: '5',
    unifiedId: 'anthropic:claude-3-sonnet',
    providerId: 'anthropic',
    providerModelId: 'claude-3-sonnet-20240229',
    displayName: 'Claude 3 Sonnet',
    contextLength: 200000,
    aliases: [],
  },
  {
    id: '6',
    unifiedId: 'anthropic:claude-3-haiku',
    providerId: 'anthropic',
    providerModelId: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    contextLength: 200000,
    aliases: ['haiku'],
  },
];

// Get unique providers from models
function getUniqueProviders(models: UnifiedModel[]): string[] {
  return [...new Set(models.map(m => m.providerId))].sort();
}

// Format context length for display
function formatContextLength(length: number | null): string {
  if (length === null) return '-';
  if (length >= 1000) {
    return `${Math.round(length / 1000)}K`;
  }
  return length.toString();
}

// Provider badge component
function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    openai: 'bg-green-500/20 text-green-400 border-green-500/30',
    anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    azure: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    mistral: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    groq: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    cohere: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  };

  const colorClass = colors[provider] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded border ${colorClass}`}>
      {provider}
    </span>
  );
}

// Alias tag component
function AliasTag({ alias, onDelete }: { alias: string; onDelete?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-accent/20 text-accent border border-accent/30 rounded">
      {alias}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="hover:text-white transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}


// Create Alias Modal Component
interface CreateAliasModalProps {
  isOpen: boolean;
  model: UnifiedModel | null;
  onClose: () => void;
  onSave: (modelId: string, alias: string) => void;
}

function CreateAliasModal({ isOpen, model, onClose, onSave }: CreateAliasModalProps) {
  const [alias, setAlias] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model || !alias.trim()) return;

    // Validate alias format
    if (!/^[a-z][a-z0-9-]*$/.test(alias)) {
      setError('Alias must start with a letter and contain only lowercase letters, numbers, and hyphens');
      return;
    }

    setIsSaving(true);
    setError(null);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    onSave(model.id, alias);
    setIsSaving(false);
    setAlias('');
    onClose();
  };

  const handleClose = () => {
    setAlias('');
    setError(null);
    onClose();
  };

  if (!isOpen || !model) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-panel border border-border rounded-[12px] shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Create Alias</h2>
          <button onClick={handleClose} className="p-1 text-text-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">Model</label>
              <div className="flex items-center gap-2">
                <ProviderBadge provider={model.providerId} />
                <span className="text-sm text-text-primary">{model.displayName || model.providerModelId}</span>
              </div>
              <p className="text-xs text-text-muted mt-1 font-mono">{model.unifiedId}</p>
            </div>

            <div>
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">Alias Name</label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value.toLowerCase())}
                placeholder="e.g., fast, smart, default"
                className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                autoFocus
              />
              <p className="text-xs text-text-muted mt-1">
                Lowercase letters, numbers, and hyphens only. Must start with a letter.
              </p>
              {error && (
                <p className="text-xs text-status-error mt-1">{error}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !alias.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Creating...' : 'Create Alias'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete Alias Confirmation Modal
interface DeleteAliasModalProps {
  isOpen: boolean;
  alias: string;
  modelName: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

function DeleteAliasModal({ isOpen, alias, modelName, onClose, onConfirm, isDeleting }: DeleteAliasModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-panel border border-border rounded-[12px] shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-status-error">Delete Alias</h2>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-status-error/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-status-error" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-text-primary">
                Are you sure you want to delete the alias <span className="font-mono text-accent">{alias}</span>?
              </p>
              <p className="text-xs text-text-muted mt-2">
                This will remove the alias from <span className="font-medium text-text-primary">{modelName}</span>. 
                The underlying model will not be affected.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-status-error hover:bg-status-error/80 text-white rounded-button text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Alias'}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function ModelsPage() {
  // Use mock data only in demo mode, otherwise start with empty array
  const [models, setModels] = useState<UnifiedModel[]>(isDemoMode() ? mockModels : []);
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [createAliasModel, setCreateAliasModel] = useState<UnifiedModel | null>(null);
  const [deleteAliasTarget, setDeleteAliasTarget] = useState<{ modelId: string; alias: string; modelName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const providers = getUniqueProviders(models);

  // Filter models based on search and provider
  const filteredModels = models.filter(model => {
    // Provider filter
    if (providerFilter !== 'all' && model.providerId !== providerFilter) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesUnifiedId = model.unifiedId.toLowerCase().includes(query);
      const matchesDisplayName = model.displayName?.toLowerCase().includes(query);
      const matchesAlias = model.aliases.some(a => a.toLowerCase().includes(query));
      const matchesProvider = model.providerId.toLowerCase().includes(query);
      
      if (!matchesUnifiedId && !matchesDisplayName && !matchesAlias && !matchesProvider) {
        return false;
      }
    }

    return true;
  });

  const handleCreateAlias = (modelId: string, alias: string) => {
    setModels(prev => prev.map(m => 
      m.id === modelId 
        ? { ...m, aliases: [...m.aliases, alias] }
        : m
    ));
  };

  const handleDeleteAliasClick = (modelId: string, alias: string, modelName: string) => {
    setDeleteAliasTarget({ modelId, alias, modelName });
  };

  const handleConfirmDeleteAlias = async () => {
    if (!deleteAliasTarget) return;
    
    setIsDeleting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setModels(prev => prev.map(m => 
      m.id === deleteAliasTarget.modelId 
        ? { ...m, aliases: m.aliases.filter(a => a !== deleteAliasTarget.alias) }
        : m
    ));
    
    setIsDeleting(false);
    setDeleteAliasTarget(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Models</h1>
        <div className="text-sm text-text-muted">
          {filteredModels.length} of {models.length} models
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <svg 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by model name, ID, or alias..."
            className="w-full bg-background border border-border rounded-button pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
        >
          <option value="all">All Providers</option>
          {providers.map(provider => (
            <option key={provider} value={provider}>
              {provider.charAt(0).toUpperCase() + provider.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Models Table */}
      <div className="bg-panel rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Unified ID</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Provider</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Display Name</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Context</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Aliases</th>
              <th className="text-right px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredModels.map((model) => (
              <tr key={model.id} className="border-b border-border-subtle last:border-b-0 hover:bg-panel-hover transition-colors">
                <td className="px-4 py-3">
                  <code className="text-sm font-mono text-accent">{model.unifiedId}</code>
                </td>
                <td className="px-4 py-3">
                  <ProviderBadge provider={model.providerId} />
                </td>
                <td className="px-4 py-3">
                  <span className={model.displayName ? 'text-text-primary' : 'text-text-muted italic'}>
                    {model.displayName || model.providerModelId}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-text-muted">
                  {formatContextLength(model.contextLength)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {model.aliases.length > 0 ? (
                      model.aliases.map(alias => (
                        <AliasTag 
                          key={alias} 
                          alias={alias} 
                          onDelete={() => handleDeleteAliasClick(model.id, alias, model.displayName || model.providerModelId)}
                        />
                      ))
                    ) : (
                      <span className="text-xs text-text-muted italic">No aliases</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => setCreateAliasModel(model)}
                      className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-button transition-colors"
                      title="Add alias"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredModels.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  {searchQuery || providerFilter !== 'all' 
                    ? 'No models match your search criteria.'
                    : 'No models available. Configure a provider to fetch models.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Alias Modal */}
      <CreateAliasModal
        isOpen={createAliasModel !== null}
        model={createAliasModel}
        onClose={() => setCreateAliasModel(null)}
        onSave={handleCreateAlias}
      />

      {/* Delete Alias Modal */}
      <DeleteAliasModal
        isOpen={deleteAliasTarget !== null}
        alias={deleteAliasTarget?.alias ?? ''}
        modelName={deleteAliasTarget?.modelName ?? ''}
        onClose={() => setDeleteAliasTarget(null)}
        onConfirm={handleConfirmDeleteAlias}
        isDeleting={isDeleting}
      />
    </div>
  );
}
