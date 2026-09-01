import type React from 'react';
import { useState } from 'react';
import type { UserCustomNutrient } from '../../types/customNutrient';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Pencil, Trash2 } from 'lucide-react';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';
import {
  useCreateCustomNutrientMutation,
  useCustomNutrients,
  useDeleteCustomNutrientMutation,
  useUpdateCustomNutrientMutation,
} from '@/hooks/Foods/useCustomNutrients';
import { usePreferences } from '@/contexts/PreferencesContext';
import { AliasChipInput } from '@/components/Foods/AliasChipInput';
import { useTranslation } from 'react-i18next';

const CustomNutrientsSettings: React.FC = () => {
  const { t } = useTranslation();
  const { loadNutrientDisplayPreferences } = usePreferences();
  const [newNutrientName, setNewNutrientName] = useState('');
  const [newNutrientUnit, setNewNutrientUnit] = useState('');
  const [newNutrientAliases, setNewNutrientAliases] = useState<string[]>([]);
  const [editingNutrient, setEditingNutrient] =
    useState<UserCustomNutrient | null>(null);
  const [editingAliases, setEditingAliases] = useState<string[]>([]);
  const [deleteAllHistory, setDeleteAllHistory] = useState(false);
  const { toast } = useToast();

  const { data: customNutrients } = useCustomNutrients();
  const { mutateAsync: createCustomNutrient } =
    useCreateCustomNutrientMutation();
  const { mutateAsync: updateCustomNutrient } =
    useUpdateCustomNutrientMutation();
  const { mutateAsync: deleteCustomNutrient } =
    useDeleteCustomNutrientMutation();
  const handleAddNutrient = async () => {
    if (!newNutrientName || !newNutrientUnit) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'settings.customNutrients.required',
          'Nutrient name and unit are required.'
        ),
        variant: 'destructive',
      });
      return;
    }

    await createCustomNutrient({
      name: newNutrientName,
      unit: newNutrientUnit,
      aliases: newNutrientAliases,
    });
    await loadNutrientDisplayPreferences();
    setNewNutrientName('');
    setNewNutrientUnit('');
    setNewNutrientAliases([]);
  };

  const handleEditNutrient = async () => {
    if (!editingNutrient || !editingNutrient.name || !editingNutrient.unit) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'settings.customNutrients.required',
          'Nutrient name and unit are required.'
        ),
        variant: 'destructive',
      });
      return;
    }
    await updateCustomNutrient({
      nutrientId: editingNutrient.id,
      name: editingNutrient.name,
      unit: editingNutrient.unit,
      aliases: editingAliases,
    });
    setEditingNutrient(null);
    setEditingAliases([]);
  };

  const startEditing = (nutrient: UserCustomNutrient) => {
    setEditingNutrient(nutrient);
    setEditingAliases(nutrient.aliases ?? []);
  };

  const handleDeleteNutrient = async (id: string) => {
    await deleteCustomNutrient({ id, deleteAllHistory });
    setDeleteAllHistory(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">
        {t('settings.customNutrients.title', 'Custom Nutrients Management')}
      </h2>

      <div className="p-4 border rounded-md shadow-sm">
        <h3 className="text-xl font-semibold mb-4">
          {t('settings.customNutrients.addTitle', 'Add New Custom Nutrient')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="newNutrientName">
              {t('settings.customNutrients.name', 'Nutrient Name')}
            </Label>
            <Input
              id="newNutrientName"
              value={newNutrientName}
              onChange={(e) => setNewNutrientName(e.target.value)}
              placeholder={t(
                'settings.customNutrients.namePlaceholder',
                'e.g., Added Sugars'
              )}
            />
          </div>
          <div>
            <Label htmlFor="newNutrientUnit">
              {t('settings.customNutrients.unit', 'Unit')}
            </Label>
            <Input
              id="newNutrientUnit"
              value={newNutrientUnit}
              onChange={(e) => setNewNutrientUnit(e.target.value)}
              placeholder={t(
                'settings.customNutrients.unitPlaceholder',
                'e.g., g, mg, IU'
              )}
            />
          </div>
          <div>
            <Label htmlFor="newNutrientAliases">
              {t(
                'settings.customNutrients.providerAliases',
                'Provider aliases'
              )}
            </Label>
            <AliasChipInput
              value={newNutrientAliases}
              onChange={setNewNutrientAliases}
              placeholder={t(
                'settings.customNutrients.aliasPlaceholder',
                'Type a name, press Enter'
              )}
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            'settings.customNutrients.aliasesHelp',
            'Aliases are the exact names online food databases use for this nutrient (press Enter to add each). On import, provider nutrient fields are matched (case-insensitively) against the name and these aliases. Tip: use the "Nutrient fields reported by…" panel when importing a food to add a provider\'s exact name in one click.'
          )}
        </p>
        <Button onClick={handleAddNutrient} className="mt-4">
          {t('settings.customNutrients.add', 'Add Custom Nutrient')}
        </Button>
      </div>

      <div className="p-4 border rounded-md shadow-sm">
        <h3 className="text-xl font-semibold mb-4">
          {t('settings.customNutrients.existing', 'Existing Custom Nutrients')}
        </h3>
        {customNutrients && customNutrients.length === 0 ? (
          <p>
            {t(
              'settings.customNutrients.empty',
              'No custom nutrients defined yet.'
            )}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('settings.customNutrients.name', 'Name')}
                </TableHead>
                <TableHead>
                  {t('settings.customNutrients.unit', 'Unit')}
                </TableHead>
                <TableHead>
                  {t(
                    'settings.customNutrients.providerAliases',
                    'Provider aliases'
                  )}
                </TableHead>
                <TableHead className="text-right">
                  {t('common.actions', 'Actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customNutrients &&
                customNutrients.map((nutrient) => (
                  <TableRow key={nutrient.id}>
                    <TableCell>
                      {editingNutrient?.id === nutrient.id ? (
                        <Input
                          value={editingNutrient.name}
                          onChange={(e) =>
                            setEditingNutrient({
                              ...editingNutrient,
                              name: e.target.value,
                            })
                          }
                        />
                      ) : (
                        nutrient.name
                      )}
                    </TableCell>
                    <TableCell>
                      {editingNutrient?.id === nutrient.id ? (
                        <Input
                          value={editingNutrient.unit}
                          onChange={(e) =>
                            setEditingNutrient({
                              ...editingNutrient,
                              unit: e.target.value,
                            })
                          }
                        />
                      ) : (
                        nutrient.unit
                      )}
                    </TableCell>
                    <TableCell>
                      {editingNutrient?.id === nutrient.id ? (
                        <AliasChipInput
                          value={editingAliases}
                          onChange={setEditingAliases}
                          placeholder={t(
                            'settings.customNutrients.aliasPlaceholder',
                            'Type a name, press Enter'
                          )}
                        />
                      ) : (
                        (nutrient.aliases ?? []).join(', ')
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingNutrient?.id === nutrient.id ? (
                        <>
                          <Button variant="ghost" onClick={handleEditNutrient}>
                            {t('common.save', 'Save')}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEditingNutrient(null);
                              setEditingAliases([]);
                            }}
                          >
                            {t('common.cancel', 'Cancel')}
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(nutrient)}
                            title={t('common.edit', 'Edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500"
                                title={t('common.delete', 'Delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t(
                                    'settings.customNutrients.deleteTitle',
                                    'Are you absolutely sure?'
                                  )}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t(
                                    'settings.customNutrients.deleteDescription',
                                    'This action cannot be undone. This will permanently delete your custom nutrient definition.'
                                  )}
                                </AlertDialogDescription>
                                <div className="flex items-start space-x-3 pt-4">
                                  <Checkbox
                                    id={`delete-history-${nutrient.id}`}
                                    checked={deleteAllHistory}
                                    onCheckedChange={(checked) =>
                                      setDeleteAllHistory(checked === true)
                                    }
                                  />
                                  <div className="grid gap-1.5 leading-none">
                                    <label
                                      htmlFor={`delete-history-${nutrient.id}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      {t(
                                        'settings.customNutrients.deleteHistory',
                                        'Also remove from past goals and diary entries?'
                                      )}
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                      {t(
                                        'settings.customNutrients.deleteHistoryHelp',
                                        'If unchecked, old values remain in your history but the nutrient will be hidden from the interface.'
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel
                                  onClick={() => setDeleteAllHistory(false)}
                                >
                                  {t('common.cancel', 'Cancel')}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    handleDeleteNutrient(nutrient.id)
                                  }
                                >
                                  {t('common.delete', 'Delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default CustomNutrientsSettings;
