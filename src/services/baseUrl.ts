/**
 * Base URL Configuration Service
 * 
 * Parses and validates the BASE_URL environment variable on startup.
 * Provides utilities for constructing self-referential URLs.
 * 
 * Requirements: 8.1, 8.4, 8.5
 */

export interface BaseUrlConfig {
  /** Full base URL (e.g., "https://api.example.com/gateway") */
  baseUrl: string;
  /** Protocol (http or https) */
  protocol: string;
  /** Hostname (e.g., "api.example.com") */
  hostname: string;
  /** Port (if specified, otherwise null) */
  port: number | null;
  /** Base path (e.g., "/gateway" or "") */
  basePath: string;
  /** Whether a custom domain is configured */
  isCustomDomain: boolean;
}

/**
 * Validates and parses a BASE_URL string
 * 
 * @param baseUrl - The BASE_URL to validate
 * @returns Parsed configuration or throws an error
 */
export function parseBaseUrl(baseUrl: string): BaseUrlConfig {
  // Remove trailing slash for consistency
  const normalizedUrl = baseUrl.replace(/\/+$/, '');
  
  let url: URL;
  try {
    url = new URL(normalizedUrl);
  } catch {
    throw new Error(`Invalid BASE_URL: "${baseUrl}" is not a valid URL`);
  }
  
  // Validate protocol
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Invalid BASE_URL protocol: "${url.protocol}". Must be http or https`);
  }
  
  // Extract port (null if default for protocol)
  let port: number | null = null;
  if (url.port) {
    port = parseInt(url.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid BASE_URL port: "${url.port}"`);
    }
  }
  
  // Extract base path (pathname without trailing slash)
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  
  return {
    baseUrl: normalizedUrl,
    protocol: url.protocol.replace(':', ''),
    hostname: url.hostname,
    port,
    basePath,
    isCustomDomain: true,
  };
}

/**
 * Creates a default configuration when no BASE_URL is set
 */
function createDefaultConfig(port: number): BaseUrlConfig {
  return {
    baseUrl: `http://localhost:${port}`,
    protocol: 'http',
    hostname: 'localhost',
    port,
    basePath: '',
    isCustomDomain: false,
  };
}

// Cached configuration
let cachedConfig: BaseUrlConfig | null = null;

/**
 * Initializes the base URL configuration from environment variables
 * 
 * @param serverPort - The port the server is running on (used for default config)
 * @returns The parsed configuration
 * @throws Error if BASE_URL is invalid
 */
export function initializeBaseUrl(serverPort: number = 3000): BaseUrlConfig {
  const baseUrl = process.env.BASE_URL;
  
  if (baseUrl) {
    cachedConfig = parseBaseUrl(baseUrl);
    console.log(`Base URL configured: ${cachedConfig.baseUrl}`);
    if (cachedConfig.basePath) {
      console.log(`Base path: ${cachedConfig.basePath}`);
    }
  } else {
    cachedConfig = createDefaultConfig(serverPort);
    console.log(`No BASE_URL configured, using default: ${cachedConfig.baseUrl}`);
  }
  
  return cachedConfig;
}

/**
 * Gets the current base URL configuration
 * 
 * @returns The cached configuration or throws if not initialized
 */
export function getBaseUrlConfig(): BaseUrlConfig {
  if (!cachedConfig) {
    throw new Error('Base URL not initialized. Call initializeBaseUrl() first.');
  }
  return cachedConfig;
}

/**
 * Constructs a full URL for an API endpoint
 * 
 * @param path - The API path (e.g., "/v1/models")
 * @returns Full URL including base URL and path
 */
export function buildApiUrl(path: string): string {
  const config = getBaseUrlConfig();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${config.baseUrl}${normalizedPath}`;
}

/**
 * Gets the base path for routing
 * 
 * @returns The base path (e.g., "/gateway") or empty string
 */
export function getBasePath(): string {
  const config = getBaseUrlConfig();
  return config.basePath;
}

/**
 * Gets the configured hostname for Host header validation
 * 
 * @returns The hostname or null if not configured
 */
export function getConfiguredHostname(): string | null {
  const config = getBaseUrlConfig();
  return config.isCustomDomain ? config.hostname : null;
}

/**
 * Checks if a custom domain is configured
 */
export function hasCustomDomain(): boolean {
  const config = getBaseUrlConfig();
  return config.isCustomDomain;
}

/**
 * Resets the cached configuration (for testing)
 */
export function resetBaseUrlConfig(): void {
  cachedConfig = null;
}
