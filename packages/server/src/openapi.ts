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
    timestamp: z.iso.datetime(),
  })
  .openapi('HealthResponse');

registry.register('HealthResponse', HealthResponseSchema);

const CsrfTokenResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      csrfToken: z.string(),
    }),
  })
  .openapi('CsrfTokenResponse');

registry.register('CsrfTokenResponse', CsrfTokenResponseSchema);

const NativeTokenRequestSchema = z
  .object({
    grantType: z.literal('authorization_code'),
    clientId: z.string(),
    code: z.string(),
    redirectUri: z.string().url(),
    codeVerifier: z.string().min(43).max(128),
  })
  .openapi('NativeTokenRequest');

const NativeTokenResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.object({
      token: z.string(),
      tokenType: z.literal('Bearer'),
      expiresAt: z.iso.datetime(),
      user: UserResponseSchema,
    }),
  })
  .openapi('NativeTokenResponse');

registry.register('NativeTokenRequest', NativeTokenRequestSchema);
registry.register('NativeTokenResponse', NativeTokenResponseSchema);
const ResourceIntrospectionRequestSchema = z
  .object({
    token: z.string().min(1).max(256),
    audience: z.string().min(1).max(256),
  })
  .strict()
  .openapi('ResourceIntrospectionRequest');
const ResourceIntrospectionResponseSchema = z
  .discriminatedUnion('active', [
    z.object({ active: z.literal(false) }).strict(),
    z
      .object({
        active: z.literal(true),
        sub: z.string(),
        email: z.string().email().nullable(),
        email_verified: z.literal(true),
        aud: z.string(),
        client_id: z.string(),
        exp: z.number().int(),
        sid: z.string().nullable(),
        auth_time: z.number().int().nullable(),
      })
      .strict(),
  ])
  .openapi('ResourceIntrospectionResponse');
const ResourceIntrospectionInactiveSchema = z
  .object({ active: z.literal(false) })
  .strict()
  .openapi('ResourceIntrospectionInactive');
registry.register('ResourceIntrospectionRequest', ResourceIntrospectionRequestSchema);
registry.register('ResourceIntrospectionResponse', ResourceIntrospectionResponseSchema);
registry.register('ResourceIntrospectionInactive', ResourceIntrospectionInactiveSchema);

const noStoreHeaders = {
  'Cache-Control': {
    description: 'Introspection responses are never cacheable.',
    schema: { type: 'string' as const, const: 'no-store' },
  },
};
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'FortressAuth split session token',
});
registry.registerComponent('securitySchemes', 'resourceServerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'resource-server-specific service credential',
});

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
  path: '/auth/native/authorize/{provider}',
  tags: ['Native Authentication'],
  summary: 'Start system-browser OAuth authorization with PKCE',
  request: {
    params: z.object({ provider: z.string() }),
    query: z.object({
      client_id: z.string(),
      redirect_uri: z.string().url(),
      state: z.string().min(43).max(128),
      code_challenge: z.string().length(43),
      code_challenge_method: z.literal('S256'),
      audience: z.string().min(1).max(256).optional(),
      max_age: z.number().int().min(1).max(86_400).optional(),
    }),
  },
  responses: {
    302: { description: 'Redirect to the configured OAuth provider' },
    400: {
      description: 'Invalid client, redirect URI, state, or PKCE challenge',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/resource/introspect',
  tags: ['Resource Server Authentication'],
  summary: 'Validate a native opaque session for one exact resource audience',
  security: [{ resourceServerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        'application/x-www-form-urlencoded': { schema: ResourceIntrospectionRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Active identity claims or an indistinguishable inactive result; no-store',
      headers: noStoreHeaders,
      content: { 'application/json': { schema: ResourceIntrospectionResponseSchema } },
    },
    400: {
      description: 'Malformed or non-exact form schema',
      headers: noStoreHeaders,
      content: { 'application/json': { schema: ResourceIntrospectionInactiveSchema } },
    },
    401: {
      description: 'Missing or invalid resource-server credential',
      headers: noStoreHeaders,
      content: { 'application/json': { schema: ResourceIntrospectionInactiveSchema } },
    },
    413: {
      description: 'Request body exceeds the configured bound',
      headers: noStoreHeaders,
      content: { 'application/json': { schema: ResourceIntrospectionInactiveSchema } },
    },
    415: {
      description: 'Content type must be exactly application/x-www-form-urlencoded',
      headers: noStoreHeaders,
      content: { 'application/json': { schema: ResourceIntrospectionInactiveSchema } },
    },
    429: {
      description: 'Layered resource introspection rate limit exceeded',
      headers: noStoreHeaders,
      content: { 'application/json': { schema: ResourceIntrospectionInactiveSchema } },
    },
    503: {
      description: 'Session lookup or required audit persistence failed closed',
      headers: noStoreHeaders,
      content: { 'application/json': { schema: ResourceIntrospectionInactiveSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/native/token',
  tags: ['Native Authentication'],
  summary: 'Exchange a one-time authorization code for a bearer session',
  request: { body: { content: { 'application/json': { schema: NativeTokenRequestSchema } } } },
  responses: {
    200: {
      description: 'Bearer session issued; response is marked no-store',
      content: { 'application/json': { schema: NativeTokenResponseSchema } },
    },
    400: {
      description: 'Invalid, expired, replayed, or incorrectly bound authorization code',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/native/session',
  tags: ['Native Authentication'],
  summary: 'Validate a bearer session',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Current user',
      content: { 'application/json': { schema: AuthResponseSchema } },
    },
    401: {
      description: 'Invalid session',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/native/logout',
  tags: ['Native Authentication'],
  summary: 'Revoke the current bearer session',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Session revoked',
      content: { 'application/json': { schema: SuccessResponseSchema } },
    },
    401: {
      description: 'Invalid session',
      content: { 'application/json': { schema: ErrorResponseSchema } },
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

registry.registerPath({
  method: 'get',
  path: '/auth/csrf',
  tags: ['Authentication'],
  summary: 'Get CSRF token for state-changing requests',
  responses: {
    200: {
      description: 'CSRF token issued',
      content: {
        'application/json': {
          schema: CsrfTokenResponseSchema,
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
        url: 'https://api.fortressauth.com',
        description: 'Production server',
      },
      {
        url: 'https://dev-api.fortressauth.com',
        description: 'Development server',
      },
      {
        url: 'http://localhost:3000',
        description: 'Local server',
      },
    ],
  });
}
