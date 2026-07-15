import type {
  SystemSettings,
  UpdateSystemSettingsInput,
} from "@compintel/contracts";
import type { PrismaClient } from "@compintel/db";

import { HttpError } from "./errors.js";

const DEFAULT_SETTINGS_ID = "default";
const DEFAULT_SES_TEMPLATE_ID = 121_332;

export class SystemSettingsService {
  constructor(private readonly db: PrismaClient) {}

  async get(): Promise<SystemSettings> {
    const settings = await this.ensureDefaults();
    return serializeSettings(settings);
  }

  async update(
    administratorId: string,
    input: UpdateSystemSettingsInput,
  ): Promise<SystemSettings> {
    await this.ensureDefaults();
    const data: {
      tencentSesSecretId?: string;
      tencentSesSecretKey?: string;
      tencentSesFromAddress?: string;
      tencentSesTemplateId?: number;
      allowedEmailProviders?: string[];
      updatedById: string;
    } = { updatedById: administratorId };

    if (input.tencentSesSecretId !== undefined) {
      data.tencentSesSecretId = input.tencentSesSecretId;
    }
    if (input.tencentSesSecretKey !== undefined) {
      data.tencentSesSecretKey = input.tencentSesSecretKey;
    }
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

    const settings = await this.db.systemSettings.update({
      where: { id: DEFAULT_SETTINGS_ID },
      data,
    });
    return serializeSettings(settings);
  }

  async getRawForMail(): Promise<{
    secretId: string;
    secretKey: string;
    fromAddress: string;
    templateId: number;
    allowedEmailProviders: string[];
  }> {
    const settings = await this.ensureDefaults();
    return {
      secretId: settings.tencentSesSecretId,
      secretKey: settings.tencentSesSecretKey,
      fromAddress: settings.tencentSesFromAddress,
      templateId: settings.tencentSesTemplateId,
      allowedEmailProviders: settings.allowedEmailProviders,
    };
  }

  private async ensureDefaults() {
    return this.db.systemSettings.upsert({
      where: { id: DEFAULT_SETTINGS_ID },
      update: {},
      create: {
        id: DEFAULT_SETTINGS_ID,
        tencentSesTemplateId: DEFAULT_SES_TEMPLATE_ID,
        allowedEmailProviders: ["gmail", "qq", "163", "126"],
      },
    });
  }
}

function serializeSettings(settings: {
  tencentSesSecretId: string;
  tencentSesSecretKey: string;
  tencentSesFromAddress: string;
  tencentSesTemplateId: number;
  allowedEmailProviders: string[];
  updatedAt: Date;
}): SystemSettings {
  return {
    tencentSesSecretId: settings.tencentSesSecretId,
    tencentSesSecretKeyConfigured: settings.tencentSesSecretKey.length > 0,
    tencentSesFromAddress: settings.tencentSesFromAddress,
    tencentSesTemplateId: settings.tencentSesTemplateId,
    allowedEmailProviders: settings.allowedEmailProviders,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
