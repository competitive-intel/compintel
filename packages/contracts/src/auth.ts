import { z } from "zod";

export const userRoleSchema = z.enum(["USER", "ADMIN"]);
export const approvalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "用户名至少需要 3 个字符")
    .max(32, "用户名最多 32 个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线")
    .transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(40),
  email: z
    .string()
    .trim()
    .min(3, "请输入邮箱")
    .max(254, "邮箱过长")
    .email("邮箱格式不正确")
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "密码至少需要 8 个字符")
    .max(128, "密码最多 128 个字符")
    .regex(/[A-Za-z]/, "密码必须包含字母")
    .regex(/[0-9]/, "密码必须包含数字"),
});

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const verifyEmailSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toLowerCase()),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "验证码为 6 位数字"),
});

export const resendVerificationSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toLowerCase()),
});

export const currentUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: userRoleSchema,
  approvalStatus: approvalStatusSchema,
  createdAt: z.iso.datetime(),
});

export const authResponseSchema = z.object({ user: currentUserSchema });
export const registerResponseSchema = authResponseSchema;

export const adminUserSchema = currentUserSchema.extend({
  reviewedAt: z.iso.datetime().nullable(),
  reviewedBy: z.object({ id: z.string(), displayName: z.string() }).nullable(),
});

export const adminUsersResponseSchema = z.object({
  users: z.array(adminUserSchema),
});

export const reviewUserSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type ReviewUserInput = z.infer<typeof reviewUserSchema>;
