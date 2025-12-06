import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const SignupRequestSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    password: z.string().min(8).max(128),
  })
  .openapi('SignupRequest', {
    description: 'Request body for user signup',
  });

export const LoginRequestSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    password: z.string(),
  })
  .openapi('LoginRequest', {
    description: 'Request body for user login',
  });

export const UserResponseSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .openapi('UserResponse', {
    description: 'User information returned in responses',
  });

export const AuthResponseSchema = z
  .object({
    success: z.literal(true),
    user: UserResponseSchema,
  })
  .openapi('AuthResponse', {
    description: 'Successful authentication response',
  });

export const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.string(),
  })
  .openapi('ErrorResponse', {
    description: 'Error response',
  });

export type SignupRequest = z.infer<typeof SignupRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
