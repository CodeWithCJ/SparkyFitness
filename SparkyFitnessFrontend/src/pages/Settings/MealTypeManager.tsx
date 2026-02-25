import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Lock, Eye, EyeOff } from 'lucide-react';
import { type MealTypeDefinition } from '@/api/Diary/mealTypeService';
import { Badge } from '@/components/ui/badge';
import {
  useCreateMealTypeMutation,
  useDeleteMealTypeMutation,
  useMealTypes,
  useUpdateMealTypeMutation,
} from '@/hooks/Diary/useMealTypes';

const MealTypeManager = () => {
  const { t } = useTranslation();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [editingMealType, setEditingMealType] =
    useState<MealTypeDefinition | null>(null);

  const [newName, setNewName] = useState('');
  const [newSortOrder, setNewSortOrder] = useState(100);

  const { data: mealTypes = [] } = useMealTypes();
  const { mutateAsync: createMealType } = useCreateMealTypeMutation();
  const { mutateAsync: updateMealType } = useUpdateMealTypeMutation();
  const { mutate: deleteMealType } = useDeleteMealTypeMutation();

  const handleAdd = async () => {
    if (!newName.trim()) return;

    await createMealType({
      name: newName.trim(),
      sort_order: Number(newSortOrder),
    });
    setNewName('');
    setNewSortOrder(100);
    setIsAddDialogOpen(false);
  };

  const handleEdit = async () => {
    if (!editingMealType || !newName.trim()) return;

    await updateMealType({
      id: editingMealType.id,
      data: {
        name: newName.trim(),
        sort_order: Number(newSortOrder),
      },
    });

    setIsEditDialogOpen(false);
    setEditingMealType(null);
  };

  const handleDelete = (id: string) => {
    deleteMealType(id);
  };

  const toggleVisibility = async (item: MealTypeDefinition) => {
    await updateMealType({
      id: item.id,
      data: { is_visible: !item.is_visible },
    });
  };
  const openEditDialog = (item: MealTypeDefinition) => {
    setEditingMealType(item);
    setNewName(item.name);
    setNewSortOrder(item.sort_order);
    setIsEditDialogOpen(true);
  };

  // Helper to translate system names
  const getDisplayName = (name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'breakfast') return t('common.breakfast', 'Breakfast');
    if (lower === 'lunch') return t('common.lunch', 'Lunch');
    if (lower === 'dinner') return t('common.dinner', 'Dinner');
    if (lower === 'snacks') return t('common.snacks', 'Snacks');
    return name;
  };

  return (
    <div className="space-y-4">
      {/* Header / Add Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          {t('mealTypeManager.title', 'Meal Categories')}
        </h3>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              {t('mealTypeManager.add', 'Add Category')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('mealTypeManager.addTitle', 'Add Meal Category')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'mealTypeManager.addDesc',
                  'Create a new meal category (e.g., Pre-Workout).'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('mealTypeManager.nameLabel', 'Name')}</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Midnight Snack"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t('mealTypeManager.sortOrderLabel', 'Sort Order')}
                </Label>
                <Input
                  type="number"
                  value={newSortOrder}
                  onChange={(e) => setNewSortOrder(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    'mealTypeManager.sortHelp',
                    'Lower numbers appear first. (Breakfast=10, Lunch=20, Dinner=40)'
                  )}
                </p>
              </div>
              <Button onClick={handleAdd} className="w-full">
                {t('common.save', 'Save')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      <div className="space-y-2">
        {mealTypes.map((item) => {
          const isSystem = item.user_id === null;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 border rounded-md bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {getDisplayName(item.name)}
                  </span>
                  {isSystem && (
                    <span className="text-xs text-muted-foreground">
                      ({item.name})
                    </span>
                  )}
                </div>
                {isSystem && (
                  <Badge variant="secondary" className="text-xs">
                    Default
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">
                  Order: {item.sort_order}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleVisibility(item)}
                    title={
                      item.is_visible ? 'Hide from Diary' : 'Show in Diary'
                    }
                  >
                    {item.is_visible ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                  {isSystem ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled
                      className="opacity-50"
                    >
                      <Lock className="w-4 h-4" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(item)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('mealTypeManager.editTitle', 'Edit Meals')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('mealTypeManager.nameLabel', 'Name')}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('mealTypeManager.sortOrderLabel', 'Sort Order')}</Label>
              <Input
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value))}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button onClick={handleEdit}>
                {t('common.save', 'Save Changes')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MealTypeManager;
