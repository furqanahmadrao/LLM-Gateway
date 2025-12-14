'use client';

import { useState, useEffect } from 'react';
import ProviderModal from './ProviderModal';
import { isDemoMode } from '../../../lib/demoMode';

// API Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || '';

// Provider status type
type ProviderStatus = 'active' | 'error' | 'disabled';

// Provider configuration with status
interface ProviderConfig {
  id: string;
  providerId: string;
  displayName: string;
  status: ProviderStatus;
  lastSyncAt: Date | null;
  lastError: string | null;
  modelCount: number;
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  const styles = {
    active: 'bg-live-bg text-live border-live-border',
    error: 'bg-status-error/15 text-status-error border-status-error/25',
    disabled: 'bg-[rgba(255,255,255,0.1)] text-text-secondary border-border',
  };

  const labels = {
    active: 'Active',
    error: 'Error',
    disabled: 'Disabled',
  };

  const icons = {
    active: (
      <span className="w-1.5 h-1.5 rounded-full bg-live shadow-live-glow" />
    ),
    error: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    disabled: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border ${styles[status]}`}>
      {icons[status]}
      {labels[status]}
    </span>
  );
}

// Error alert component for displaying sync errors
function SyncErrorAlert({ error, onRetry, isRetrying }: { error: string; onRetry: () => void; isRetrying: boolean }) {
  return (
    <div className="flex items-start gap-3 bg-status-error/10 border border-status-error/25 rounded-button p-3">
      <svg className="w-5 h-5 text-status-error flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-status-error font-medium">Sync Failed</p>
        <p className="text-xs text-status-error/80 mt-0.5 break-words">{error}</p>
      </div>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="flex-shrink-0 px-3 py-1.5 bg-status-error/15 hover:bg-status-error/25 text-status-error border border-status-error/25 rounded-button text-xs font-medium transition-colors disabled:opacity-50"
      >
        {isRetrying ? 'Retrying...' : 'Retry'}
      </button>
    </div>
  );
}


function formatLastSync(dateStr: Date | string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchProviders() {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/credentials`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleAddProvider = () => {
    setEditingProvider(null);
    setIsModalOpen(true);
  };

  const handleEditProvider = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    setIsModalOpen(true);
  };

  const handleSync = async (providerId: string) => {
    setSyncingId(providerId);
    try {
      const res = await fetch(`${API_URL}/api/providers/${providerId}/refresh-models`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ADMIN_API_KEY}`
        }
      });
      if (res.ok) {
        await fetchProviders();
      }
    } catch (error) {
      console.error('Failed to sync provider:', error);
    } finally {
      setSyncingId(null);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingProvider(null);
  };

  const handleSaveProvider = async (providerId: string, credentials: Record<string, string>) => {
    try {
      const res = await fetch(`${API_URL}/api/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ADMIN_API_KEY}`
        },
        body: JSON.stringify({
          providerId,
          credentials
        })
      });

      if (!res.ok) {
        throw new Error('Failed to save credentials');
      }

      await fetchProviders();
      handleModalClose();
    } catch (error) {
      console.error('Error saving provider:', error);
      alert('Failed to save provider. Please try again.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Providers</h1>
        <button
          onClick={handleAddProvider}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors"
        >
          Add Provider
        </button>
      </div>

      <div className="bg-panel rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Provider</th>
              <th className="text-left px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Models</th>
              <th className="text-left px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Last Sync</th>
              <th className="text-right px-4 py-3 text-label uppercase text-text-muted font-medium tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && providers.length === 0 ? (
               <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  Loading providers...
                </td>
              </tr>
            ) : providers.map((provider) => (
              <>
                <tr key={provider.id} className="border-b border-border-subtle last:border-b-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-button flex items-center justify-center ${
                        provider.status === 'error' ? 'bg-status-error/15' : 'bg-accent-muted'
                      }`}>
                        <span className={`text-sm font-bold ${
                          provider.status === 'error' ? 'text-status-error' : 'text-accent'
                        }`}>
                          {provider.displayName.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-text-primary">{provider.displayName}</div>
                        <div className="text-xs text-text-muted">{provider.providerId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={provider.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-sm">
                    {provider.modelCount} models
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-sm">
                    {formatLastSync(provider.lastSyncAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSync(provider.providerId)}
                        disabled={syncingId === provider.providerId}
                        className={`p-2 rounded-button transition-colors disabled:opacity-50 ${
                          provider.status === 'error' 
                            ? 'text-status-error hover:text-status-error hover:bg-status-error/10' 
                            : 'text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.05)]'
                        }`}
                        title={provider.status === 'error' ? 'Retry sync' : 'Sync models'}
                      >
                        <svg 
                          className={`w-4 h-4 ${syncingId === provider.providerId ? 'animate-spin' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleEditProvider(provider)}
                        className="p-2 text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.05)] rounded-button transition-colors"
                        title="Edit provider"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
                {/* Error row - shown when provider has sync error */}
                {provider.status === 'error' && provider.lastError && (
                  <tr key={`${provider.id}-error`} className="border-b border-border-subtle">
                    <td colSpan={5} className="px-4 py-2">
                      <SyncErrorAlert 
                        error={provider.lastError} 
                        onRetry={() => handleSync(provider.providerId)}
                        isRetrying={syncingId === provider.providerId}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!isLoading && providers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No providers configured. Click "Add Provider" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProviderModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleSaveProvider}
        editingProvider={editingProvider}
      />
    </div>
  );
}
