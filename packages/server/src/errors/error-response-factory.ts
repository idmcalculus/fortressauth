import { type AuthErrorCode, getErrorCodeMapping } from '@fortressauth/core';

/**
 * Production error response - safe for external consumption.
 * Does not expose internal details, stack traces, or sensitive information.
 */
export interface ProductionErrorResponse {
  success: false;
  error: AuthErrorCode;
  message: string;
  code: string;
}

/**
 * Development error response - includes detailed debugging information.
 * Only used in development mode for easier debugging.
 */
export interface DevelopmentErrorResponse {
  success: false;
  error: AuthErrorCode;
  details: string;
  timestamp: string;
  stack?: string;
}

/**
 * Union type for all error responses.
 */
export type ErrorResponse = ProductionErrorResponse | DevelopmentErrorResponse;

/**
 * Configuration options for the ErrorResponseFactory.
 */
export interface ErrorResponseFactoryConfig {
  /**
   * Whether to run in production mode.
   * In production mode, error responses are sanitized to prevent information leakage.
   * Defaults to NODE_ENV === 'production'.
   */
  isProduction?: boolean;
}

/**
 * Factory class for creating environment-aware error responses.
 *
 * In production mode:
 * - Returns generic, user-friendly error messages
 * - Includes error codes for documentation reference
 * - Never exposes stack traces, internal paths, or database errors
 *
 * In development mode:
 * - Returns detailed error information for debugging
 * - Includes timestamps and optional stack traces
 */
export class ErrorResponseFactory {
  private readonly isProduction: boolean;

  constructor(config: ErrorResponseFactoryConfig = {}) {
    this.isProduction = config.isProduction ?? process.env.NODE_ENV === 'production';
  }

  /**
   * Create an error response for the given error code.
   *
   * @param errorCode - The AuthErrorCode representing the error type
   * @param details - Optional detailed error message (only shown in development)
   * @param error - Optional Error object for stack trace (only shown in development)
   * @returns An error response appropriate for the current environment
   */
  createErrorResponse(
    errorCode: AuthErrorCode,
    details?: string,
    error?: Error,
  ): ErrorResponse {
    if (this.isProduction) {
      return this.createProductionResponse(errorCode);
    }
    return this.createDevelopmentResponse(errorCode, details, error);
  }

  /**
   * Create a production-safe error response.
   * Never includes internal details, stack traces, or sensitive information.
   */
  private createProductionResponse(errorCode: AuthErrorCode): ProductionErrorResponse {
    const mapping = getErrorCodeMapping(errorCode);
    return {
      success: false,
      error: errorCode,
      message: mapping.message,
      code: mapping.code,
    };
  }

  /**
   * Create a development error response with detailed debugging information.
   */
  private createDevelopmentResponse(
    errorCode: AuthErrorCode,
    details?: string,
    error?: Error,
  ): DevelopmentErrorResponse {
    const response: DevelopmentErrorResponse = {
      success: false,
      error: errorCode,
      details: details ?? `Error: ${errorCode}`,
      timestamp: new Date().toISOString(),
    };

    if (error?.stack) {
      response.stack = error.stack;
    }

    return response;
  }

  /**
   * Get the HTTP status code for a given error code.
   */
  getHttpStatus(errorCode: AuthErrorCode): number {
    return getErrorCodeMapping(errorCode).httpStatus;
  }

  /**
   * Check if the factory is running in production mode.
   */
  isProductionMode(): boolean {
    return this.isProduction;
  }

  /**
   * Check if an error response contains sensitive information.
   * Used for validation and testing.
   * 
   * This method checks if a response contains information that should NOT
   * be exposed in production, such as:
   * - Stack traces
   * - Internal file paths
   * - Database error details
   * - Raw tokens or hashes
   * 
   * Note: Production responses only contain: success, error, message, code
   * Development responses additionally contain: details, timestamp, stack
   */
  static containsSensitiveInfo(response: ErrorResponse): boolean {
    // Production responses should NOT have 'details' or 'stack' fields
    // These fields are only present in development responses
    if ('details' in response || 'stack' in response) {
      return true;
    }

    // For production responses, check if the message or code fields
    // contain actual sensitive data (not just the word "password" in a user message)
    const prodResponse = response as ProductionErrorResponse;
    const fieldsToCheck = [prodResponse.message, prodResponse.code];
    
    // Patterns that indicate actual sensitive data leakage
    const sensitivePatterns = [
      /at\s+\w+\s*\(/i, // Stack trace pattern: "at functionName ("
      /at\s+Object\./i, // Stack trace pattern: "at Object."
      /at\s+Module\./i, // Stack trace pattern: "at Module."
      /at\s+async/i, // Stack trace pattern: "at async"
      /node_modules/i, // Node modules path
      /\.ts:\d+:\d+/, // TypeScript file paths with line numbers
      /\.js:\d+:\d+/, // JavaScript file paths with line numbers
      /\/Users\//i, // macOS user paths
      /\/home\//i, // Linux home paths
      /\/var\/www/i, // Web server paths
      /C:\\Users\\/i, // Windows user paths
      /\$argon2/i, // Argon2 hash prefix
      /\$bcrypt/i, // Bcrypt hash prefix
      /\$2[aby]\$/i, // Bcrypt hash variants
      /[a-f0-9]{64}/i, // SHA-256 hashes (64 hex chars)
      /ECONNREFUSED/i, // Connection refused error
      /ETIMEDOUT/i, // Timeout error
      /ENOTFOUND/i, // DNS not found error
      /relation.*does not exist/i, // PostgreSQL error
      /table.*doesn't exist/i, // MySQL error
      /no such table/i, // SQLite error
      /database is locked/i, // SQLite error
      /access denied for user/i, // MySQL auth error
    ];

    for (const field of fieldsToCheck) {
      if (field && sensitivePatterns.some((pattern) => pattern.test(field))) {
        return true;
      }
    }

    return false;
  }
}

/**
 * Default error response factory instance.
 * Uses NODE_ENV to determine production/development mode.
 */
export const errorResponseFactory = new ErrorResponseFactory();
