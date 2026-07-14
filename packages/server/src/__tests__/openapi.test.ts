import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from '../openapi.js';

describe('OpenAPI document generation', () => {
  it('should generate valid OpenAPI 3.1 document', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('FortressAuth API');
    expect(doc.info.version).toBe('1.0.0');
    expect(doc.info.description).toBe('Secure-by-default authentication API');
  });

  it('should include server configuration', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.servers).toBeDefined();
    expect(doc.servers).toHaveLength(3);
    expect(doc.servers).toEqual([
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
    ]);
  });

  it('should include all auth paths', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.paths).toBeDefined();
    expect(doc.paths?.['/health']).toBeDefined();
    expect(doc.paths?.['/metrics']).toBeDefined();
    expect(doc.paths?.['/auth/csrf']).toBeDefined();
    expect(doc.paths?.['/auth/signup']).toBeDefined();
    expect(doc.paths?.['/auth/login']).toBeDefined();
    expect(doc.paths?.['/auth/logout']).toBeDefined();
    expect(doc.paths?.['/auth/me']).toBeDefined();
    expect(doc.paths?.['/auth/native/authorize/{provider}']).toBeDefined();
    expect(doc.paths?.['/auth/native/token']).toBeDefined();
    expect(doc.paths?.['/auth/native/session']).toBeDefined();
    expect(doc.paths?.['/auth/native/logout']).toBeDefined();
    expect(doc.paths?.['/auth/resource/introspect']).toBeDefined();
  });

  it('should define health endpoint as GET', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.paths?.['/health']?.get).toBeDefined();
    expect(doc.paths?.['/health']?.get?.tags).toContain('System');
  });

  it('should define signup endpoint as POST', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.paths?.['/auth/signup']?.post).toBeDefined();
    expect(doc.paths?.['/auth/signup']?.post?.tags).toContain('Authentication');
  });

  it('should define login endpoint as POST', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.paths?.['/auth/login']?.post).toBeDefined();
    expect(doc.paths?.['/auth/login']?.post?.tags).toContain('Authentication');
  });

  it('should define csrf endpoint as GET', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.paths?.['/auth/csrf']?.get).toBeDefined();
    expect(doc.paths?.['/auth/csrf']?.get?.tags).toContain('Authentication');
  });

  it('should define logout endpoint as POST', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.paths?.['/auth/logout']?.post).toBeDefined();
  });

  it('should define me endpoint as GET', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.paths?.['/auth/me']?.get).toBeDefined();
  });

  it('should include component schemas', () => {
    const doc = generateOpenAPIDocument('1.0.0');

    expect(doc.components?.schemas).toBeDefined();
    expect(doc.components?.schemas?.SignupRequest).toBeDefined();
    expect(doc.components?.schemas?.LoginRequest).toBeDefined();
    expect(doc.components?.schemas?.UserResponse).toBeDefined();
    expect(doc.components?.schemas?.AuthResponse).toBeDefined();
    expect(doc.components?.schemas?.ErrorResponse).toBeDefined();
    expect(doc.components?.schemas?.NativeTokenRequest).toBeDefined();
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined();
    expect(doc.components?.schemas?.ResourceIntrospectionRequest).toBeDefined();
    expect(doc.components?.schemas?.ResourceIntrospectionResponse).toBeDefined();
    expect(doc.components?.schemas?.ResourceIntrospectionInactive).toBeDefined();
    expect(doc.components?.securitySchemes?.resourceServerAuth).toBeDefined();
  });

  it('documents inactive-only error responses and no-store headers for introspection', () => {
    const doc = generateOpenAPIDocument('1.0.0');
    const responses = doc.paths?.['/auth/resource/introspect']?.post?.responses;

    for (const status of ['400', '401', '413', '415', '429', '503']) {
      const response = responses?.[status] as
        | {
            headers?: Record<string, unknown>;
            content?: Record<string, { schema?: { $ref?: string } }>;
          }
        | undefined;
      expect(response?.headers?.['Cache-Control']).toBeDefined();
      expect(response?.content?.['application/json']?.schema?.$ref).toContain(
        'ResourceIntrospectionInactive',
      );
    }
  });

  it('should use provided version', () => {
    const doc = generateOpenAPIDocument('2.5.0');

    expect(doc.info.version).toBe('2.5.0');
  });
});
