'use client';

import { useState } from 'react';
import { isDemoMode } from '../../../lib/demoMode';

// API Key status type
type ApiKeyStatus = 'active' | 'revoked' | 'expired';

// API Key interface matching backend types
interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  projectId: string;
  name: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

// Mock data for demonstration (only used when DEMO_MODE is enabled)
const mockApiKeys: ApiKeyInfo[] = [
  {
    id: '1',
    keyPrefix: 'llmgw_ab',
    projectId: 'proj-1',
    name: 'Production API Key',
    createdAt: new Date('2024-11-15T10:30:00'),
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: new Date('2024-12-04T14:22:00'),
  },
  {
    id: '2',
    keyPrefix: 'llmgw_cd',
    projectId: 'proj-1',
    name: 'Development Key',
    createdAt: new Date('2024-11-20T09:15:00'),
    expiresAt: new Date('2025-02-20T09:15:00'),
    revokedAt: null,
    lastUsedAt: new Date('2024-12-03T16:45:00'),
  },
  {
    id: '3',
    keyPrefix: 'llmgw_ef',
    projectId: 'proj-1',
    name: 'Testing Key',
    createdAt: new Date('2024-10-01T14:00:00'),
    expiresAt: null,
    revokedAt: new Date('2024-11-30T12:00:00'),
    lastUsedAt: new Date('2024-11-28T10:30:00'),
  },
  {
    id: '4',
    keyPrefix: 'llmgw_gh',
    projectId: 'proj-1',
    name: null,
    createdAt: new Date('2024-09-15T08:00:00'),
    expiresAt: new Date('2024-11-15T08:00:00'),
    revokedAt: null,
    lastUsedAt: new Date('2024-11-10T09:00:00'),
  },
];


function getKeyStatus(key: ApiKeyInfo): ApiKeyStatus {
  if (key.revokedAt !== null) return 'revoked';
  if (key.expiresAt !== null && key.expiresAt < new Date()) return 'expired';
  return 'active';
}

function StatusBadge({ status }: { status: ApiKeyStatus }) {
  const styles = {
    active: 'bg-live-bg text-live border-live-border',
    revoked: 'bg-[rgba(255,77,77,0.15)] text-status-error border-[rgba(255,77,77,0.25)]',
    expired: 'bg-[rgba(255,176,32,0.15)] text-status-warning border-[rgba(255,176,32,0.25)]',
  };

  const labels = {
    active: 'Active',
    revoked: 'Revoked',
    expired: 'Expired',
  };

  const icons = {
    active: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
    revoked: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    ),
    expired: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
    ),
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-wide rounded-full border ${styles[status]}`}>
      {icons[status]}
      {labels[status]}
    </span>
  );
}

function formatDate(date: Date | null): string {
  if (!date) return '-';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatLastUsed(date: Date | null): string {
  if (!date) return 'Never';
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}


// Create API Key Modal Component
interface CreateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, expiresAt: Date | null) => void;
  createdKey: { key: string; name: string | null } | null;
}

function CreateKeyModal({ isOpen, onClose, onSave, createdKey }: CreateKeyModalProps) {
  const [name, setName] = useState('');
  const [hasExpiration, setHasExpiration] = useState(false);
  const [expirationDate, setExpirationDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    const expiresAt = hasExpiration && expirationDate 
      ? new Date(expirationDate) 
      : null;
    
    await new Promise(resolve => setTimeout(resolve, 500));
    onSave(name, expiresAt);
    setIsSaving(false);
  };

  const handleCopyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setName('');
    setHasExpiration(false);
    setExpirationDate('');
    setCopied(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-panel border border-border rounded-[12px] shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">
            {createdKey ? 'API Key Created' : 'Create API Key'}
          </h2>
          <button onClick={handleClose} className="p-1 text-text-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {createdKey ? (
          <div className="px-6 py-4 space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-yellow-400">
                  Copy this key now. You won&apos;t be able to see it again.
                </p>
              </div>
            </div>

            {createdKey.name && (
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Name</label>
                <p className="text-sm">{createdKey.name}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-muted mb-1">API Key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-background border border-border rounded-button px-3 py-2 text-sm font-mono break-all text-text-primary">
                  {createdKey.key}
                </code>
                <button
                  onClick={handleCopyKey}
                  className="flex-shrink-0 px-3 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">Name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Production API Key"
                  className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasExpiration}
                    onChange={(e) => setHasExpiration(e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-background text-accent focus:ring-accent"
                  />
                  <span className="text-sm">Set expiration date</span>
                </label>
              </div>

              {hasExpiration && (
                <div>
                  <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">Expiration Date</label>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              )}
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
                disabled={isSaving}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


// Revoke Confirmation Modal Component
interface RevokeModalProps {
  isOpen: boolean;
  keyName: string | null;
  keyPrefix: string;
  onClose: () => void;
  onConfirm: () => void;
  isRevoking: boolean;
}

function RevokeModal({ isOpen, keyName, keyPrefix, onClose, onConfirm, isRevoking }: RevokeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-panel border border-border rounded-[12px] shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-status-error">Revoke API Key</h2>
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
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-text-primary">
                Are you sure you want to revoke this API key? This action cannot be undone.
              </p>
              <div className="mt-2 bg-background/50 rounded-button p-2">
                <p className="text-sm font-medium text-text-primary">{keyName || 'Unnamed Key'}</p>
                <p className="text-xs text-text-muted font-mono">{keyPrefix}...</p>
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Any applications using this key will immediately lose access.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isRevoking}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRevoking}
            className="px-4 py-2 bg-status-error hover:bg-status-error/80 text-white rounded-button text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isRevoking ? 'Revoking...' : 'Revoke Key'}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function ApiKeysPage() {
  // Use mock data only in demo mode, otherwise start with empty array
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>(isDemoMode() ? mockApiKeys : []);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ key: string; name: string | null } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const handleCreateKey = () => {
    setCreatedKey(null);
    setIsCreateModalOpen(true);
  };

  const handleSaveKey = (name: string, expiresAt: Date | null) => {
    // Generate mock key - will be replaced with actual API call
    const mockKey = `llmgw_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    
    const newKey: ApiKeyInfo = {
      id: Date.now().toString(),
      keyPrefix: mockKey.slice(0, 8),
      projectId: 'proj-1',
      name: name || null,
      createdAt: new Date(),
      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
    };

    setApiKeys(prev => [newKey, ...prev]);
    setCreatedKey({ key: mockKey, name: name || null });
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreatedKey(null);
  };

  const handleRevokeClick = (key: ApiKeyInfo) => {
    setRevokeTarget(key);
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    
    setIsRevoking(true);
    // Simulate API call - will be replaced with actual API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setApiKeys(prev => prev.map(k => 
      k.id === revokeTarget.id 
        ? { ...k, revokedAt: new Date() }
        : k
    ));
    
    setIsRevoking(false);
    setRevokeTarget(null);
  };

  const handleCloseRevokeModal = () => {
    if (!isRevoking) {
      setRevokeTarget(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">API Keys</h1>
        <button
          onClick={handleCreateKey}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors"
        >
          Create API Key
        </button>
      </div>

      <div className="bg-panel rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Key</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Name</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Created</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Status</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Last Used</th>
              <th className="text-right px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((key) => {
              const status = getKeyStatus(key);
              return (
                <tr key={key.id} className="border-b border-border-subtle last:border-b-0 hover:bg-panel-hover transition-colors">
                  <td className="px-4 py-3">
                    <code className="text-sm font-mono text-accent">{key.keyPrefix}...</code>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={key.name ? 'text-text-primary' : 'text-text-muted italic'}>
                      {key.name || 'Unnamed'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {formatDate(key.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {formatLastUsed(key.lastUsedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      {status === 'active' && (
                        <button
                          onClick={() => handleRevokeClick(key)}
                          className="p-2 text-status-error hover:text-red-300 hover:bg-status-error/10 rounded-button transition-colors"
                          title="Revoke key"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {apiKeys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  No API keys created yet. Click &quot;Create API Key&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateKeyModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onSave={handleSaveKey}
        createdKey={createdKey}
      />

      <RevokeModal
        isOpen={revokeTarget !== null}
        keyName={revokeTarget?.name ?? null}
        keyPrefix={revokeTarget?.keyPrefix ?? ''}
        onClose={handleCloseRevokeModal}
        onConfirm={handleConfirmRevoke}
        isRevoking={isRevoking}
      />
    </div>
  );
}
