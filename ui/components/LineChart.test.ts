import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shouldShowLiveBadge } from './LineChart';

/**
 * Property tests for LineChart component
 * **Feature: ui-redesign, Property 4: LineChart LIVE badge conditional rendering**
 * **Validates: Requirements 4.6**
 */
describe('LineChart', () => {
  /**
   * Property 4: LineChart LIVE badge conditional rendering
   * *For any* LineChart component, if showLive prop is true, then the LIVE badge
   * element should be present; if showLive is false or undefined, the LIVE badge
   * should not be present.
   * **Validates: Requirements 4.6**
   */
  describe('shouldShowLiveBadge', () => {
    it('should return true only when showLive is explicitly true', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (showLive) => {
            const result = shouldShowLiveBadge(showLive);
            expect(result).toBe(showLive === true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when showLive is undefined', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          (showLive) => {
            const result = shouldShowLiveBadge(showLive);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should consistently return true for true input', () => {
      fc.assert(
        fc.property(
          fc.constant(true),
          (showLive) => {
            const result = shouldShowLiveBadge(showLive);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should consistently return false for false input', () => {
      fc.assert(
        fc.property(
          fc.constant(false),
          (showLive) => {
            const result = shouldShowLiveBadge(showLive);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be idempotent - calling multiple times with same input gives same result', () => {
      fc.assert(
        fc.property(
          fc.option(fc.boolean(), { nil: undefined }),
          (showLive) => {
            const result1 = shouldShowLiveBadge(showLive);
            const result2 = shouldShowLiveBadge(showLive);
            const result3 = shouldShowLiveBadge(showLive);
            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
