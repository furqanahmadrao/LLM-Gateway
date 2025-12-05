import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getNavItemClassName } from './sidebarUtils';

/**
 * Property tests for Sidebar navigation
 * **Feature: ui-redesign, Property: Navigation item active state**
 * **Validates: Requirements 2.3**
 */
describe('Sidebar Navigation', () => {
  describe('getNavItemClassName', () => {
    /**
     * Property: Navigation item active state
     * *For any* navigation item, when the pathname matches the href,
     * the returned class name should contain the active styling classes.
     * **Validates: Requirements 2.3**
     */
    it('should return active styling class when pathname matches href exactly for root', () => {
      fc.assert(
        fc.property(
          fc.constant('/'),
          fc.constant('/'),
          (href, pathname) => {
            const className = getNavItemClassName(href, pathname);
            expect(className).toContain('sidebar-nav-item-active');
            expect(className).toContain('bg-accent-muted');
            expect(className).toContain('text-accent');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Navigation item active state for non-root paths
     * *For any* non-root navigation item, when the pathname starts with the href,
     * the returned class name should contain the active styling classes.
     * **Validates: Requirements 2.3**
     */
    it('should return active styling class when pathname starts with href for non-root paths', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', '-', '_'), { minLength: 1, maxLength: 20 }),
          fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', '-', '_', '/'), { minLength: 0, maxLength: 10 }),
          (basePath, suffix) => {
            const href = `/${basePath}`;
            const pathname = `/${basePath}${suffix}`;
            const className = getNavItemClassName(href, pathname);
            expect(className).toContain('sidebar-nav-item-active');
            expect(className).toContain('bg-accent-muted');
            expect(className).toContain('text-accent');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Navigation item inactive state
     * *For any* navigation item, when the pathname does NOT match the href,
     * the returned class name should NOT contain the active styling classes.
     * **Validates: Requirements 2.3**
     */
    it('should return inactive styling class when pathname does not match href', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 10 }),
          fc.stringOf(fc.constantFrom('x', 'y', 'z'), { minLength: 1, maxLength: 10 }),
          (hrefBase, pathnameBase) => {
            // Ensure they are different
            fc.pre(hrefBase !== pathnameBase);
            const href = `/${hrefBase}`;
            const pathname = `/${pathnameBase}`;
            const className = getNavItemClassName(href, pathname);
            expect(className).not.toContain('sidebar-nav-item-active');
            expect(className).toContain('text-text-secondary');
            expect(className).toContain('hover:bg-panel-hover');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Root path only matches exact root
     * *For any* non-root pathname, the root href ('/') should NOT be active.
     * **Validates: Requirements 2.3**
     */
    it('should not mark root as active when pathname is not exactly root', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', '-', '_'), { minLength: 1, maxLength: 20 }),
          (pathSuffix) => {
            const href = '/';
            const pathname = `/${pathSuffix}`;
            const className = getNavItemClassName(href, pathname);
            expect(className).not.toContain('sidebar-nav-item-active');
            expect(className).toContain('text-text-secondary');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: All nav items have base styling
     * *For any* navigation item and pathname combination,
     * the returned class name should always contain the base styling classes.
     * **Validates: Requirements 2.3**
     */
    it('should always include base styling classes regardless of active state', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('/'),
            fc.stringOf(fc.constantFrom('a', 'b', 'c', '-'), { minLength: 1, maxLength: 10 }).map(s => `/${s}`)
          ),
          fc.oneof(
            fc.constant('/'),
            fc.stringOf(fc.constantFrom('a', 'b', 'c', '-'), { minLength: 1, maxLength: 10 }).map(s => `/${s}`)
          ),
          (href, pathname) => {
            const className = getNavItemClassName(href, pathname);
            expect(className).toContain('sidebar-nav-item');
            expect(className).toContain('flex');
            expect(className).toContain('items-center');
            expect(className).toContain('gap-3');
            expect(className).toContain('px-3');
            expect(className).toContain('py-2');
            expect(className).toContain('rounded-button');
            expect(className).toContain('text-sm');
            expect(className).toContain('transition-colors');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
