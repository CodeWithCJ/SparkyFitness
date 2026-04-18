import { Database, GripVertical } from 'lucide-react';
import type { ExternalDataProvider } from './ExternalProviderSettings';
import {
  useExternalProviders,
  useUpdateExternalProviderMutation,
} from '@/hooks/Settings/useExternalProviderSettings';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { EditProviderForm } from './EditProviderForm';
import { ProviderCard } from './ProviderCard';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ExternalProviderListProps {
  showAddForm: boolean;
}

interface SortableProviderRowProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

const SortableProviderRow = ({
  id,
  children,
  disabled = false,
}: SortableProviderRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-4 bg-background"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Drag to reorder provider"
          className="mt-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing disabled:opacity-40"
          {...attributes}
          {...listeners}
          disabled={disabled}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
};

const ExternalProviderList = ({ showAddForm }: ExternalProviderListProps) => {
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ExternalDataProvider>>({});

  const { user } = useAuth();
  const {
    defaultFoodDataProviderId,
    setDefaultFoodDataProviderId,
    defaultBarcodeProviderId,
    setDefaultBarcodeProviderId,
    saveAllPreferences,
  } = usePreferences();

  const { data: providers = [], isLoading: providersLoading } =
    useExternalProviders(user?.activeUserId);

  const { mutateAsync: updateExternalProvider, isPending: updatePending } =
    useUpdateExternalProviderMutation();

  const loading = providersLoading || updatePending;

  const [optimisticProviders, setOptimisticProviders] = useState<
    ExternalDataProvider[] | null
  >(null);

  const sortedProviders = useMemo(() => {
    return [...providers].sort((a, b) => {
      const aOrder = a.sort_order;
      const bOrder = b.sort_order;

      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;

      return a.provider_name.localeCompare(b.provider_name);
    });
  }, [providers]);

  const displayProviders = optimisticProviders ?? sortedProviders;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const providerIds = useMemo(
    () => displayProviders.map((p) => p.id),
    [displayProviders]
  );

  const handleUpdateProvider = async (providerId: string) => {
    const providerUpdateData: Partial<ExternalDataProvider> = {
      provider_name: editData.provider_name,
      provider_type: editData.provider_type,
      // OFF: GET /external-providers does not return decrypted app_id/app_key,
      // and startEditing seeds app_key to '' (we never echo passwords back to
      // the DOM). For both fields we cannot distinguish "untouched" from
      // "user cleared", so blank means "leave existing". To remove stored OFF
      // credentials, users must delete and re-add the provider.
      app_id:
        editData.provider_type === 'mealie' ||
        editData.provider_type === 'tandoor' ||
        editData.provider_type === 'free-exercise-db' ||
        editData.provider_type === 'wger'
          ? null
          : editData.provider_type === 'openfoodfacts'
            ? editData.app_id || undefined
            : editData.app_id || null,
      app_key:
        editData.provider_type === 'openfoodfacts'
          ? editData.app_key || undefined
          : editData.app_key || null,
      is_active: editData.is_active,
      base_url:
        editData.provider_type === 'mealie' ||
        editData.provider_type === 'tandoor' ||
        editData.provider_type === 'free-exercise-db'
          ? editData.base_url || null
          : null,
      withings_last_sync_at:
        editData.provider_type === 'withings'
          ? editData.withings_last_sync_at
          : null,
      withings_token_expires:
        editData.provider_type === 'withings'
          ? editData.withings_token_expires
          : null,
      fitbit_last_sync_at:
        editData.provider_type === 'fitbit'
          ? editData.fitbit_last_sync_at
          : null,
      fitbit_token_expires:
        editData.provider_type === 'fitbit'
          ? editData.fitbit_token_expires
          : null,
      polar_last_sync_at:
        editData.provider_type === 'polar' ? editData.polar_last_sync_at : null,
      polar_token_expires:
        editData.provider_type === 'polar'
          ? editData.polar_token_expires
          : null,
      strava_last_sync_at:
        editData.provider_type === 'strava'
          ? editData.strava_last_sync_at
          : null,
      strava_token_expires:
        editData.provider_type === 'strava'
          ? editData.strava_token_expires
          : null,
      sync_frequency:
        editData.provider_type === 'withings' ||
        editData.provider_type === 'garmin' ||
        editData.provider_type === 'fitbit' ||
        editData.provider_type === 'hevy' ||
        editData.provider_type === 'strava' ||
        editData.provider_type === 'polar'
          ? editData.sync_frequency
          : undefined,
    };

    try {
      const data = await updateExternalProvider({
        id: providerId,
        data: providerUpdateData,
      });

      setEditData({});
      setEditingProvider(null);

      if (
        data &&
        data.is_active &&
        (data.provider_type === 'openfoodfacts' ||
          data.provider_type === 'nutritionix' ||
          data.provider_type === 'fatsecret' ||
          data.provider_type === 'mealie' ||
          data.provider_type === 'tandoor' ||
          data.provider_type === 'usda')
      ) {
        setDefaultFoodDataProviderId(data.id);
      } else if (data && defaultFoodDataProviderId === data.id) {
        setDefaultFoodDataProviderId(null);
      }

      if (data && !data.is_active && defaultBarcodeProviderId === data.id) {
        setDefaultBarcodeProviderId(null);
        saveAllPreferences({ defaultBarcodeProviderId: null });
      }
    } catch (error: unknown) {
      console.error('Error updating external data provider:', error);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Prevent reorder while editing for cleaner UX
    if (editingProvider) return;

    const oldIndex = displayProviders.findIndex((p) => p.id === active.id);
    const newIndex = displayProviders.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(displayProviders, oldIndex, newIndex);
    setOptimisticProviders(next); // optimistic

    // Optional persistence if your backend supports sort_order
    try {
      await Promise.all(
        next.map((provider, index) =>
          updateExternalProvider({
            id: provider.id,
            data: { sort_order: index } as Partial<ExternalDataProvider>,
          })
        )
      );
    } catch (error) {
      console.error('Failed to persist provider order:', error);
      setOptimisticProviders(null); // rollback
    }
  };

  const startEditing = (provider: ExternalDataProvider) => {
    setEditingProvider(provider.id);
    setEditData({
      provider_name: provider.provider_name,
      provider_type: provider.provider_type,
      app_id: provider.app_id || null,
      // Never pre-fill API keys when editing for security/privacy
      app_key: '',
      is_active: provider.is_active,
      base_url: provider.base_url || '',
      last_sync_at: provider.last_sync_at || '',
      sync_frequency: provider.sync_frequency || 'manual',
      garmin_connect_status: provider.garmin_connect_status || 'disconnected',
      garmin_last_status_check: provider.garmin_last_status_check || '',
      garmin_token_expires: provider.garmin_token_expires || '',
      withings_last_sync_at: provider.withings_last_sync_at || '',
      withings_token_expires: provider.withings_token_expires || '',
      fitbit_last_sync_at: provider.fitbit_last_sync_at || '',
      fitbit_token_expires: provider.fitbit_token_expires || '',
      polar_last_sync_at: provider.polar_last_sync_at || '',
      polar_token_expires: provider.polar_token_expires || '',
    });
  };

  const cancelEditing = () => {
    setEditingProvider(null);
    setEditData({});
  };

  if (displayProviders.length === 0 && !showAddForm) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No data providers configured yet.</p>
        <p className="text-sm">
          Add your first data provider to enable search from external sources.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={providerIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-4">
          {displayProviders.map((provider) => (
            <SortableProviderRow
              key={provider.id}
              id={provider.id}
              disabled={loading || editingProvider !== null}
            >
              {editingProvider === provider.id ? (
                <EditProviderForm
                  provider={provider}
                  editData={editData}
                  setEditData={setEditData}
                  onSubmit={handleUpdateProvider}
                  onCancel={cancelEditing}
                  loading={loading}
                />
              ) : (
                <ProviderCard
                  provider={provider}
                  isLoading={loading}
                  startEditing={startEditing}
                />
              )}
            </SortableProviderRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default ExternalProviderList;
