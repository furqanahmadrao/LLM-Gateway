'use client';

import { useState, useEffect } from 'react';
import { isDemoMode } from '../../../lib/demoMode';

// API Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Model interface matching backend types for grouped models
interface ModelProviderEntry {
  providerDbId: string;
  providerId: string;
  providerModelId: string;
  unifiedId: string;
  contextLength: number | null;
  status: 'active' | 'error' | 'disabled';
  priority: number;
  aliases: string[]; // Aliases directly on the provider entry for convenience
}

interface MultiProviderModel {
  canonicalName: string;
  displayName: string | null;
  description: string | null;
  providers: ModelProviderEntry[];
}

// Mock data for demonstration (only used when DEMO_MODE is enabled)
const mockGroupedModels: MultiProviderModel[] = [
  {
    canonicalName: 'gpt-4',
    displayName: 'GPT-4 Series',
    description: 'Advanced reasoning, complex instructions, and creativity.',
    providers: [
      {
        providerDbId: 'openai-db-id-1',
        providerId: 'openai',
        providerModelId: 'gpt-4',
        unifiedId: 'openai:gpt-4',
        contextLength: 8192,
        status: 'active',
        priority: 1,
        aliases: ['gpt4', 'smart'],
      },
      {
        providerDbId: 'azure-db-id-1',
        providerId: 'azure',
        providerModelId: 'gpt-4-azure',
        unifiedId: 'azure:gpt-4-azure',
        contextLength: 8192,
        status: 'active',
        priority: 2,
        aliases: ['gpt4-azure'],
      },
    ],
  },
  {
    canonicalName: 'claude-3-opus',
    displayName: 'Claude 3 Opus',
    description: 'Most powerful model for highly complex tasks.',
    providers: [
      {
        providerDbId: 'anthropic-db-id-1',
        providerId: 'anthropic',
        providerModelId: 'claude-3-opus-20240229',
        unifiedId: 'anthropic:claude-3-opus-20240229',
        contextLength: 200000,
        status: 'active',
        priority: 1,
        aliases: ['opus', 'claude-opus'],
      },
    ],
  },
  {
    canonicalName: 'llama-2-70b',
    displayName: 'Llama 2 70B',
    description: 'Meta\'s open-source large language model.',
    providers: [
      {
        providerDbId: 'groq-db-id-1',
        providerId: 'groq',
        providerModelId: 'llama2-70b-4096',
        unifiedId: 'groq:llama2-70b-4096',
        contextLength: 4096,
        status: 'active',
        priority: 1,
        aliases: [],
      },
      {
        providerDbId: 'custom-ollama-db-id-1',
        providerId: 'custom',
        providerModelId: 'ollama/llama2',
        unifiedId: 'custom:ollama/llama2',
        contextLength: 4096,
        status: 'active',
        priority: 2,
        aliases: ['ollama-llama'],
      },
    ],
  },
];

// Format context length for display
function formatContextLength(length: number | null): string {
  if (length === null) return '-';
  if (length >= 1_000_000) return `${Math.round(length / 1_000_000)}M`;
  if (length >= 1000) return `${Math.round(length / 1000)}K`;
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
    custom: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    // Add more providers as needed
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
  providerEntry: ModelProviderEntry | null; // Changed to providerEntry
  onClose: () => void;
  onSave: (providerEntryId: string, alias: string) => void;
}

function CreateAliasModal({ isOpen, providerEntry, onClose, onSave }: CreateAliasModalProps) {
  const [alias, setAlias] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerEntry || !alias.trim()) return;

    // Validate alias format
    if (!/^[a-z][a-z0-9-]*$/.test(alias)) {
      setError('Alias must start with a letter and contain only lowercase letters, numbers, and hyphens');
      return;
    }

    setIsSaving(true);
    setError(null);
    
    try {
        const res = await fetch(`${API_URL}/api/models/${providerEntry.providerDbId}/aliases`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Assuming an auth token is managed in the client side, e.g., via a context or a higher-order component
                // For now, this is a placeholder. In a real app, you'd get this from a secure cookie or local storage.
                // 'Authorization': `Bearer ${AUTH_TOKEN}` 
            },
            body: JSON.stringify({ alias }),
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error?.message || 'Failed to create alias');
        }

        onSave(providerEntry.unifiedId, alias); // Use unifiedId to update UI
        setAlias('');
        onClose();
    } catch (err: any) {
        setError(err.message);
    } finally {
        setIsSaving(false);
    }
  };

  const handleClose = () => {
    setAlias('');
    setError(null);
    onClose();
  };

  if (!isOpen || !providerEntry) return null;

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
              <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">Model Instance</label>
              <div className="flex items-center gap-2">
                <ProviderBadge provider={providerEntry.providerId} />
                <span className="text-sm text-text-primary">{providerEntry.providerModelId}</span>
              </div>
              <p className="text-xs text-text-muted mt-1 font-mono">{providerEntry.unifiedId}</p>
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
  modelUnifiedId: string; // Use unifiedId for clarity
  onClose: () => void;
  onConfirm: (alias: string) => void;
  isDeleting: boolean;
}

function DeleteAliasModal({ isOpen, alias, modelUnifiedId, onClose, onConfirm, isDeleting }: DeleteAliasModalProps) {
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
                This will remove the alias for model <span className="font-medium text-text-primary">{modelUnifiedId}</span>. 
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
            onClick={() => onConfirm(alias)} // Pass alias to confirm handler
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
  const [groupedModels, setGroupedModels] = useState<MultiProviderModel[]>(isDemoMode() ? mockGroupedModels : []);
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [createAliasEntry, setCreateAliasEntry] = useState<ModelProviderEntry | null>(null); // To store which specific provider entry an alias is being created for
  const [deleteAliasTarget, setDeleteAliasTarget] = useState<{ aliasId: string; unifiedId: string; alias: string } | null>(null); // Storing aliasId from DB
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch grouped models from API
  useEffect(() => {
    async function fetchGroupedModels() {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/models/grouped`, {
          headers: {
            // Need to pass session token for auth here
            // 'Authorization': `Bearer ${SESSION_TOKEN}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setGroupedModels(data);
        } else {
          console.error('Failed to fetch grouped models:', res.statusText);
        }
      } catch (error) {
        console.error('Error fetching grouped models:', error);
      } finally {
        setIsLoading(false);
      }
    }
    if (!isDemoMode()) {
        fetchGroupedModels();
    }
  }, []);

  const allProviders = Array.from(new Set(groupedModels.flatMap(group => group.providers.map(p => p.providerId)))).sort();

  const handleCreateAlias = async (modelDbId: string, newAlias: string) => {
    // This is fired from the modal's onSave, but the API call is now inside the modal.
    // We just need to update local state if successful.
    setGroupedModels(prevGroups => prevGroups.map(group => ({
      ...group,
      providers: group.providers.map(provider => 
        provider.providerDbId === modelDbId 
          ? { ...provider, aliases: [...new Set([...provider.aliases, newAlias])] } // Add unique alias
          : provider
      ),
    })));
  };

  const handleDeleteAliasClick = (aliasId: string, unifiedId: string, alias: string) => {
    setDeleteAliasTarget({ aliasId, unifiedId, alias });
  };

  const handleConfirmDeleteAlias = async (aliasToDelete: string) => {
    if (!deleteAliasTarget) return;
    
    setIsDeleting(true);
    
    try {
        const res = await fetch(`${API_URL}/api/aliases/${deleteAliasTarget.aliasId}`, {
            method: 'DELETE',
            headers: {
                // 'Authorization': `Bearer ${AUTH_TOKEN}`
            },
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error?.message || 'Failed to delete alias');
        }

        // Update local state to remove the alias
        setGroupedModels(prevGroups => prevGroups.map(group => ({
            ...group,
            providers: group.providers.map(provider => 
                provider.unifiedId === deleteAliasTarget.unifiedId
                    ? { ...provider, aliases: provider.aliases.filter(a => a !== aliasToDelete) }
                    : provider
            ),
        })));

        setDeleteAliasTarget(null);
    } catch (err: any) {
        console.error('Error deleting alias:', err);
        alert(`Failed to delete alias: ${err.message}`);
    } finally {
        setIsDeleting(false);
    }
  };

  // Filter grouped models based on search and provider
  const filteredGroupedModels = groupedModels.filter(group => {
    // Provider filter - check if any provider in the group matches the filter
    if (providerFilter !== 'all' && !group.providers.some(p => p.providerId === providerFilter)) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesCanonicalName = group.canonicalName.toLowerCase().includes(query);
      const matchesDisplayName = group.displayName?.toLowerCase().includes(query);
      const matchesDescription = group.description?.toLowerCase().includes(query);
      const matchesProviderModelId = group.providers.some(p => p.providerModelId.toLowerCase().includes(query));
      const matchesUnifiedId = group.providers.some(p => p.unifiedId.toLowerCase().includes(query));
      const matchesProviderId = group.providers.some(p => p.providerId.toLowerCase().includes(query));
      const matchesAlias = group.providers.some(p => p.aliases.some(a => a.toLowerCase().includes(query)));
      
      if (!matchesCanonicalName && !matchesDisplayName && !matchesDescription && !matchesProviderModelId && !matchesUnifiedId && !matchesProviderId && !matchesAlias) {
        return false;
      }
    }

    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Models</h1>
        <div className="text-sm text-text-muted">
          {filteredGroupedModels.length} model families
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
            placeholder="Search by model family, provider, or alias..."
            className="w-full bg-background border border-border rounded-button pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
        >
          <option value="all">All Providers</option>
          {allProviders.map(provider => (
            <option key={provider} value={provider}>
              {provider.charAt(0).toUpperCase() + provider.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && !isDemoMode() ? (
        <div className="text-center py-8 text-text-muted">Loading models...</div>
      ) : filteredGroupedModels.length === 0 ? (
        <div className="text-center py-8 text-text-muted">
          {searchQuery || providerFilter !== 'all' 
            ? 'No models match your search criteria.'
            : 'No models available. Configure a provider to fetch models.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroupedModels.map(modelGroup => (
            <div key={modelGroup.canonicalName} className="bg-panel rounded-card border border-border p-6 flex flex-col">
              <h2 className="text-heading text-text-primary mb-2">{modelGroup.displayName || modelGroup.canonicalName}</h2>
              {modelGroup.description && (
                <p className="text-sm text-text-secondary mb-4 flex-grow">{modelGroup.description}</p>
              )}

              <div className="space-y-4 mt-auto"> {/*push providers to bottom */} 
                {modelGroup.providers.map(providerEntry => (
                  <div key={providerEntry.unifiedId} className="bg-background border border-border-subtle rounded-button p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ProviderBadge provider={providerEntry.providerId} />
                        <span className="text-sm text-text-primary font-medium">{providerEntry.providerModelId}</span>
                      </div>
                      <div className="text-xs text-text-muted">
                        Context: {formatContextLength(providerEntry.contextLength)}
                      </div>
                    </div>
                    <code className="block text-xs font-mono text-text-muted mb-2 break-all">{providerEntry.unifiedId}</code>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {providerEntry.aliases.length > 0 ? (
                        providerEntry.aliases.map(alias => (
                          <AliasTag 
                            key={alias} 
                            alias={alias} 
                            onDelete={() => handleDeleteAliasClick('placeholder-alias-id', providerEntry.unifiedId, alias)} // TODO: Pass real alias ID
                          />
                        ))
                      ) : (
                        <span className="text-xs text-text-muted italic">No aliases</span>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => setCreateAliasEntry(providerEntry)}
                        className="px-3 py-1 text-xs text-accent hover:text-accent-hover hover:bg-accent/10 rounded-button transition-colors flex items-center gap-1"
                        title="Add alias"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Alias
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Alias Modal */}
      <CreateAliasModal
        isOpen={createAliasEntry !== null}
        providerEntry={createAliasEntry}
        onClose={() => setCreateAliasEntry(null)}
        onSave={handleCreateAlias}
      />

      {/* Delete Alias Modal */}
      <DeleteAliasModal
        isOpen={deleteAliasTarget !== null}
        alias={deleteAliasTarget?.alias ?? ''}
        modelUnifiedId={deleteAliasTarget?.unifiedId ?? ''}
        onClose={() => setDeleteAliasTarget(null)}
        onConfirm={handleConfirmDeleteAlias}
        isDeleting={isDeleting}
      />
    </div>
  );
}