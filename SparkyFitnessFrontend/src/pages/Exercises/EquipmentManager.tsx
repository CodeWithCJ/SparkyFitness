import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { Dumbbell, Footprints, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import {
  inventoryConfigFrom,
  type CreateShoeBody,
  type ShoeResponse,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCreateShoeMutation,
  useDeleteShoeMutation,
  useShoes,
  useUpdateShoeMutation,
} from '@/hooks/Shoes/useShoes';
import {
  usePlateInventory,
  useResetPlateInventoryMutation,
  useSavePlateInventoryMutation,
} from '@/hooks/PlateInventory/usePlateInventory';
import {
  barLabel,
  formatPlateWeight,
} from '@/components/PlateCalculator/plateFormat';
import { ShoeFormDialog } from './ShoeFormDialog';
import { PlateInventoryDialog } from './PlateInventoryDialog';

const ShoeCard: React.FC<{
  shoe: ShoeResponse;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRetired: () => void;
  /** A delegate who can only view reports sees the pair but cannot change it. */
  readOnly?: boolean;
}> = ({ shoe, onEdit, onDelete, onToggleRetired, readOnly }) => {
  const { t } = useTranslation();
  const { distanceUnit, convertDistance } = usePreferences();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const show = (km: number) =>
    convertDistance(km, 'km', distanceUnit).toFixed(1);
  const percent = Math.min(
    100,
    (shoe.total_distance_km / shoe.retirement_distance_km) * 100
  );
  const subtitle = [shoe.brand, shoe.model].filter(Boolean).join(' ');

  return (
    <Card className={shoe.status === 'retired' ? 'opacity-70' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="truncate">{shoe.nickname || shoe.name}</span>
              {shoe.is_default && (
                <Star
                  className="h-4 w-4 shrink-0 fill-current"
                  aria-label={t('shoes.default', 'Default pair')}
                />
              )}
            </CardTitle>
            <CardDescription className="truncate">
              {shoe.nickname
                ? [shoe.name, subtitle].filter(Boolean).join(' · ')
                : subtitle}
            </CardDescription>
          </div>
          {shoe.status === 'retired' ? (
            <Badge variant="secondary">{t('shoes.retired', 'Retired')}</Badge>
          ) : shoe.is_worn_out ? (
            <Badge variant="destructive">
              {t('shoes.wornOut', 'Worn out')}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">
              {show(shoe.total_distance_km)} {unitLabel}
            </span>
            <span className="text-muted-foreground">
              {t('shoes.ofLimit', 'of {{limit}} {{unit}}', {
                limit: show(shoe.retirement_distance_km),
                unit: unitLabel,
              })}
            </span>
          </div>
          <Progress
            value={percent}
            className="h-2"
            aria-label={t('shoes.mileage', 'Mileage')}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('shoes.runCount', {
            count: shoe.run_count,
            defaultValue: '{{count}} runs',
          })}
          {shoe.last_used_date
            ? ` · ${t('shoes.lastUsed', 'last used {{date}}', { date: shoe.last_used_date })}`
            : ''}
        </p>
        {!readOnly && shoe.status === 'active' && shoe.is_worn_out && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm"
          >
            <span>
              {t(
                'shoes.retirePrompt',
                'This pair has reached its limit. Retire it?'
              )}
            </span>
            <Button size="sm" variant="destructive" onClick={onToggleRetired}>
              {t('shoes.retire', 'Retire')}
            </Button>
          </div>
        )}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {t('common.edit', 'Edit')}
            </Button>
            <Button size="sm" variant="outline" onClick={onToggleRetired}>
              {shoe.status === 'retired'
                ? t('shoes.reactivate', 'Reactivate')
                : t('shoes.retire', 'Retire')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              aria-label={t('common.delete', 'Delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/** The bars and plates a person owns, for the plate calculator. */
const PlateInventorySection: React.FC<{ canWrite: boolean }> = ({
  canWrite,
}) => {
  const { t } = useTranslation();
  const { weightUnit } = usePreferences();
  const { data: stored, isLoading, isError } = usePlateInventory();
  const save = useSavePlateInventoryMutation();
  const reset = useResetPlateInventoryMutation();
  const [open, setOpen] = useState(false);

  // Until something is saved, the standard set for the person's unit is used.
  const config = inventoryConfigFrom(
    stored,
    weightUnit === 'kg' ? 'kg' : 'lbs'
  );
  const owned = config.plates.filter((plate) => plate.pairs > 0);
  // A failed load leaves nothing to tell the standard set from the person's
  // own plates; saving from that would replace their inventory.
  const loadFailed = isError && stored == null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Dumbbell className="h-5 w-5" />
          {t('plates.title', 'Plates & bars')}
        </h3>
        {canWrite && (
          <Button
            size="sm"
            variant="outline"
            disabled={isLoading || loadFailed}
            onClick={() => setOpen(true)}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            {t('common.edit', 'Edit')}
          </Button>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-20" />
      ) : loadFailed ? (
        <p className="text-sm text-destructive">
          {t('plates.failedToLoad', 'Failed to load your plates and bars.')}
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          {!stored && (
            <p className="text-muted-foreground">
              {t(
                'plates.usingStandard',
                'Using the standard set. Edit it to match the plates you own.'
              )}
            </p>
          )}
          <p>
            <span className="font-medium">{t('plates.bars', 'Bars')}: </span>
            {config.bars
              .map(
                (bar) =>
                  `${barLabel(t, bar)} ${formatPlateWeight(bar.weight)} ${config.unit}`
              )
              .join(' · ')}
          </p>
          <p>
            <span className="font-medium">
              {t('plates.platesLabel', 'Plates')}:{' '}
            </span>
            {owned
              .map(
                (plate) =>
                  `${formatPlateWeight(plate.weight)} ${config.unit} × ${plate.pairs}`
              )
              .join(' · ')}
          </p>
          <p className="text-muted-foreground">
            {config.collarsEnabled
              ? t(
                  'plates.collarsCounted',
                  'Collars count: {{weight}} {{unit}} each',
                  {
                    weight: formatPlateWeight(config.collarWeight),
                    unit: config.unit,
                  }
                )
              : t('plates.collarsNotCounted', 'Collars are not counted.')}
          </p>
        </div>
      )}
      <PlateInventoryDialog
        open={open}
        onOpenChange={setOpen}
        initial={config}
        hasSaved={stored != null}
        onSubmit={(data) => save.mutateAsync(data)}
        onReset={() => {
          reset.mutate();
          setOpen(false);
        }}
        isSaving={save.isPending}
      />
    </section>
  );
};

/**
 * The Equipment section of the Exercises page: running shoes and the plates
 * and bars used by the plate calculator.
 */
const EquipmentManager: React.FC = () => {
  const { t } = useTranslation();
  const { hasWritePermission, isActingOnBehalf } = useActiveUser();
  // Reads follow the diary or reports permission; every change needs diary write.
  const canWrite = hasWritePermission('diary');
  const { data: shoes, isLoading } = useShoes();
  const createShoe = useCreateShoeMutation();
  const updateShoe = useUpdateShoeMutation();
  const deleteShoe = useDeleteShoeMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShoeResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ShoeResponse | null>(null);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (shoe: ShoeResponse) => {
    setEditing(shoe);
    setDialogOpen(true);
  };
  const handleSubmit = (data: CreateShoeBody) =>
    editing
      ? updateShoe.mutateAsync({ id: editing.id, data })
      : createShoe.mutateAsync(data);

  const active = (shoes ?? []).filter((shoe) => shoe.status === 'active');
  const retired = (shoes ?? []).filter((shoe) => shoe.status === 'retired');

  const renderCards = (list: ShoeResponse[]) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((shoe) => (
        <ShoeCard
          key={shoe.id}
          shoe={shoe}
          readOnly={!canWrite}
          onEdit={() => openEdit(shoe)}
          onDelete={() => setPendingDelete(shoe)}
          onToggleRetired={() =>
            updateShoe.mutate({
              id: shoe.id,
              data: {
                status: shoe.status === 'retired' ? 'active' : 'retired',
              },
            })
          }
        />
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="min-w-0">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            {t('equipment.title', 'Equipment')}
          </CardTitle>
          <CardDescription>
            {t(
              'shoes.subtitle',
              'Keep track of the mileage on each pair of running shoes.'
            )}
          </CardDescription>
        </div>
        {canWrite && (
          <Button onClick={openAdd} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />
            {t('shoes.addShoe', 'Add shoe')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Footprints className="h-5 w-5" />
          {t('shoes.title', 'Shoes')}
        </h3>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : (shoes ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t(
              'shoes.empty',
              'No shoes yet. Add a pair, then pick it on a run to start counting its mileage.'
            )}
          </p>
        ) : (
          <>
            {active.length > 0 && renderCards(active)}
            {retired.length > 0 && (
              <section className="space-y-3">
                <h4 className="text-base font-semibold text-muted-foreground">
                  {t('shoes.retiredSection', 'Retired')}
                </h4>
                {renderCards(retired)}
              </section>
            )}
          </>
        )}

        {!isActingOnBehalf && <PlateInventorySection canWrite={canWrite} />}

        <ShoeFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          shoe={editing}
          onSubmit={handleSubmit}
          isSaving={createShoe.isPending || updateShoe.isPending}
        />
        <ConfirmationDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={t('shoes.deleteTitle', 'Delete this shoe?')}
          description={t(
            'shoes.deleteDescription',
            'Runs logged with this pair stay in your diary, but they will no longer be linked to a shoe.'
          )}
          variant="destructive"
          confirmLabel={t('common.delete', 'Delete')}
          onConfirm={() => {
            if (pendingDelete) deleteShoe.mutate(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      </CardContent>
    </Card>
  );
};

export default EquipmentManager;
