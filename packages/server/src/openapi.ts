import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import {
  AuthResponseSchema,
  ErrorResponseSchema,
  LoginRequestSchema,
  SignupRequestSchema,
  UserResponseSchema,
} from '@fortressauth/core';
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { z } from 'zod';

const registry = new OpenAPIRegistry();

// Register component schemas
registry.register('SignupRequest', SignupRequestSchema);
registry.register('LoginRequest', LoginRequestSchema);
registry.register('UserResponse', UserResponseSchema);
registry.register('AuthResponse', AuthResponseSchema);
registry.register('ErrorResponse', ErrorResponseSchema);

// Health response schema
const HealthResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
    timestamp: z.string().datetime(),
  })
  .openapi('HealthResponse');

registry.register('HealthResponse', HealthResponseSchema);

// Success response schema
const SuccessResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .openapi('SuccessResponse');

registry.register('SuccessResponse', SuccessResponseSchema);

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
          schema: UserResponseSchema,
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
