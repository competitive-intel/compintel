export const TENCENT_SES_REGION = "ap-hongkong";

export interface SendVerificationEmailInput {
  secretId: string;
  secretKey: string;
  fromAddress: string;
  templateId: number;
  toAddress: string;
  username: string;
  verifyCode: string;
}

export interface SesClient {
  sendVerificationEmail(input: SendVerificationEmailInput): Promise<void>;
}

export function createTencentSesClient(): SesClient {
  return {
    async sendVerificationEmail(input) {
      const { ses } = await import("tencentcloud-sdk-nodejs-ses");
      const client = new ses.v20201002.Client({
        credential: {
          secretId: input.secretId,
          secretKey: input.secretKey,
        },
        region: TENCENT_SES_REGION,
        profile: {
          httpProfile: {
            reqTimeout: 30,
          },
        },
      });

      await client.SendEmail({
        FromEmailAddress: input.fromAddress,
        Destination: [input.toAddress],
        Subject: "CompIntel 邮箱验证码",
        Template: {
          TemplateID: input.templateId,
          TemplateData: JSON.stringify({
            username: input.username,
            verifyCode: input.verifyCode,
          }),
        },
        TriggerType: 1,
      });
    },
  };
}
