import type React from 'react';
import { useState } from 'react';
import type { UserCustomNutrient } from '../../types/customNutrient';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Pencil, Trash2 } from 'lucide-react';
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

const CustomNutrientsSettings: React.FC = () => {
  const [newNutrientName, setNewNutrientName] = useState('');
  const [newNutrientUnit, setNewNutrientUnit] = useState('');
  const [editingNutrient, setEditingNutrient] =
    useState<UserCustomNutrient | null>(null);
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
        title: 'Error',
        description: 'Nutrient name and unit are required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createCustomNutrient({
        name: newNutrientName,
        unit: newNutrientUnit,
      });
      toast({
        title: 'Success',
        description: 'Custom nutrient added successfully.',
      });
      setNewNutrientName('');
      setNewNutrientUnit('');
      // No need to call fetchCustomNutrients() here, as we've already updated the state
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add custom nutrient.',
        variant: 'destructive',
      });
    }
  };

  const handleEditNutrient = async () => {
    if (!editingNutrient || !editingNutrient.name || !editingNutrient.unit) {
      toast({
        title: 'Error',
        description: 'Nutrient name and unit are required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateCustomNutrient({
        nutrientId: editingNutrient.id,
        name: editingNutrient.name,
        unit: editingNutrient.unit,
      });
      toast({
        title: 'Success',
        description: 'Custom nutrient updated successfully.',
      });
      setEditingNutrient(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update custom nutrient.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteNutrient = async (id: string) => {
    try {
      await deleteCustomNutrient(id);
      toast({
        title: 'Success',
        description: 'Custom nutrient deleted successfully.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete custom nutrient.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Custom Nutrients Management</h2>

      <div className="p-4 border rounded-md shadow-sm">
        <h3 className="text-xl font-semibold mb-4">Add New Custom Nutrient</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="newNutrientName">Nutrient Name</Label>
            <Input
              id="newNutrientName"
              value={newNutrientName}
              onChange={(e) => setNewNutrientName(e.target.value)}
              placeholder="e.g., Added Sugars"
            />
          </div>
          <div>
            <Label htmlFor="newNutrientUnit">Unit</Label>
            <Input
              id="newNutrientUnit"
              value={newNutrientUnit}
              onChange={(e) => setNewNutrientUnit(e.target.value)}
              placeholder="e.g., g, mg, IU"
            />
          </div>
        </div>
        <Button onClick={handleAddNutrient} className="mt-4">
          Add Custom Nutrient
        </Button>
      </div>

      <div className="p-4 border rounded-md shadow-sm">
        <h3 className="text-xl font-semibold mb-4">
          Existing Custom Nutrients
        </h3>
        {customNutrients && customNutrients.length === 0 ? (
          <p>No custom nutrients defined yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    <TableCell className="text-right">
                      {editingNutrient?.id === nutrient.id ? (
                        <>
                          <Button variant="ghost" onClick={handleEditNutrient}>
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setEditingNutrient(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingNutrient(nutrient)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Are you absolutely sure?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will
                                  permanently delete your custom nutrient and
                                  remove its values from all associated foods
                                  and entries.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    handleDeleteNutrient(nutrient.id)
                                  }
                                >
                                  Delete
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
