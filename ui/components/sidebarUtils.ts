/**
 * Utility functions for Sidebar component
 * Extracted for testability without React dependencies
 */

/**
 * Determines the CSS class name for a navigation item based on whether it's active
 * @param href - The href of the navigation item
 * @param pathname - The current pathname
 * @returns The CSS class name string
 */
export function getNavItemClassName(href: string, pathname: string): string {
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return `sidebar-nav-item flex items-center gap-3 px-3 py-2 rounded-button text-sm transition-colors ${
    isActive
      ? 'sidebar-nav-item-active bg-accent-muted text-accent'
      : 'text-text-secondary hover:bg-panel-hover hover:text-text-primary'
  }`;
}

/**
 * Checks if a navigation item is active based on the current pathname
 * @param href - The href of the navigation item
 * @param pathname - The current pathname
 * @returns true if the navigation item is active
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname.startsWith(href);
}
