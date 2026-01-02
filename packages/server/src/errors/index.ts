// Re-export core error code mappings for convenience
export { ERROR_CODE_MAP, getErrorCodeMapping } from '@fortressauth/core';
export type { AuthErrorCode, ErrorCodeMapping } from '@fortressauth/core';

// HTTP-specific error response factory
export {
  ErrorResponseFactory,
  errorResponseFactory,
} from './error-response-factory.js';
export type {
  DevelopmentErrorResponse,
  ErrorResponse,
  ErrorResponseFactoryConfig,
  ProductionErrorResponse,
} from './error-response-factory.js';
