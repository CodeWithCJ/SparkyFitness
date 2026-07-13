import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Save, X, Plug, Loader2, AlertTriangle } from 'lucide-react';
import {
  getServiceTypes,
  getModelOptions,
  requiresApiKey,
} from '@/utils/aiServiceUtils';
import { useToast } from '@/hooks/use-toast';
import {
  AiServiceSettingsFormInput,
  UpdateAiServiceSettingsFormInput,
} from '@/schemas/form/AiServiceSettings.form.zod';
import type { TestConnectionStatus } from '@/hooks/AI/useTestAIServiceConnection';

interface ServiceFormProps {
  formData: AiServiceSettingsFormInput;
  onFormDataChange: (data: UpdateAiServiceSettingsFormInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading?: boolean;
  isEdit?: boolean;
  translationPrefix?: string; // 'settings.aiService.globalSettings' or 'settings.aiService.userSettings'
  // When provided, renders a "Test Connection" button that runs a live check
  // against the current config. Receives the effective model the form resolves.
  onTestConnection?: (selectedModel: string) => void;
  testing?: boolean;
  // Inline result shown next to the button; hidden while a test is in flight.
  testStatus?: TestConnectionStatus;
}

export const ServiceForm = ({
  formData,
  onFormDataChange,
  onSubmit,
  onCancel,
  loading = false,
  isEdit = false,
  translationPrefix = 'settings.aiService.globalSettings',
  onTestConnection,
  testing = false,
  testStatus = null,
}: ServiceFormProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const serviceTypes = getServiceTypes(t);
  const modelOptions = getModelOptions(formData.service_type ?? '');

  // The effective model is whichever input is active for this service type.
  const selectedModel = (
    formData.showCustomModelInput
      ? formData.custom_model_name
      : formData.model_name
  )?.trim();

  const requiresCustomUrl =
    formData.service_type === 'custom' ||
    formData.service_type === 'ollama' ||
    formData.service_type === 'openai_compatible';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Providers with preset models (openai, anthropic, ...) have a sensible
        // server-side default, so a blank model is fine. Types without presets
        // (openai_compatible/custom/ollama) point at user-hosted servers with no
        // reliable default, so require an explicit model there.
        if (modelOptions.length === 0 && !selectedModel) {
          toast({
            title: t(`${translationPrefix}.error`),
            description: t(`${translationPrefix}.fillRequiredFields`),
            variant: 'destructive',
          });
          return;
        }
        onSubmit();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="service_name">
            {t(`${translationPrefix}.serviceName`)}
          </Label>
          <Input
            id="service_name"
            value={formData.service_name}
            onChange={(e) => onFormDataChange({ service_name: e.target.value })}
            placeholder={t(`${translationPrefix}.serviceNamePlaceholder`)}
            autoComplete="username"
          />
        </div>
        <div>
          <Label htmlFor="service_type">
            {t(`${translationPrefix}.serviceType`)}
          </Label>
          <Select
            value={formData.service_type}
            onValueChange={(value) =>
              onFormDataChange({
                service_type: value,
                model_name: '',
                custom_model_name: '',
                // Types without preset models (openai_compatible/custom/ollama)
                // have no dropdown, so reveal the custom-model input directly.
                showCustomModelInput: getModelOptions(value).length === 0,
                // Default all services to the 'full' tool profile.
                // Users can manually select 'core' if they wish to optimize
                // their local system performance, and are guided by warnings.
                chat_tool_profile: 'full',
              })
            }
          >
            <SelectTrigger id="service_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {serviceTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="api_key">
          {requiresApiKey(formData.service_type)
            ? t(`${translationPrefix}.apiKey`)
            : t(`${translationPrefix}.apiKeyOptional`)}
        </Label>
        <Input
          id="api_key"
          type="password"
          value={formData.api_key}
          onChange={(e) => onFormDataChange({ api_key: e.target.value })}
          placeholder={
            formData.service_type === 'ollama'
              ? t(`${translationPrefix}.apiKeyPlaceholderOllama`)
              : isEdit
                ? t(`${translationPrefix}.enterNewApiKey`)
                : t(`${translationPrefix}.apiKeyPlaceholder`)
          }
          autoComplete={isEdit ? 'off' : 'new-password'}
        />
        {isEdit && formData.service_type !== 'ollama' && (
          <p className="text-xs text-muted-foreground mt-1">
            {t(`${translationPrefix}.apiKeyUpdateDescription`)}
          </p>
        )}
      </div>

      {requiresCustomUrl && (
        <div>
          <Label htmlFor="custom_url">
            {t(`${translationPrefix}.customUrl`)}
          </Label>
          <Input
            id="custom_url"
            value={formData.custom_url ?? ''}
            onChange={(e) => onFormDataChange({ custom_url: e.target.value })}
            placeholder={
              formData.service_type === 'ollama'
                ? t(`${translationPrefix}.customUrlPlaceholderOllama`)
                : t(`${translationPrefix}.customUrlPlaceholder`)
            }
          />
        </div>
      )}

      {/* Self-hosted types (ollama/openai_compatible/custom) can point at
          small local models with no prompt cache, where the full 35-tool
          block is the dominant per-turn token cost — offer the leaner 'core'
          profile for all of them. The server only honors 'core' for these
          types (see chatService.prepareChatContext). */}
      {requiresCustomUrl && (
        <>
          <div>
            <Label htmlFor="chat_tool_profile">
              {t(`${translationPrefix}.chatToolProfile`)}
            </Label>
            <Select
              value={formData.chat_tool_profile ?? 'full'}
              onValueChange={(value) =>
                onFormDataChange({
                  chat_tool_profile: value as 'full' | 'core',
                })
              }
            >
              <SelectTrigger id="chat_tool_profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">
                  {t(`${translationPrefix}.chatToolProfileFull`)}
                </SelectItem>
                <SelectItem value="core">
                  {t(`${translationPrefix}.chatToolProfileCore`)}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {t(`${translationPrefix}.chatToolProfileDescription`)}
            </p>
          </div>

          {formData.service_type === 'ollama' &&
            (formData.chat_tool_profile === 'full' ||
              !formData.chat_tool_profile) && (
              <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-medium">
                    {t(`${translationPrefix}.ollamaFullProfileWarningTitle`)}
                  </p>
                  <p className="mt-1">
                    {t(`${translationPrefix}.ollamaFullProfileWarningHint`)}
                  </p>
                </div>
              </div>
            )}

          {/* Ollama silently truncates prompts past its default 4096-token
              context, which corrupts tool calls. Surface this prominently so
              users raise it before blaming the model. */}
          {formData.service_type === 'ollama' && (
            <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-medium">
                  {t(`${translationPrefix}.ollamaContextTitle`)}
                </p>
                <p className="mt-1">
                  {t(`${translationPrefix}.ollamaContextHint`)}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex items-center space-x-2 mb-4">
        <Switch
          id="use_custom_model"
          checked={formData.showCustomModelInput ?? false}
          onCheckedChange={(checked) =>
            onFormDataChange({ showCustomModelInput: checked })
          }
        />
        <Label htmlFor="use_custom_model">
          {t(`${translationPrefix}.useCustomModel`)}
        </Label>
      </div>

      {!formData.showCustomModelInput && modelOptions.length > 0 && (
        <div>
          <Label htmlFor="model_name_select">
            {t(`${translationPrefix}.model`)}
          </Label>
          <Select
            value={formData.model_name ?? ''}
            onValueChange={(value) => onFormDataChange({ model_name: value })}
          >
            <SelectTrigger id="model_name_select">
              <SelectValue
                placeholder={t(`${translationPrefix}.selectModel`)}
              />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {t(`${translationPrefix}.recommendedModel`, {
              model: modelOptions[0],
            })}
          </p>
        </div>
      )}

      {formData.showCustomModelInput && (
        <div>
          <Label htmlFor="custom_model_name_input">
            {t(`${translationPrefix}.customModelName`)}
          </Label>
          <Input
            id="custom_model_name_input"
            value={formData.custom_model_name ?? ''}
            onChange={(e) =>
              onFormDataChange({ custom_model_name: e.target.value })
            }
            placeholder={t(`${translationPrefix}.customModelNamePlaceholder`)}
          />
        </div>
      )}

      <div>
        <Label htmlFor="system_prompt">
          {t(`${translationPrefix}.systemPrompt`)}
        </Label>
        <Textarea
          id="system_prompt"
          value={formData.system_prompt ?? ''}
          onChange={(e) => onFormDataChange({ system_prompt: e.target.value })}
          placeholder={t(`${translationPrefix}.systemPromptPlaceholder`)}
          rows={3}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) =>
            onFormDataChange({ is_active: checked })
          }
        />
        <Label htmlFor="is_active">
          {isEdit
            ? t(`${translationPrefix}.activeService`)
            : t(`${translationPrefix}.setAsActive`)}
        </Label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {isEdit
            ? t(`${translationPrefix}.saveChanges`)
            : t(`${translationPrefix}.addService`)}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-2" />
          {t(`${translationPrefix}.cancel`)}
        </Button>
        {onTestConnection && (
          // type="button" is critical — the test must not submit the form.
          // Disabled with the same guard as submit so a config the form would
          // reject can't be tested either.
          <Button
            type="button"
            variant="outline"
            onClick={() => onTestConnection(selectedModel ?? '')}
            disabled={
              loading ||
              testing ||
              (modelOptions.length === 0 && !selectedModel) ||
              (requiresCustomUrl && !formData.custom_url?.trim())
            }
          >
            {testing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plug className="h-4 w-4 mr-2" />
            )}
            {testing
              ? t(`${translationPrefix}.testing`)
              : t(`${translationPrefix}.testConnection`)}
          </Button>
        )}
        {/* Inline result next to the button; hidden while a test is running. */}
        {onTestConnection && !testing && testStatus && (
          <span
            className={
              testStatus.state === 'success'
                ? 'text-sm font-medium text-green-600 dark:text-green-400'
                : 'text-sm font-medium text-destructive'
            }
          >
            {testStatus.state === 'success'
              ? t('settings.aiService.test.successTitle')
              : `${t('settings.aiService.test.failureTitle')}: ${testStatus.message}`}
          </span>
        )}
      </div>
    </form>
  );
};
