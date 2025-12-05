/**
 * Demo Mode Utility
 * 
 * Controls whether mock data is displayed in the dashboard.
 * When DEMO_MODE is enabled, the UI shows demonstration data.
 * When disabled (default), the UI shows real data from the API.
 * 
 * Requirements: 9.1, 9.2 - Gate simulation code behind DEMO_MODE
 */

/**
 * Check if demo mode is enabled
 * @returns true if DEMO_MODE is set to 'true', false otherwise
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

/**
 * Get data based on demo mode
 * Returns mock data if demo mode is enabled, otherwise returns null
 * to indicate that real data should be fetched from the API
 * 
 * @param mockData - The mock data to return in demo mode
 * @returns The mock data if demo mode is enabled, null otherwise
 */
export function getDemoData<T>(mockData: T): T | null {
  return isDemoMode() ? mockData : null;
}
