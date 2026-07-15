import { z } from "zod";

export const systemSettingsSchema = z.object({
  tencentSesSecretId: z.string(),
  tencentSesSecretKeyConfigured: z.boolean(),
  tencentSesFromAddress: z.string(),
  tencentSesTemplateId: z.number().int().positive(),
  allowedEmailProviders: z.array(z.string()),
  updatedAt: z.iso.datetime(),
});

export const updateSystemSettingsSchema = z
  .object({
    tencentSesSecretId: z.string().trim().max(128).optional(),
    tencentSesSecretKey: z.string().max(256).optional(),
    tencentSesFromAddress: z.string().trim().max(254).optional(),
    tencentSesTemplateId: z.number().int().positive().optional(),
    allowedEmailProviders: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9.-]+$/, "邮箱提供商域名格式不正确"),
      )
      .min(1, "至少保留一个允许的邮箱提供商")
      .max(32)
      .optional(),
  })
  .refine(
    (value) =>
      value.tencentSesSecretId !== undefined ||
      value.tencentSesSecretKey !== undefined ||
      value.tencentSesFromAddress !== undefined ||
      value.tencentSesTemplateId !== undefined ||
      value.allowedEmailProviders !== undefined,
    { message: "至少需要更新一个字段" },
  );

export type SystemSettings = z.infer<typeof systemSettingsSchema>;
export type UpdateSystemSettingsInput = z.infer<
  typeof updateSystemSettingsSchema
>;
