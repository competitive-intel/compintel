import type {
  SystemSettings,
  UpdateSystemSettingsInput,
} from "@compintel/contracts";
import type { PrismaClient } from "@compintel/db";

import { HttpError } from "./errors.js";

const DEFAULT_SETTINGS_ID = "default";
const DEFAULT_SES_TEMPLATE_ID = 121_332;
const DEFAULT_ALLOWED_PROVIDERS = ["gmail.com", "qq.com", "163.com", "126.com"];

export interface SystemSettingsOptions {
  tencentSesSecretId?: string;
  tencentSesSecretKey?: string;
}

export class SystemSettingsService {
  private readonly tencentSesSecretId: string;
  private readonly tencentSesSecretKey: string;

  constructor(
    private readonly db: PrismaClient,
    options: SystemSettingsOptions = {},
  ) {
    this.tencentSesSecretId = options.tencentSesSecretId ?? "";
    this.tencentSesSecretKey = options.tencentSesSecretKey ?? "";
  }

  async get(): Promise<SystemSettings> {
    const settings = await this.ensureDefaults();
    return this.serializeSettings(settings);
  }

  async getCaptchaConfig(): Promise<{ turnstileSiteKey: string | null }> {
    const settings = await this.ensureDefaults();
    const siteKey = settings.turnstileSiteKey.trim();
    return { turnstileSiteKey: siteKey.length > 0 ? siteKey : null };
  }

  async update(
    administratorId: string,
    input: UpdateSystemSettingsInput,
  ): Promise<SystemSettings> {
    await this.ensureDefaults();
    const data: {
      tencentSesFromAddress?: string;
      tencentSesTemplateId?: number;
      allowedEmailProviders?: string[];
      turnstileSiteKey?: string;
      turnstileSecretKey?: string;
      updatedById: string;
    } = { updatedById: administratorId };

    if (input.tencentSesFromAddress !== undefined) {
      data.tencentSesFromAddress = input.tencentSesFromAddress;
    }
    if (input.tencentSesTemplateId !== undefined) {
      data.tencentSesTemplateId = input.tencentSesTemplateId;
    }
    if (input.allowedEmailProviders !== undefined) {
      data.allowedEmailProviders = [
        ...new Set(input.allowedEmailProviders.map((value) => value.trim())),
      ];
      if (data.allowedEmailProviders.length === 0) {
        throw new HttpError(
          400,
          "至少保留一个允许的邮箱提供商",
          "INVALID_REQUEST",
        );
      }
    }
    if (input.turnstileSiteKey !== undefined) {
      data.turnstileSiteKey = input.turnstileSiteKey;
    }
    if (input.turnstileSecretKey !== undefined) {
      data.turnstileSecretKey = input.turnstileSecretKey;
    }

    const settings = await this.db.systemSettings.update({
      where: { id: DEFAULT_SETTINGS_ID },
      data,
    });
    return this.serializeSettings(settings);
  }

  async getRawForMail(): Promise<{
    secretId: string;
    secretKey: string;
    fromAddress: string;
    templateId: number;
    allowedEmailProviders: string[];
    turnstileSiteKey: string;
    turnstileSecretKey: string;
  }> {
    const settings = await this.ensureDefaults();
    return {
      secretId: this.tencentSesSecretId,
      secretKey: this.tencentSesSecretKey,
      fromAddress: settings.tencentSesFromAddress,
      templateId: settings.tencentSesTemplateId,
      allowedEmailProviders: settings.allowedEmailProviders,
      turnstileSiteKey: settings.turnstileSiteKey,
      turnstileSecretKey: settings.turnstileSecretKey,
    };
  }

  private async ensureDefaults() {
    return this.db.systemSettings.upsert({
      where: { id: DEFAULT_SETTINGS_ID },
      update: {},
      create: {
        id: DEFAULT_SETTINGS_ID,
        tencentSesTemplateId: DEFAULT_SES_TEMPLATE_ID,
        allowedEmailProviders: DEFAULT_ALLOWED_PROVIDERS,
      },
    });
  }

  private serializeSettings(settings: {
    tencentSesFromAddress: string;
    tencentSesTemplateId: number;
    allowedEmailProviders: string[];
    turnstileSiteKey: string;
    turnstileSecretKey: string;
    updatedAt: Date;
  }): SystemSettings {
    return {
      tencentSesCredentialsConfigured:
        this.tencentSesSecretId.length > 0 &&
        this.tencentSesSecretKey.length > 0,
      tencentSesFromAddress: settings.tencentSesFromAddress,
      tencentSesTemplateId: settings.tencentSesTemplateId,
      allowedEmailProviders: settings.allowedEmailProviders,
      turnstileSiteKey: settings.turnstileSiteKey,
      turnstileSecretKeyConfigured: settings.turnstileSecretKey.length > 0,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
