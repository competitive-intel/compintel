import type {
  SystemSettings,
  UpdateSystemSettingsInput,
} from "@compintel/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { PageTitle } from "../../components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "../../components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import {
  ApiError,
  getSystemSettings,
  updateSystemSettings,
} from "../../lib/api";
import { usePageTitle } from "../../lib/use-page-title";

const settingsQueryKey = ["admin", "system-settings"] as const;

const EMAIL_PROVIDERS = [
  "gmail.com",
  "qq.com",
  "163.com",
  "126.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "foxmail.com",
] as const;

type SettingsForm = {
  tencentSesFromAddress: string;
  tencentSesTemplateId: string;
  allowedEmailProviders: string[];
  turnstileSiteKey: string;
  turnstileSecretKey: string;
};

export function AdminSystemSettingsPage() {
  usePageTitle("系统设置");
  const queryClient = useQueryClient();
  const providersAnchor = useComboboxAnchor();
  const settings = useQuery({
    queryKey: settingsQueryKey,
    queryFn: ({ signal }) => getSystemSettings(signal),
  });
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data !== undefined) {
      setForm(toForm(settings.data));
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (input: UpdateSystemSettingsInput) =>
      updateSystemSettings(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsQueryKey, updated);
      setForm(toForm(updated));
      setClientError(null);
      setSavedMessage("系统设置已保存。");
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form === null) return;
    const rawTemplateId = form.tencentSesTemplateId.trim();
    if (!/^\d+$/.test(rawTemplateId)) {
      setSavedMessage(null);
      setClientError("请输入有效的 SES 模板 ID");
      return;
    }
    const templateId = Number.parseInt(rawTemplateId, 10);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      setSavedMessage(null);
      setClientError("请输入有效的 SES 模板 ID");
      return;
    }
    setClientError(null);
    setSavedMessage(null);
    const input: UpdateSystemSettingsInput = {
      tencentSesFromAddress: form.tencentSesFromAddress,
      tencentSesTemplateId: templateId,
      allowedEmailProviders: form.allowedEmailProviders,
      turnstileSiteKey: form.turnstileSiteKey,
    };
    if (form.turnstileSecretKey.length > 0) {
      input.turnstileSecretKey = form.turnstileSecretKey;
    }
    save.mutate(input);
  }

  return (
    <section className="py-10 sm:py-12">
      <header className="mb-8">
        <PageTitle>系统设置</PageTitle>
      </header>

      {settings.isPending && (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="animate-spin" />
          正在加载系统设置…
        </div>
      )}
      {settings.isError && (
        <Alert variant="destructive">
          <AlertTitle>系统设置加载失败</AlertTitle>
          <AlertDescription>
            {settings.error instanceof ApiError
              ? settings.error.message
              : "请稍后重试"}
          </AlertDescription>
        </Alert>
      )}
      {form !== null && (
        <div className="flex max-w-2xl flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">腾讯云邮件推送</h2>
            <p className="text-sm text-muted-foreground">
              配置注册邮箱验证所用的发件地址、模板与允许的邮箱提供商。API
              密钥通过服务器环境变量配置，不在此页面填写。
            </p>
          </div>
          <form
            id="system-settings-form"
            className="flex flex-col gap-6"
            onSubmit={handleSubmit}
          >
            <FieldGroup className="gap-5">
              {settings.data?.tencentSesCredentialsConfigured === false && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>SES 凭证未配置</AlertTitle>
                  <AlertDescription>
                    服务器尚未配置腾讯云 SES 凭证，当前无法发送验证邮件。
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="ses-from-address">
                  腾讯云 SES 发件地址
                </FieldLabel>
                <Input
                  id="ses-from-address"
                  autoComplete="off"
                  value={form.tencentSesFromAddress}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      tencentSesFromAddress: event.target.value,
                    })
                  }
                />
                <FieldDescription>
                  例如：CompIntel &lt;noreply@mail.example.com&gt;
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="ses-template-id">
                  腾讯云 SES 模板 ID
                </FieldLabel>
                <Input
                  id="ses-template-id"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.tencentSesTemplateId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      tencentSesTemplateId: event.target.value,
                    })
                  }
                />
                <FieldDescription>
                  验证码邮件模板需包含 username 与 verifyCode 占位符。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="allowed-providers">
                  允许的邮箱提供商域名
                </FieldLabel>
                <Combobox
                  multiple
                  autoHighlight
                  items={[...EMAIL_PROVIDERS]}
                  value={form.allowedEmailProviders}
                  onValueChange={(next) =>
                    setForm({
                      ...form,
                      allowedEmailProviders: next ?? [],
                    })
                  }
                >
                  <ComboboxChips
                    ref={providersAnchor}
                    className="w-full"
                  >
                    <ComboboxValue>
                      {(values) => (
                        <>
                          {values.map((provider: string) => (
                            <ComboboxChip key={provider}>
                              {provider}
                            </ComboboxChip>
                          ))}
                          <ComboboxChipsInput
                            id="allowed-providers"
                            placeholder="选择邮箱域名…"
                          />
                        </>
                      )}
                    </ComboboxValue>
                  </ComboboxChips>
                  <ComboboxContent anchor={providersAnchor}>
                    <ComboboxEmpty>没有匹配的提供商</ComboboxEmpty>
                    <ComboboxList>
                      {(item) => (
                        <ComboboxItem key={item} value={item}>
                          {item}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <FieldDescription>
                  按完整注册域匹配，合法子域（如 vip.163.com）自动放行。
                </FieldDescription>
              </Field>

              <div className="flex flex-col gap-2 pt-2">
                <h2 className="text-xl font-semibold">Cloudflare Turnstile</h2>
                <p className="text-sm text-muted-foreground">
                  同一 IP 在 3 小时内成功发送验证邮件超过 5
                  封后需要人机验证；超过 10 封将直接拒绝发信。
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="turnstile-site-key">
                  Turnstile Site Key
                </FieldLabel>
                <Input
                  id="turnstile-site-key"
                  autoComplete="off"
                  value={form.turnstileSiteKey}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      turnstileSiteKey: event.target.value,
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="turnstile-secret-key">
                  Turnstile Secret Key
                </FieldLabel>
                <Input
                  id="turnstile-secret-key"
                  type="password"
                  autoComplete="new-password"
                  value={form.turnstileSecretKey}
                  placeholder={
                    settings.data?.turnstileSecretKeyConfigured
                      ? "已配置（留空不修改）"
                      : "尚未配置"
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      turnstileSecretKey: event.target.value,
                    })
                  }
                />
                <FieldDescription>
                  Secret Key 不会回显到前端；触发限流后注册/重发页会展示
                  Turnstile。
                </FieldDescription>
              </Field>

              {clientError !== null && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>校验失败</AlertTitle>
                  <AlertDescription>{clientError}</AlertDescription>
                </Alert>
              )}
              {save.isError && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>保存失败</AlertTitle>
                  <AlertDescription>
                    {save.error instanceof ApiError
                      ? save.error.message
                      : "请稍后重试"}
                  </AlertDescription>
                </Alert>
              )}
              {savedMessage !== null && (
                <Alert>
                  <AlertTitle>保存成功</AlertTitle>
                  <AlertDescription>{savedMessage}</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
            <div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && (
                  <LoaderCircle
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {save.isPending ? "正在保存…" : "保存设置"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function toForm(settings: SystemSettings): SettingsForm {
  return {
    tencentSesFromAddress: settings.tencentSesFromAddress,
    tencentSesTemplateId: String(settings.tencentSesTemplateId),
    allowedEmailProviders: settings.allowedEmailProviders,
    turnstileSiteKey: settings.turnstileSiteKey,
    turnstileSecretKey: "",
  };
}
