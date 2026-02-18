import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Globe } from 'lucide-react';
import { getServiceTypes } from '@/utils/aiServiceUtils';
import type { AIService } from '@/services/aiServiceSettingsService';
import { ServiceForm } from './ServiceForm';

interface ServiceListItemProps {
  service: AIService;
  isEditing: boolean;
  editData: Partial<
    AIService & { showCustomModelInput?: boolean; api_key?: string }
  >;
  onEditDataChange: (
    data: Partial<
      AIService & { showCustomModelInput?: boolean; api_key?: string }
    >
  ) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  loading?: boolean;
  translationPrefix?: string;
  showGlobalBadge?: boolean;
}

export const ServiceListItem = ({
  service,
  isEditing,
  editData,
  onEditDataChange,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  loading = false,
  translationPrefix = 'settings.aiService.globalSettings',
  showGlobalBadge = true,
}: ServiceListItemProps) => {
  const { t } = useTranslation();
  const serviceTypes = getServiceTypes(t);
  const serviceTypeLabel =
    serviceTypes.find((t) => t.value === service.service_type)?.label ||
    service.service_type;

  if (isEditing) {
    const formData = {
      service_name: editData.service_name || service.service_name,
      service_type: editData.service_type || service.service_type,
      api_key: editData.api_key || '',
      custom_url: editData.custom_url || service.custom_url || '',
      system_prompt: editData.system_prompt || service.system_prompt || '',
      is_active:
        editData.is_active !== undefined
          ? editData.is_active
          : service.is_active,
      model_name: editData.model_name || service.model_name || '',
      custom_model_name: editData.custom_model_name || service.model_name || '',
      showCustomModelInput: editData.showCustomModelInput || false,
    };

    return (
      <div className="border rounded-lg p-4">
        <ServiceForm
          formData={formData}
          onFormDataChange={(data) => {
            onEditDataChange(data);
          }}
          onSubmit={onUpdate}
          onCancel={onCancelEdit}
          loading={loading}
          isEdit={true}
          translationPrefix={translationPrefix}
        />
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{service.service_name}</h4>
              {showGlobalBadge && service.is_public && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {t(`${translationPrefix}.global`)}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {serviceTypeLabel}
              {service.model_name && ` - ${service.model_name}`}
              {service.custom_url && ` - ${service.custom_url}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onStartEdit}
              disabled={loading}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={loading}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {service.system_prompt && (
          <div>
            <Label className="text-xs">
              {t(`${translationPrefix}.systemPrompt`)}:
            </Label>
            <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
              {service.system_prompt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
