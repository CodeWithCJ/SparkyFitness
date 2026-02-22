import { useTranslation } from 'react-i18next';
import { Separator } from '@/components/ui/separator';
import type { AIService } from '@/api/Settings/aiServiceSettingsService';
import { ServiceListItem } from './ServiceListItem';

interface ServiceListProps {
  services: AIService[];
  editingService: string | null;
  editData: Partial<
    AIService & { showCustomModelInput?: boolean; api_key?: string }
  >;
  onEditDataChange: (
    data: Partial<
      AIService & { showCustomModelInput?: boolean; api_key?: string }
    >
  ) => void;
  onStartEdit: (service: AIService) => void;
  onCancelEdit: () => void;
  onUpdate: (serviceId: string) => void;
  onDelete: (serviceId: string) => void;
  loading?: boolean;
  translationPrefix?: string;
  showGlobalBadge?: boolean;
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
          />
        ))}
      </div>
    </>
  );
};
