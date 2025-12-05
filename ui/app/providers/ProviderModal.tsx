'use client';

import { useState, useEffect } from 'react';

// Provider template interface matching the backend
interface ProviderTemplate {
  id: string;
  displayName: string;
  authType: 'api_key' | 'oauth' | 'aws_sigv4' | 'none';
  authInstructions: string;
  baseUrl: string;
}

// Available provider templates - matches backend templates
const providerTemplates: ProviderTemplate[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    authType: 'api_key',
    authInstructions: 'Enter your OpenAI API key from https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com',
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    authType: 'api_key',
    authInstructions: 'Enter your Anthropic API key from https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com',
  },
  {
    id: 'azure',
    displayName: 'Azure OpenAI',
    authType: 'api_key',
    authInstructions: 'Enter your Azure OpenAI API key and configure your resource endpoint',
    baseUrl: 'https://{{resource_name}}.openai.azure.com',
  },
  {
    id: 'mistral',
    displayName: 'Mistral AI',
    authType: 'api_key',
    authInstructions: 'Enter your Mistral API key from https://console.mistral.ai/api-keys',
    baseUrl: 'https://api.mistral.ai',
  },
  {
    id: 'groq',
    displayName: 'Groq',
    authType: 'api_key',
    authInstructions: 'Enter your Groq API key from https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai',
  },
  {
    id: 'cohere',
    displayName: 'Cohere',
    authType: 'api_key',
    authInstructions: 'Enter your Cohere API key from https://dashboard.cohere.com/api-keys',
    baseUrl: 'https://api.cohere.ai',
  },
];


// Credential field configuration based on provider
interface CredentialField {
  name: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  required: boolean;
}

function getCredentialFields(providerId: string): CredentialField[] {
  switch (providerId) {
    case 'azure':
      return [
        { name: 'api_key', label: 'API Key', type: 'password', placeholder: 'Enter your Azure OpenAI API key', required: true },
        { name: 'resource_name', label: 'Resource Name', type: 'text', placeholder: 'your-resource-name', required: true },
        { name: 'deployment_id', label: 'Default Deployment ID', type: 'text', placeholder: 'gpt-4', required: false },
      ];
    default:
      return [
        { name: 'api_key', label: 'API Key', type: 'password', placeholder: 'Enter your API key', required: true },
      ];
  }
}

interface ProviderConfig {
  id: string;
  providerId: string;
  displayName: string;
  status: 'active' | 'error' | 'disabled';
  lastSyncAt: Date | null;
  lastError: string | null;
  modelCount: number;
}

interface ProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (providerId: string, credentials: Record<string, string>) => void;
  editingProvider: ProviderConfig | null;
}

export default function ProviderModal({ isOpen, onClose, onSave, editingProvider }: ProviderModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [showCredentials, setShowCredentials] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens/closes or editing provider changes
  useEffect(() => {
    if (isOpen) {
      if (editingProvider) {
        setSelectedProvider(editingProvider.providerId);
        // When editing, credentials are masked - user must re-enter
        setCredentials({});
      } else {
        setSelectedProvider('');
        setCredentials({});
      }
      setShowCredentials({});
    }
  }, [isOpen, editingProvider]);

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    setCredentials({});
    setShowCredentials({});
  };

  const handleCredentialChange = (fieldName: string, value: string) => {
    setCredentials(prev => ({ ...prev, [fieldName]: value }));
  };

  const toggleCredentialVisibility = (fieldName: string) => {
    setShowCredentials(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    onSave(selectedProvider, credentials);
    setIsSaving(false);
  };

  const selectedTemplate = providerTemplates.find(t => t.id === selectedProvider);
  const credentialFields = selectedProvider ? getCredentialFields(selectedProvider) : [];

  // Check if form is valid
  const isFormValid = selectedProvider && credentialFields
    .filter(f => f.required)
    .every(f => credentials[f.name]?.trim());

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-panel border border-border rounded-[12px] shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">
            {editingProvider ? 'Edit Provider' : 'Add Provider'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* Provider Selection */}
            {!editingProvider && (
              <div>
                <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">Provider</label>
                <select
                  value={selectedProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="">Select a provider...</option>
                  {providerTemplates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Provider Info */}
            {selectedTemplate && (
              <div className="bg-background/50 rounded-button p-3 text-sm">
                <p className="text-text-muted">{selectedTemplate.authInstructions}</p>
              </div>
            )}

            {/* Credential Fields */}
            {credentialFields.map(field => (
              <div key={field.name}>
                <label className="block text-label uppercase text-text-muted font-medium tracking-wide mb-2">
                  {field.label}
                  {field.required && <span className="text-status-error ml-1">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={showCredentials[field.name] ? 'text' : field.type}
                    value={credentials[field.name] || ''}
                    onChange={(e) => handleCredentialChange(field.name, e.target.value)}
                    placeholder={editingProvider ? '••••••••••••' : field.placeholder}
                    className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors pr-10"
                  />
                  {field.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => toggleCredentialVisibility(field.name)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-white"
                    >
                      {showCredentials[field.name] ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Edit mode notice */}
            {editingProvider && (
              <p className="text-xs text-text-muted">
                Leave credential fields empty to keep existing values.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!editingProvider && !isFormValid || isSaving}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : editingProvider ? 'Update' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
