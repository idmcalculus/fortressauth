import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const SignupRequestSchema = z
  .object({
    email: z.email().toLowerCase(),
    password: z.string().min(8).max(128),
  })
  .openapi('SignupRequest', {
    description: 'Request body for user signup',
  });

export const LoginRequestSchema = z
  .object({
    email: z.email().toLowerCase(),
    password: z.string(),
  })
  .openapi('LoginRequest', {
    description: 'Request body for user login',
  });

export const VerifyEmailRequestSchema = z
  .object({
    token: z.string(),
  })
  .openapi('VerifyEmailRequest', {
    description: 'Token delivered to user email for verification',
  });

export const RequestPasswordResetSchema = z
  .object({
    email: z.email().toLowerCase(),
  })
  .openapi('RequestPasswordReset', {
    description: 'Request password reset via email',
  });

export const ResetPasswordRequestSchema = z
  .object({
    token: z.string(),
    newPassword: z.string().min(8).max(128),
  })
  .openapi('ResetPasswordRequest', {
    description: 'Reset password using emailed token',
  });

export const UserResponseSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    emailVerified: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .openapi('UserResponse', {
    description: 'User information returned in responses',
  });

const UserDataSchema = z.object({ user: UserResponseSchema });

export const AuthResponseSchema = z
  .object({
    success: z.literal(true),
    data: UserDataSchema,
  })
  .openapi('AuthResponse', {
    description: 'Successful authentication response',
  });

export const SuccessResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.any().optional(),
  })
  .openapi('SuccessResponse', {
    description: 'Generic success response with optional data',
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
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;
export type RequestPasswordReset = z.infer<typeof RequestPasswordResetSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
