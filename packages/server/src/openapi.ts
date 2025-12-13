import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import {
  AuthResponseSchema,
  ErrorResponseSchema,
  LoginRequestSchema,
  RequestPasswordResetSchema,
  ResetPasswordRequestSchema,
  SignupRequestSchema,
  SuccessResponseSchema,
  UserResponseSchema,
  VerifyEmailRequestSchema,
} from '@fortressauth/core';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { z } from 'zod';

const registry = new OpenAPIRegistry();

// Register component schemas
registry.register('SignupRequest', SignupRequestSchema);
registry.register('LoginRequest', LoginRequestSchema);
registry.register('VerifyEmailRequest', VerifyEmailRequestSchema);
registry.register('RequestPasswordReset', RequestPasswordResetSchema);
registry.register('ResetPasswordRequest', ResetPasswordRequestSchema);
registry.register('UserResponse', UserResponseSchema);
registry.register('AuthResponse', AuthResponseSchema);
registry.register('ErrorResponse', ErrorResponseSchema);
registry.register('SuccessResponse', SuccessResponseSchema);

// Health response schema
const HealthResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
    timestamp: z.string().datetime(),
  })
  .openapi('HealthResponse');

registry.register('HealthResponse', HealthResponseSchema);

// Register health endpoint
registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Health check endpoint',
  responses: {
    200: {
      description: 'Service is healthy',
      content: {
        'application/json': {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/metrics',
  tags: ['System'],
  summary: 'Prometheus metrics',
  responses: {
    200: {
      description: 'Prometheus metrics in text format',
      content: {
        'text/plain': {
          schema: z.string(),
        },
      },
    },
  },
});

// Register signup endpoint
registry.registerPath({
  method: 'post',
  path: '/auth/signup',
  tags: ['Authentication'],
  summary: 'Create a new user account',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SignupRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User successfully created',
      content: {
        'application/json': {
          schema: AuthResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid request or email already exists',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// Register login endpoint
registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Authentication'],
  summary: 'Sign in to an existing account',
  request: {
    body: {
      content: {
        'application/json': {
          schema: LoginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Successfully authenticated',
      content: {
        'application/json': {
          schema: AuthResponseSchema,
        },
      },
    },
    401: {
      description: 'Invalid credentials or account locked',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Email not verified',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// Register logout endpoint
registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Authentication'],
  summary: 'Sign out and invalidate session',
  responses: {
    200: {
      description: 'Successfully signed out',
      content: {
        'application/json': {
          schema: SuccessResponseSchema,
        },
      },
    },
  },
});

// Register me endpoint
registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Authentication'],
  summary: 'Get current authenticated user',
  responses: {
    200: {
      description: 'Current user information',
      content: {
        'application/json': {
          schema: AuthResponseSchema,
        },
      },
    },
    401: {
      description: 'Not authenticated or session expired',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// Register verify email endpoint
registry.registerPath({
  method: 'post',
  path: '/auth/verify-email',
  tags: ['Authentication'],
  summary: 'Verify user email using emailed token',
  request: {
    body: {
      content: {
        'application/json': {
          schema: VerifyEmailRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Email verified',
      content: {
        'application/json': {
          schema: SuccessResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid token',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// Register request password reset endpoint
registry.registerPath({
  method: 'post',
  path: '/auth/request-password-reset',
  tags: ['Authentication'],
  summary: 'Request password reset email',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RequestPasswordResetSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Password reset requested',
      content: {
        'application/json': {
          schema: SuccessResponseSchema,
        },
      },
    },
  },
});

// Register reset password endpoint
registry.registerPath({
  method: 'post',
  path: '/auth/reset-password',
  tags: ['Authentication'],
  summary: 'Reset password using reset token',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ResetPasswordRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Password reset successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid token or weak password',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function generateOpenAPIDocument(version: string): OpenAPIObject {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'FortressAuth API',
      version,
      description: 'Secure-by-default authentication API',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
  });
}