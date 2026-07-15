import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  cnic: z.string().regex(/^\d{5}-\d{7}-\d$/, 'CNIC must be in format 00000-0000000-0'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  province: z.string().min(1, 'Province is required'),
  city: z.string().min(1, 'City is required'),
  area: z.string().min(1, 'Area is required'),
});

export const signinSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const verifyOtpSchema = z.object({
  userId: z.union([z.string(), z.number()]),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const castVoteSchema = z.object({
  candidateParticipatingId: z.number().int().positive('Invalid candidate'),
  electionId: z.number().int().positive('Invalid election'),
});

export const createElectionSchema = z.object({
  name: z.string().min(2, 'Election name is required'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  seatType: z.enum(['National', 'Provincial', 'national', 'provincial']),
  Province: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
  cnic: z.string().optional(),
  type: z.enum(['user', 'party']).optional(),
});

export const resetPasswordSchema = z.object({
  userId: z.union([z.string(), z.number()]),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  type: z.enum(['user', 'party']),
});

export const createPartySchema = z.object({
  name: z.string().min(2, 'Party name is required'),
  abbreviation: z.string().min(1, 'Abbreviation is required'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const editProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
}).refine(data => data.name || data.email || data.password, {
  message: 'At least one field (name, email, or password) must be provided',
});

export const allocateCandidateSchema = z.object({
  candidateId: z.number().int().positive(),
  electionId: z.number().int().positive(),
  constituencyId: z.number().int().positive(),
});
