import { z } from 'zod';

export const LoginBody = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required').max(200),
});

export const PasswordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const ChangePasswordBody = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: PasswordPolicy,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current password',
    path: ['newPassword'],
  });
