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
import { Save, X } from 'lucide-react';
import { getServiceTypes, getModelOptions } from '@/utils/aiServiceUtils';

interface ServiceFormData {
  service_name: string;
  service_type: string;
  api_key: string;
  custom_url: string;
  system_prompt: string;
  is_active: boolean;
  model_name: string;
  custom_model_name: string;
  showCustomModelInput: boolean;
}

interface ServiceFormProps {
  formData: ServiceFormData;
  onFormDataChange: (data: Partial<ServiceFormData>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading?: boolean;
  isEdit?: boolean;
  translationPrefix?: string; // 'settings.aiService.globalSettings' or 'settings.aiService.userSettings'
}

export const ServiceForm = ({
  formData,
  onFormDataChange,
  onSubmit,
  onCancel,
  loading = false,
  isEdit = false,
  translationPrefix = 'settings.aiService.globalSettings',
}: ServiceFormProps) => {
  const { t } = useTranslation();
  const serviceTypes = getServiceTypes(t);
  const modelOptions = getModelOptions(formData.service_type);

  const requiresCustomUrl =
    formData.service_type === 'custom' ||
    formData.service_type === 'ollama' ||
    formData.service_type === 'openai_compatible';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
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
          {formData.service_type === 'ollama'
            ? t(`${translationPrefix}.apiKeyOptional`)
            : t(`${translationPrefix}.apiKey`)}
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
            value={formData.custom_url}
            onChange={(e) => onFormDataChange({ custom_url: e.target.value })}
            placeholder={
              formData.service_type === 'ollama'
                ? t(`${translationPrefix}.customUrlPlaceholderOllama`)
                : t(`${translationPrefix}.customUrlPlaceholder`)
            }
          />
        </div>
      )}

      <div className="flex items-center space-x-2 mb-4">
        <Switch
          id="use_custom_model"
          checked={formData.showCustomModelInput}
          onCheckedChange={(checked) =>
            onFormDataChange({
              showCustomModelInput: checked,
              model_name: '',
              custom_model_name: '',
            })
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
            value={formData.model_name}
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
        </div>
      )}

      {formData.showCustomModelInput && (
        <div>
          <Label htmlFor="custom_model_name_input">
            {t(`${translationPrefix}.customModelName`)}
          </Label>
          <Input
            id="custom_model_name_input"
            value={formData.custom_model_name}
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
          value={formData.system_prompt}
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

      <div className="flex gap-2">
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
      </div>
    </form>
  );
};
