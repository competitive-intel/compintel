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
  "gmail",
  "qq",
  "163",
  "126",
  "outlook",
  "yahoo",
  "icloud",
  "foxmail",
] as const;

type SettingsForm = {
  tencentSesSecretId: string;
  tencentSesSecretKey: string;
  tencentSesFromAddress: string;
  tencentSesTemplateId: string;
  allowedEmailProviders: string[];
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
    const templateId = Number.parseInt(form.tencentSesTemplateId, 10);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      setSavedMessage(null);
      setClientError("请输入有效的 SES 模板 ID");
      return;
    }
    setClientError(null);
    setSavedMessage(null);
    const input: UpdateSystemSettingsInput = {
      tencentSesSecretId: form.tencentSesSecretId,
      tencentSesFromAddress: form.tencentSesFromAddress,
      tencentSesTemplateId: templateId,
      allowedEmailProviders: form.allowedEmailProviders,
    };
    if (form.tencentSesSecretKey.length > 0) {
      input.tencentSesSecretKey = form.tencentSesSecretKey;
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
              配置注册邮箱验证所用的腾讯云 SES 凭证与允许的邮箱提供商。
            </p>
          </div>
          <form
            id="system-settings-form"
            className="flex flex-col gap-6"
            onSubmit={handleSubmit}
          >
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="ses-secret-id">
                  腾讯云 SES SecretId（AK）
                </FieldLabel>
                <Input
                  id="ses-secret-id"
                  autoComplete="off"
                  value={form.tencentSesSecretId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      tencentSesSecretId: event.target.value,
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ses-secret-key">
                  腾讯云 SES SecretKey（SK）
                </FieldLabel>
                <Input
                  id="ses-secret-key"
                  type="password"
                  autoComplete="new-password"
                  value={form.tencentSesSecretKey}
                  placeholder={
                    settings.data?.tencentSesSecretKeyConfigured
                      ? "已配置（留空不修改）"
                      : "尚未配置"
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      tencentSesSecretKey: event.target.value,
                    })
                  }
                />
                <FieldDescription>
                  出于安全考虑，已保存的 SecretKey 不会回显。
                </FieldDescription>
              </Field>
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
                  允许的邮箱提供商
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
                    id="allowed-providers"
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
                          <ComboboxChipsInput placeholder="选择邮箱提供商…" />
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
                  仅可从主流邮箱提供商中选择。
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
    tencentSesSecretId: settings.tencentSesSecretId,
    tencentSesSecretKey: "",
    tencentSesFromAddress: settings.tencentSesFromAddress,
    tencentSesTemplateId: String(settings.tencentSesTemplateId),
    allowedEmailProviders: settings.allowedEmailProviders,
  };
}
