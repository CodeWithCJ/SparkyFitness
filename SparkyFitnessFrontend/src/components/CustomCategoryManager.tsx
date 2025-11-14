import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Edit } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import {
  addCategory,
  updateCategory,
  deleteCategory,
  getCategories,
  CustomCategory,
} from "@/services/customCategoryService";


interface CustomCategoryManagerProps {
  categories: CustomCategory[];
  onCategoriesChange: (categories: CustomCategory[]) => void;
}

const CustomCategoryManager = ({ categories, onCategoriesChange }: CustomCategoryManagerProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { loggingLevel } = usePreferences(); // Destructure loggingLevel
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | null>(null);
  const [newCategory, setNewCategory] = useState({
    name: '',
    display_name: '',
    measurement_type: '',
    frequency: 'Daily',
    data_type: 'numeric'
  });

  useEffect(() => {
    const fetchCategories = async () => {
      if (user) {
        try {
          const fetchedCategories = await getCategories(loggingLevel); // Pass loggingLevel
          onCategoriesChange(fetchedCategories || []);
        } catch (error) {
          console.error("Error fetching custom categories:", error);
          toast({
            title: t('common.errorOccurred', 'Error'),
            description: t('customCategoryManager.failedToLoadCategories', 'Failed to load custom categories.'),
            variant: "destructive",
          });
        }
      }
    };
    fetchCategories();
  }, [user, onCategoriesChange, loggingLevel, t]);

  const handleAddCategory = async () => {
    if (!user || !newCategory.name.trim() || !newCategory.measurement_type.trim()) {
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: t('customCategoryManager.fillAllFieldsError', 'Please fill in all fields'),
        variant: "destructive",
      });
      return;
    }

    try {
      const data = await addCategory({
        user_id: user.id,
        name: newCategory.name.trim(),
        display_name: newCategory.display_name.trim() || undefined,
        measurement_type: newCategory.measurement_type.trim(),
        frequency: newCategory.frequency,
        data_type: newCategory.data_type
      }, loggingLevel); // Pass loggingLevel
      // Refetch categories to ensure the new one with the correct ID and all fields is displayed
      const fetchedCategories = await getCategories(loggingLevel);
      onCategoriesChange(fetchedCategories || []);
      setNewCategory({ name: '', display_name: '', measurement_type: '', frequency: 'Daily', data_type: 'numeric' });
      setIsAddDialogOpen(false);
      
      toast({
        title: t('common.success', 'Success'),
        description: t('customCategoryManager.addCategorySuccess', 'Custom category added successfully'),
      });
    } catch (error) {
      console.error('Error adding custom category:', error);
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: error.message || t('customCategoryManager.addCategoryError', 'Failed to add custom category'),
        variant: "destructive",
      });
    }
  };

  const handleEditCategory = async () => {
    if (!user || !editingCategory || !editingCategory.name.trim() || !editingCategory.measurement_type.trim()) {
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: t('customCategoryManager.fillAllFieldsError', 'Please fill in all fields'),
        variant: "destructive",
      });
      return;
    }

    try {
      const updatedData = await updateCategory(editingCategory.id, {
        name: editingCategory.name.trim(),
        display_name: editingCategory.display_name?.trim() || undefined,
        measurement_type: editingCategory.measurement_type.trim(),
        frequency: editingCategory.frequency,
        data_type: editingCategory.data_type
      }, loggingLevel); // Pass loggingLevel
      // Refetch categories to ensure the updated one is displayed correctly
      const fetchedCategories = await getCategories(loggingLevel);
      onCategoriesChange(fetchedCategories || []);
      setEditingCategory(null);
      setIsEditDialogOpen(false);
      
      toast({
        title: t('common.success', 'Success'),
        description: t('customCategoryManager.updateCategorySuccess', 'Custom category updated successfully'),
      });
    } catch (error) {
      console.error('Error updating custom category:', error);
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: t('customCategoryManager.updateCategoryError', 'Failed to update custom category'),
        variant: "destructive",
      });
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const idToDelete = String(categoryId || ''); // Ensure it's a string here, fallback to empty
    if (!idToDelete || idToDelete === 'undefined' || idToDelete === 'null') {
      console.error('Attempted to delete a category with an invalid ID:', idToDelete);
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: t('customCategoryManager.invalidIdError', 'Cannot delete category: Invalid ID.'),
        variant: "destructive",
      });
      return;
    }

    if (!user || !user.id) {
      console.error('User or User ID is missing for delete operation.');
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: t('customCategoryManager.userNotAuthenticatedError', 'Cannot delete category: User not authenticated.'),
        variant: "destructive",
      });
      return;
    }

    try {
      await deleteCategory(idToDelete, loggingLevel); // Pass loggingLevel
      onCategoriesChange(categories.filter(cat => cat.id !== idToDelete));
      
      toast({
        title: t('common.success', 'Success'),
        description: t('customCategoryManager.deleteCategorySuccess', 'Custom category deleted successfully'),
      });
    } catch (error) {
      console.error('Error deleting custom category:', error);
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: error.message || t('customCategoryManager.deleteCategoryError', 'Failed to delete custom category'),
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (category: CustomCategory) => {
    setEditingCategory({ ...category, id: String(category.id || '') }); // Ensure ID is string, fallback to empty
    setIsEditDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              {t('customCategoryManager.addCategoryButton', 'Add Category')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('customCategoryManager.addCategoryDialogTitle', 'Add Custom Category')}</DialogTitle>
              <DialogDescription>
                {t('customCategoryManager.addCategoryDialogDescription', 'Fill in the details for your new custom measurement category.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">{t('customCategoryManager.nameLabel', 'Name (max 50 characters)')}</Label>
                <Input
                  id="name"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value.slice(0, 50) })}
                  placeholder={t('customCategoryManager.namePlaceholder', 'e.g., Blood Sugar')}
                  maxLength={50}
                />
                <p className="text-xs text-gray-500 mt-1">{t('customCategoryManager.nameHelp', 'Internal identifier used for syncing')}</p>
              </div>
              <div>
                <Label htmlFor="display_name">{t('customCategoryManager.displayNameLabel', 'Display Name (optional, max 100 characters)')}</Label>
                <Input
                  id="display_name"
                  value={newCategory.display_name}
                  onChange={(e) => setNewCategory({ ...newCategory, display_name: e.target.value.slice(0, 100) })}
                  placeholder={t('customCategoryManager.displayNamePlaceholder', 'e.g., Morning Blood Sugar Level')}
                  maxLength={100}
                />
                <p className="text-xs text-gray-500 mt-1">{t('customCategoryManager.displayNameHelp', 'Optional custom name shown in the app')}</p>
              </div>
              <div>
                <Label htmlFor="measurement_type">{t('customCategoryManager.measurementTypeLabel', 'Measurement Type (max 50 characters)')}</Label>
                <Input
                  id="measurement_type"
                  value={newCategory.measurement_type}
                  onChange={(e) => setNewCategory({ ...newCategory, measurement_type: e.target.value.slice(0, 50) })}
                  placeholder={t('customCategoryManager.measurementTypePlaceholder', 'e.g., mg/dL')}
                  maxLength={50}
                />
              </div>
              <div>
                <Label htmlFor="data_type">{t('customCategoryManager.dataTypeLabel', 'Data Type')}</Label>
                <Select
                  value={newCategory.data_type}
                  onValueChange={(value) => setNewCategory({ ...newCategory, data_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numeric">{t('customCategoryManager.numericDataType', 'Numeric')}</SelectItem>
                    <SelectItem value="text">{t('customCategoryManager.textDataType', 'Text')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="frequency">{t('customCategoryManager.frequencyLabel', 'Frequency')}</Label>
                <Select
                  value={newCategory.frequency}
                  onValueChange={(value) => setNewCategory({ ...newCategory, frequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">{t('customCategoryManager.frequencyAll', 'All (unlimited entries)')}</SelectItem>
                    <SelectItem value="Daily">{t('customCategoryManager.frequencyDaily', 'Daily (one per day)')}</SelectItem>
                    <SelectItem value="Hourly">{t('customCategoryManager.frequencyHourly', 'Hourly (one per hour)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddCategory} className="w-full">
                {t('customCategoryManager.addCategoryAction', 'Add Category')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {categories.length === 0 ? (
        <p className="text-gray-500 text-center py-4">{t('customCategoryManager.noCustomCategories', 'No custom categories yet. Add one to get started!')}</p>
      ) : (
        <div className="space-y-2">
          {categories.map((category, index) => (
            <div key={category.id || `UNDEFINED_ID-${index}`} className="flex items-center justify-between p-3 border rounded">
              <div>
                <div className="font-medium">{category.display_name || category.name}</div>
                {category.display_name && (
                  <div className="text-xs text-gray-400">({category.name})</div>
                )}
                <div className="text-sm text-gray-500">
                  {category.measurement_type} • {category.frequency} • {category.data_type}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(category)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteCategory(category.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('customCategoryManager.editCategoryDialogTitle', 'Edit Custom Category')}</DialogTitle>
            <DialogDescription>
              {t('customCategoryManager.editCategoryDialogDescription', 'Update the details for your custom measurement category.')}
            </DialogDescription>
          </DialogHeader>
          {editingCategory && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">{t('customCategoryManager.nameLabel', 'Name (max 50 characters)')}</Label>
                <Input
                  id="edit-name"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value.slice(0, 50) })}
                  placeholder={t('customCategoryManager.namePlaceholder', 'e.g., Blood Sugar')}
                  maxLength={50}
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">{t('customCategoryManager.nameHelp', 'Internal identifier used for syncing')}</p>
              </div>
              <div>
                <Label htmlFor="edit-display_name">{t('customCategoryManager.displayNameLabel', 'Display Name (optional, max 100 characters)')}</Label>
                <Input
                  id="edit-display_name"
                  value={editingCategory.display_name || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, display_name: e.target.value.slice(0, 100) || null })}
                  placeholder={t('customCategoryManager.displayNamePlaceholder', 'e.g., Morning Blood Sugar Level')}
                  maxLength={100}
                />
                <p className="text-xs text-gray-500 mt-1">{t('customCategoryManager.displayNameHelp', 'Optional custom name shown in the app')}</p>
              </div>
              <div>
                <Label htmlFor="edit-measurement_type">{t('customCategoryManager.measurementTypeLabel', 'Measurement Type (max 50 characters)')}</Label>
                <Input
                  id="edit-measurement_type"
                  value={editingCategory.measurement_type}
                  onChange={(e) => setEditingCategory({ ...editingCategory, measurement_type: e.target.value.slice(0, 50) })}
                  placeholder={t('customCategoryManager.measurementTypePlaceholder', 'e.g., mg/dL')}
                  maxLength={50}
                />
              </div>
              <div>
                <Label htmlFor="edit-data_type">{t('customCategoryManager.dataTypeLabel', 'Data Type')}</Label>
                <Select
                  value={editingCategory.data_type}
                  onValueChange={(value) => setEditingCategory({ ...editingCategory, data_type: value })}
                  disabled
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numeric">{t('customCategoryManager.numericDataType', 'Numeric')}</SelectItem>
                    <SelectItem value="text">{t('customCategoryManager.textDataType', 'Text')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-frequency">{t('customCategoryManager.frequencyLabel', 'Frequency')}</Label>
                <Select
                  value={editingCategory.frequency}
                  onValueChange={(value) => setEditingCategory({ ...editingCategory, frequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">{t('customCategoryManager.frequencyAll', 'All (unlimited entries)')}</SelectItem>
                    <SelectItem value="Daily">{t('customCategoryManager.frequencyDaily', 'Daily (one per day)')}</SelectItem>
                    <SelectItem value="Hourly">{t('customCategoryManager.frequencyHourly', 'Hourly (one per hour)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleEditCategory} className="w-full">
                {t('customCategoryManager.updateCategoryAction', 'Update Category')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomCategoryManager;
