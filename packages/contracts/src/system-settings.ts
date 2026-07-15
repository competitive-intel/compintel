import { z } from "zod";

const emailProviderDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9.-]+$/, "邮箱提供商域名格式不正确");

export const systemSettingsSchema = z.object({
  tencentSesCredentialsConfigured: z.boolean(),
  tencentSesFromAddress: z.string(),
  tencentSesTemplateId: z.number().int().positive(),
  allowedEmailProviders: z.array(z.string()),
  turnstileSiteKey: z.string(),
  turnstileSecretKeyConfigured: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export const updateSystemSettingsSchema = z
  .object({
    tencentSesFromAddress: z.string().trim().max(254).optional(),
    tencentSesTemplateId: z.number().int().positive().optional(),
    allowedEmailProviders: z
      .array(emailProviderDomainSchema)
      .min(1, "至少保留一个允许的邮箱提供商")
      .max(32)
      .optional(),
    turnstileSiteKey: z.string().trim().max(128).optional(),
    turnstileSecretKey: z.string().trim().max(256).optional(),
  })
  .refine(
    (value) =>
      value.tencentSesFromAddress !== undefined ||
      value.tencentSesTemplateId !== undefined ||
      value.allowedEmailProviders !== undefined ||
      value.turnstileSiteKey !== undefined ||
      value.turnstileSecretKey !== undefined,
    { message: "至少需要更新一个字段" },
  );

export const captchaConfigSchema = z.object({
  turnstileSiteKey: z.string().nullable(),
});

export type SystemSettings = z.infer<typeof systemSettingsSchema>;
export type UpdateSystemSettingsInput = z.infer<
  typeof updateSystemSettingsSchema
>;
export type CaptchaConfig = z.infer<typeof captchaConfigSchema>;
