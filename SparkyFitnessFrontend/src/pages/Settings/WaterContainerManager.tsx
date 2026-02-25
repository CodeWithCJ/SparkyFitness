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

const WaterContainerManager: React.FC = () => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [volume, setVolume] = useState<number | ''>('');
  const [unit, setUnit] = useState<'ml' | 'oz' | 'liter'>('ml');
  const [servingsPerContainer, setServingsPerContainer] = useState<number | ''>(
    ''
  );
  const { toast } = useToast();
  const { data: containers = [] } = useWaterContainersQuery(user.activeUserId);
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
    toast({ title: 'Success', description: 'Water container deleted.' });
  };

  const handleSetPrimary = async (id: number) => {
    await setPrimaryWaterContainer(id);
    toast({ title: 'Success', description: 'Primary container updated.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Water Containers</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleAddContainer}
          className="flex items-end gap-2 mb-4"
        >
          <div className="grid gap-1.5">
            <label htmlFor="name">Container Name</label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Water Bottle"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="volume">Volume</label>
            <Input
              id="volume"
              type="number"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              placeholder="e.g., 500"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="servingsPerContainer">Servings per Container</label>
            <Input
              id="servingsPerContainer"
              type="number"
              value={servingsPerContainer}
              onChange={(e) => setServingsPerContainer(Number(e.target.value))}
              placeholder="e.g., 4"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label>Unit</label>
            <Select
              onValueChange={(value: 'ml' | 'oz' | 'liter') => setUnit(value)}
              defaultValue={unit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ml">ml</SelectItem>
                <SelectItem value="oz">oz</SelectItem>
                <SelectItem value="liter">liter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit">Add Container</Button>
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
                  {convertMlToSelectedUnit(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    parseFloat(c.volume as any),
                    c.unit
                  ).toFixed(2)}{' '}
                  {c.unit} ({c.servings_per_container} servings)
                </p>
                {c.is_primary && (
                  <p className="text-sm text-blue-500">Primary</p>
                )}
              </div>
              <div className="flex gap-2">
                {!c.is_primary && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetPrimary(c.id)}
                  >
                    Set as Primary
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteContainer(c.id)}
                >
                  Delete
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
