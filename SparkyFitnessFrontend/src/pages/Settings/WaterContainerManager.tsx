import type React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { convertMlToSelectedUnit } from '@/utils/nutritionCalculations';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  useWaterContainersQuery,
  useCreateWaterContainerMutation,
  useDeleteWaterContainerMutation,
  useSetPrimaryWaterContainerMutation,
} from '@/hooks/Settings/useWaterContainers';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

const WaterContainerManager: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [volume, setVolume] = useState<number | ''>('');
  const [unit, setUnit] = useState<'ml' | 'oz' | 'liter'>('ml');
  const [servingsPerContainer, setServingsPerContainer] = useState<number | ''>(
    ''
  );
  const { toast } = useToast();
  const { data: containers = [] } = useWaterContainersQuery(user?.activeUserId);
  const { mutateAsync: createWaterContainer } =
    useCreateWaterContainerMutation();
  const { mutateAsync: deleteWaterContainer } =
    useDeleteWaterContainerMutation();
  const { mutateAsync: setPrimaryWaterContainer } =
    useSetPrimaryWaterContainerMutation();

  const handleAddContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || volume === '' || servingsPerContainer === '') return;
    await createWaterContainer({
      name,
      volume: Number(volume),
      unit,
      is_primary: false,
      servings_per_container: Number(servingsPerContainer),
    });
    setName('');
    setVolume('');
    setServingsPerContainer('');
  };

  const handleDeleteContainer = async (id: number) => {
    await deleteWaterContainer(id);
    toast({
      title: t('foodDiary.success', 'Success'),
      description: t(
        'waterContainerManager.deleted',
        'Water container deleted.'
      ),
    });
  };

  const handleSetPrimary = async (id: number) => {
    await setPrimaryWaterContainer(id);
    toast({
      title: t('foodDiary.success', 'Success'),
      description: t(
        'waterContainerManager.primaryUpdated',
        'Primary container updated.'
      ),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('waterContainerManager.title', 'Manage Water Containers')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleAddContainer}
          className="flex items-end gap-2 mb-4"
        >
          <div className="grid gap-1.5">
            <label htmlFor="name">
              {t('waterContainerManager.name', 'Container Name')}
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(
                'waterContainerManager.namePlaceholder',
                'e.g., My Water Bottle'
              )}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="volume">
              {t('waterContainerManager.volume', 'Volume')}
            </label>
            <Input
              id="volume"
              type="number"
              min="0.001"
              step="any"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              placeholder={t(
                'waterContainerManager.volumePlaceholder',
                'e.g., 500'
              )}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="servingsPerContainer">
              {t('waterContainerManager.servings', 'Servings per Container')}
            </label>
            <Input
              id="servingsPerContainer"
              type="number"
              min="1"
              value={servingsPerContainer}
              onChange={(e) => setServingsPerContainer(Number(e.target.value))}
              placeholder={t(
                'waterContainerManager.servingsPlaceholder',
                'e.g., 4'
              )}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label>{t('waterContainerManager.unit', 'Unit')}</label>
            <Select
              onValueChange={(value: 'ml' | 'oz' | 'liter') => setUnit(value)}
              defaultValue={unit}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t('waterContainerManager.unit', 'Unit')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ml">ml</SelectItem>
                <SelectItem value="oz">oz</SelectItem>
                <SelectItem value="liter">
                  {t('waterContainerManager.liter', 'liter')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit">
            {t('waterContainerManager.add', 'Add Container')}
          </Button>
        </form>
        <div className="space-y-2">
          {containers.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-2 border rounded-md"
            >
              <div>
                <p className="font-semibold">
                  {c.name} -{' '}
                  {convertMlToSelectedUnit(c.volume, c.unit).toFixed(2)}{' '}
                  {c.unit === 'liter'
                    ? t('waterContainerManager.liter', 'liter')
                    : c.unit}{' '}
                  (
                  {t('waterContainerManager.servingsCount', {
                    count: c.servings_per_container,
                    defaultValue_one: '{{count}} serving',
                    defaultValue_other: '{{count}} servings',
                  })}
                  )
                </p>
                {c.is_primary && (
                  <p className="text-sm text-blue-500">
                    {t('waterContainerManager.primary', 'Primary')}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {!c.is_primary && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetPrimary(c.id)}
                  >
                    {t('waterContainerManager.setPrimary', 'Set as Primary')}
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteContainer(c.id)}
                >
                  {t('common.delete', 'Delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WaterContainerManager;
