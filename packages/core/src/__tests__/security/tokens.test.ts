import { describe, expect, it } from 'vitest';
import { constantTimeEqual } from '../../security/tokens.js';

describe('Token security', () => {
  describe('constantTimeEqual()', () => {
    it('should return false for different length strings', () => {
      const result = constantTimeEqual('short', 'longer-string');

      expect(result).toBe(false);
    });

    it('should return false for same length strings with different content', () => {
      const result = constantTimeEqual('hello', 'world');

      expect(result).toBe(false);
    });

    it('should return true for identical strings', () => {
      const result = constantTimeEqual('identical', 'identical');

      expect(result).toBe(true);
    });

    it('should return true for empty strings', () => {
      const result = constantTimeEqual('', '');

      expect(result).toBe(true);
    });

    it('should return false when one string is empty and other is not', () => {
      const result = constantTimeEqual('', 'nonempty');

      expect(result).toBe(false);
    });
  });
});
