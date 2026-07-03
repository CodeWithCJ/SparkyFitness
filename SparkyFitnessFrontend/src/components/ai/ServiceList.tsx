import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import { ServiceListItem } from './ServiceListItem';
import { AiServiceSettingsResponse } from '@workspace/shared';
import { UpdateAiServiceSettingsFormInput } from '@/schemas/form/AiServiceSettings.form.zod';
import type { TestConnectionStatus } from '@/hooks/AI/useTestAIServiceConnection';

interface ServiceListProps {
  services: AiServiceSettingsResponse[];
  editingService: string | null;
  editData: UpdateAiServiceSettingsFormInput;
  onEditDataChange: (data: UpdateAiServiceSettingsFormInput) => void;
  onStartEdit: (service: AiServiceSettingsResponse) => void;
  onCancelEdit: () => void;
  onUpdate: (serviceId: string) => void;
  onDelete: (serviceId: string) => void;
  loading?: boolean;
  translationPrefix?: string;
  showGlobalBadge?: boolean;
  // Pure passthrough to each ServiceListItem; binds the model from ServiceForm
  // to the service being edited. The owning page calls the test hook.
  onTestConnection?: (serviceId: string, selectedModel: string) => void;
  testing?: boolean;
  testStatus?: TestConnectionStatus;
}

export const ServiceList = ({
  services,
  editingService,
  editData,
  onEditDataChange,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  loading = false,
  translationPrefix = 'settings.aiService.globalSettings',
  showGlobalBadge = true,
  onTestConnection,
  testing = false,
  testStatus = null,
}: ServiceListProps) => {
  const { t } = useTranslation();

  if (services.length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <h3 className="text-lg font-medium">
        {t(`${translationPrefix}.globalServices`)}
      </h3>

      <div className="space-y-4">
        {services.map((service) => (
          <ServiceListItem
            key={service.id}
            service={service}
            isEditing={editingService === service.id}
            editData={editData}
            onEditDataChange={onEditDataChange}
            onStartEdit={() => onStartEdit(service)}
            onCancelEdit={onCancelEdit}
            onUpdate={() => onUpdate(service.id)}
            onDelete={() => onDelete(service.id)}
            loading={loading}
            translationPrefix={translationPrefix}
            showGlobalBadge={showGlobalBadge}
            onTestConnection={
              onTestConnection
                ? (model) => onTestConnection(service.id, model)
                : undefined
            }
            testing={testing}
            testStatus={testStatus}
          />
        ))}
      </div>
    </>
  );
};
