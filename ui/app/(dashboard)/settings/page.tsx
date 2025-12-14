'use client';

import { useState } from 'react';

// Settings interface
interface GatewaySettings {
  rateLimitRpm: number;
  modelCacheTtl: number;
  defaultQuota: number;
  enableMetrics: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// Default settings
const defaultSettings: GatewaySettings = {
  rateLimitRpm: 60,
  modelCacheTtl: 3600,
  defaultQuota: 1000000,
  enableMetrics: true,
  logLevel: 'info',
};

// Setting card component
interface SettingCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingCard({ title, description, children }: SettingCardProps) {
  return (
    <div className="bg-panel rounded-card border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
        <div className="flex-shrink-0">
          {children}
        </div>
      </div>
    </div>
  );
}

// Number input with unit
interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  className?: string;
}

function NumberInput({ value, onChange, min = 0, max, unit, className = '' }: NumberInputProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const newValue = parseInt(e.target.value, 10);
          if (!isNaN(newValue)) {
            if (min !== undefined && newValue < min) return;
            if (max !== undefined && newValue > max) return;
            onChange(newValue);
          }
        }}
        min={min}
        max={max}
        className="w-24 bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary text-right focus:outline-none focus:border-accent transition-colors"
      />
      {unit && <span className="text-sm text-text-muted">{unit}</span>}
    </div>
  );
}

// Toggle switch component
interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function ToggleSwitch({ enabled, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-accent' : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// Select dropdown component
interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function Select({ value, onChange, options }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}


export default function SettingsPage() {
  const [settings, setSettings] = useState<GatewaySettings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const updateSetting = <K extends keyof GatewaySettings>(key: K, value: GatewaySettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In real implementation, this would call the API
    setIsSaving(false);
    setHasChanges(false);
    setSaveMessage({ type: 'success', text: 'Settings saved successfully' });
    
    // Clear success message after 3 seconds
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setHasChanges(false);
    setSaveMessage(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className={`text-sm ${saveMessage.type === 'success' ? 'text-live' : 'text-status-error'}`}>
              {saveMessage.text}
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#0A0A0A] rounded-button text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Rate Limiting Section */}
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-4">Rate Limiting</h2>
          <div className="space-y-4">
            <SettingCard
              title="Default Rate Limit"
              description="Maximum number of requests per minute for each API key. Individual keys can override this value."
            >
              <NumberInput
                value={settings.rateLimitRpm}
                onChange={(value) => updateSetting('rateLimitRpm', value)}
                min={1}
                max={10000}
                unit="RPM"
              />
            </SettingCard>

            <SettingCard
              title="Default Token Quota"
              description="Default monthly token quota for new projects. Set to 0 for unlimited."
            >
              <NumberInput
                value={settings.defaultQuota}
                onChange={(value) => updateSetting('defaultQuota', value)}
                min={0}
                unit="tokens"
              />
            </SettingCard>
          </div>
        </div>

        {/* Caching Section */}
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-4">Caching</h2>
          <div className="space-y-4">
            <SettingCard
              title="Model Cache TTL"
              description="How long to cache the model list from providers before refreshing. Lower values mean more frequent API calls to providers."
            >
              <NumberInput
                value={settings.modelCacheTtl}
                onChange={(value) => updateSetting('modelCacheTtl', value)}
                min={60}
                max={86400}
                unit="seconds"
              />
            </SettingCard>

            <div className="bg-panel rounded-card border border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-text-primary mb-1">Cache TTL Presets</h3>
                  <p className="text-xs text-text-muted mb-3">Quick presets for common cache durations</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '5 min', value: 300 },
                      { label: '15 min', value: 900 },
                      { label: '1 hour', value: 3600 },
                      { label: '6 hours', value: 21600 },
                      { label: '24 hours', value: 86400 },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => updateSetting('modelCacheTtl', preset.value)}
                        className={`px-3 py-1.5 text-xs rounded-button border transition-colors ${
                          settings.modelCacheTtl === preset.value
                            ? 'bg-accent border-accent text-[#0A0A0A] font-medium'
                            : 'bg-background border-border text-text-secondary hover:text-text-primary hover:border-accent'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Observability Section */}
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-4">Observability</h2>
          <div className="space-y-4">
            <SettingCard
              title="Enable Metrics"
              description="Expose Prometheus metrics at /metrics endpoint for monitoring request counts, latencies, and error rates."
            >
              <ToggleSwitch
                enabled={settings.enableMetrics}
                onChange={(value) => updateSetting('enableMetrics', value)}
              />
            </SettingCard>

            <SettingCard
              title="Log Level"
              description="Minimum log level for structured JSON logging. Debug includes verbose request/response details."
            >
              <Select
                value={settings.logLevel}
                onChange={(value) => updateSetting('logLevel', value as GatewaySettings['logLevel'])}
                options={[
                  { value: 'debug', label: 'Debug' },
                  { value: 'info', label: 'Info' },
                  { value: 'warn', label: 'Warning' },
                  { value: 'error', label: 'Error' },
                ]}
              />
            </SettingCard>
          </div>
        </div>

        {/* Environment Info */}
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-4">Environment</h2>
          <div className="bg-panel rounded-card border border-border p-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-text-muted">Version:</span>
                <span className="ml-2 text-text-primary">0.1.0</span>
              </div>
              <div>
                <span className="text-text-muted">Node.js:</span>
                <span className="ml-2 text-text-primary">v20.x</span>
              </div>
              <div>
                <span className="text-text-muted">Database:</span>
                <span className="ml-2 text-live">Connected</span>
              </div>
              <div>
                <span className="text-text-muted">Redis:</span>
                <span className="ml-2 text-live">Connected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div>
          <h2 className="text-sm font-semibold text-status-error mb-4">Danger Zone</h2>
          <div className="bg-panel rounded-card border border-status-error/25 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-text-primary mb-1">Clear Model Cache</h3>
                <p className="text-xs text-text-muted">
                  Force refresh all cached model lists from providers. This will temporarily increase API calls to providers.
                </p>
              </div>
              <button
                className="px-4 py-2 bg-status-error/15 hover:bg-status-error/25 text-status-error border border-status-error/25 rounded-button text-sm font-medium transition-colors"
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
