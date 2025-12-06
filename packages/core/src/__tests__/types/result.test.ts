import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, ok } from '../../types/result.js';

describe('Result type utilities', () => {
  describe('ok()', () => {
    it('should create a success result with data', () => {
      const result = ok('test data');
      expect(result).toEqual({ success: true, data: 'test data' });
    });

    it('should work with different data types', () => {
      expect(ok(42)).toEqual({ success: true, data: 42 });
      expect(ok({ foo: 'bar' })).toEqual({ success: true, data: { foo: 'bar' } });
      expect(ok(null)).toEqual({ success: true, data: null });
      expect(ok(undefined)).toEqual({ success: true, data: undefined });
    });
  });

  describe('err()', () => {
    it('should create a failure result with error', () => {
      const result = err('ERROR_CODE');
      expect(result).toEqual({ success: false, error: 'ERROR_CODE' });
    });

    it('should work with different error types', () => {
      expect(err('INVALID_EMAIL')).toEqual({ success: false, error: 'INVALID_EMAIL' });
      expect(err({ code: 'ERR', message: 'fail' })).toEqual({
        success: false,
        error: { code: 'ERR', message: 'fail' },
      });
    });
  });

  describe('isOk()', () => {
    it('should return true for success results', () => {
      expect(isOk(ok('data'))).toBe(true);
    });

    it('should return false for failure results', () => {
      expect(isOk(err('error'))).toBe(false);
    });
  });

  describe('isErr()', () => {
    it('should return true for failure results', () => {
      expect(isErr(err('error'))).toBe(true);
    });

    it('should return false for success results', () => {
      expect(isErr(ok('data'))).toBe(false);
    });
  });
});
