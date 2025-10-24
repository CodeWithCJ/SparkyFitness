import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddExerciseDialog from "./AddExerciseDialog";
import ConfirmationDialog from "@/components/ui/ConfirmationDialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Share2, Users, Lock, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useAuth } from "@/hooks/useAuth";
import { debug, info, warn, error } from '@/utils/logging';
import {
  loadExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  updateExerciseShareStatus,
  getExerciseDeletionImpact,
  ExerciseDeletionImpact,
  updateExerciseEntriesSnapshot,
  ExerciseOwnershipFilter,
} from '@/services/exerciseService';
import { Exercise as ExerciseInterface } from '@/services/exerciseSearchService';
import WorkoutPresetsManager from './WorkoutPresetsManager'; // Import the new component
import WorkoutPlansManager from './WorkoutPlansManager'; // Import the new component
import { PresetExercise } from "@/types/workout"; // Import PresetExercise

interface ExerciseDatabaseManagerProps {
  onPresetExercisesSelected: (exercises: PresetExercise[]) => void;
}

const ExerciseDatabaseManager: React.FC<ExerciseDatabaseManagerProps> = ({ onPresetExercisesSelected }) => {
  const { user } = useAuth();
  const { loggingLevel } = usePreferences();
  // Existing states for Exercise management
  const [exercises, setExercises] = useState<ExerciseInterface[]>([]);
  const [totalExercisesCount, setTotalExercisesCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState<ExerciseOwnershipFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseInterface | null>(null);
  const [editExerciseName, setEditExerciseName] = useState("");
  const [editExerciseCategory, setEditExerciseCategory] = useState("general");
  const [editExerciseCalories, setEditExerciseCalories] = useState(300);
  const [editExerciseDescription, setEditExerciseDescription] = useState("");
  const [editExerciseLevel, setEditExerciseLevel] = useState("");
  const [editExerciseForce, setEditExerciseForce] = useState("");
  const [editExerciseMechanic, setEditExerciseMechanic] = useState("");
  const [editExerciseEquipment, setEditExerciseEquipment] = useState<string[]>([]);
  const [editExercisePrimaryMuscles, setEditExercisePrimaryMuscles] = useState<string[]>([]);
  const [editExerciseSecondaryMuscles, setEditExerciseSecondaryMuscles] = useState<string[]>([]);
  const [editExerciseInstructions, setEditExerciseInstructions] = useState<string[]>([]);
  const [editExerciseImages, setEditExerciseImages] = useState<string[]>([]);
  const [newExerciseImageFiles, setNewExerciseImageFiles] = useState<File[]>([]);
  const [newExerciseImageUrls, setNewExerciseImageUrls] = useState<string[]>([]);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<ExerciseDeletionImpact | null>(null);
  const [exerciseToDelete, setExerciseToDelete] = useState<ExerciseInterface | null>(null);
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [syncExerciseId, setSyncExerciseId] = useState<string | null>(null);
 
  useEffect(() => {
    if (user?.id) {
      loadExercisesData();
    }
  }, [user?.id]);

  const loadExercisesData = async () => {
    if (!user?.id) return;
    try {
      const response = await loadExercises(
        user.id,
        searchTerm,
        categoryFilter,
        ownershipFilter,
        currentPage,
        itemsPerPage
      );
      setExercises(response.exercises);
      setTotalExercisesCount(response.totalCount);
    } catch (err) {
      error(loggingLevel, "Error loading exercises:", err);
      toast({
        title: "Error",
        description: "Failed to load exercises",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadExercisesData();
  }, [user?.id, searchTerm, categoryFilter, ownershipFilter, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, ownershipFilter, itemsPerPage]);

  const totalPages = Math.ceil(totalExercisesCount / itemsPerPage);
  const currentExercises = exercises;

  const handleEditExercise = async () => {
    if (!selectedExercise) return;

    try {
      const formData = new FormData();
      const updatedExerciseData: Partial<ExerciseInterface> = {
        name: editExerciseName,
        category: editExerciseCategory,
        calories_per_hour: editExerciseCalories,
        description: editExerciseDescription,
        level: editExerciseLevel,
        force: editExerciseForce,
        mechanic: editExerciseMechanic,
        equipment: editExerciseEquipment,
        primary_muscles: editExercisePrimaryMuscles,
        secondary_muscles: editExerciseSecondaryMuscles,
        instructions: editExerciseInstructions,
        images: editExerciseImages,
      };

      formData.append('exerciseData', JSON.stringify(updatedExerciseData));
      newExerciseImageFiles.forEach((file) => {
        formData.append('images', file);
      });

      await updateExercise(selectedExercise.id, formData);
      toast({
        title: "Success",
        description: "Exercise edited successfully",
      });
      if (user?.id === selectedExercise.user_id) {
        setSyncExerciseId(selectedExercise.id);
        setShowSyncConfirmation(true);
      } else {
        loadExercisesData();
      }
      setIsEditDialogOpen(false);
      setSelectedExercise(null);
      setNewExerciseImageFiles([]);
      setNewExerciseImageUrls([]);
    } catch (err) {
      error(loggingLevel, "Error editing exercise:", err);
      toast({
        title: "Error",
        description: "Failed to edit exercise",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRequest = async (exercise: ExerciseInterface) => {
    if (!user) return;
    try {
      const impact = await getExerciseDeletionImpact(exercise.id);
      setDeletionImpact(impact);
      setExerciseToDelete(exercise);
      setShowDeleteConfirmation(true);
    } catch (err) {
      error(loggingLevel, "Error fetching deletion impact:", err);
      toast({
        title: "Error",
        description: "Could not fetch deletion impact. Please try again.",
        variant: "destructive",
      });
    }
  };

  const confirmDelete = async () => {
    if (!exerciseToDelete || !user) return;
    try {
      // Decide whether to force delete based on deletionImpact
      const shouldForce = deletionImpact && !deletionImpact.isUsedByOthers && deletionImpact.exerciseEntriesCount > 0;
      const response = await deleteExercise(exerciseToDelete.id, user.id, shouldForce);
      // Interpret server response status for user feedback
      if (response && response.status) {
        if (response.status === 'deleted' || response.status === 'force_deleted') {
          toast({ title: 'Success', description: 'Exercise deleted successfully.' });
        } else if (response.status === 'hidden') {
          toast({ title: 'Success', description: 'Exercise hidden (marked as quick). Historical entries remain.' });
        } else {
          toast({ title: 'Success', description: response.message || 'Exercise delete operation completed.' });
        }
      } else {
        toast({ title: 'Success', description: 'Exercise deleted successfully.' });
      }
      loadExercisesData();
    } catch (err) {
      error(loggingLevel, "Error deleting exercise:", err);
      toast({
        title: "Error",
        description: "Failed to delete exercise.",
        variant: "destructive",
      });
    } finally {
      setShowDeleteConfirmation(false);
      setExerciseToDelete(null);
      setDeletionImpact(null);
    }
  };

  const handleShareExercise = async (exerciseId: string, share: boolean) => {
    try {
      await updateExerciseShareStatus(exerciseId, share);
      toast({
        title: "Success",
        description: `Exercise ${share ? 'shared' : 'unshared'} successfully`,
      });
      loadExercisesData();
    } catch (err) {
      error(loggingLevel, "Error sharing exercise:", err);
      toast({
        title: "Error",
        description: "Failed to share exercise",
        variant: "destructive",
      });
    }
  };

  const handleSyncConfirmation = async () => {
    if (syncExerciseId) {
      try {
        await updateExerciseEntriesSnapshot(syncExerciseId);
        toast({
          title: "Success",
          description: "Past diary entries have been updated.",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to update past diary entries.",
          variant: "destructive",
        });
      }
    }
    setShowSyncConfirmation(false);
    loadExercisesData();
  };
 
  const getExerciseSourceBadge = (exercise: ExerciseInterface, currentUserId: string | undefined) => {
    if (!exercise.user_id) {
      return (
        <Badge variant="outline" className="text-xs w-fit">
          System
        </Badge>
      );
    }

    if (exercise.user_id === currentUserId) {
      return (
        <Badge variant="secondary" className="text-xs w-fit">
          Private
        </Badge>
      );
    }

    if (exercise.user_id !== currentUserId && !exercise.shared_with_public) {
      return (
        <Badge
          variant="outline"
          className="text-xs w-fit bg-blue-50 text-blue-700"
        >
          Family
        </Badge>
      );
    }
    return null; // No badge from getExerciseSourceBadge if it's public and not owned by user
  };

  return (
    <div className="space-y-6">
      {/* Exercises Section */}
      <Card>
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <Input
                type="text"
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 min-w-[150px]"
              />
              <Select onValueChange={setCategoryFilter} defaultValue={categoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="strength">Strength</SelectItem>
                  <SelectItem value="cardio">Cardio</SelectItem>
                  <SelectItem value="yoga">Yoga</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select onValueChange={(value) => setOwnershipFilter(value as ExerciseOwnershipFilter)} defaultValue={ownershipFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="own">My Own</SelectItem>
                  <SelectItem value="family">Family</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="needs-review">Needs Review</SelectItem>
                </SelectContent>
              </Select>
              <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={() => setIsAddExerciseDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Exercise
              </Button>
            </div>
          </div>
          
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">All Exercises ({totalExercisesCount})</h3>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Items per page:</span>
              <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            {currentExercises.map((exercise) => (
              <div key={exercise.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{exercise.name}</h4>
                    {exercise.tags && exercise.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                            {tag === 'public' && <Share2 className="h-3 w-3 mr-1" />}
                            {tag === 'family' && <Users className="h-3 w-3 mr-1" />}
                            {tag.charAt(0).toUpperCase() + tag.slice(1)}
                        </Badge>
                    ))}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">
                    {exercise.category}
                    {exercise.level && ` • Level: ${exercise.level}`}
                    {exercise.force && ` • Force: ${exercise.force}`}
                    {exercise.mechanic && ` • Mechanic: ${exercise.mechanic}`}
                  </div>
                  {exercise.equipment && Array.isArray(exercise.equipment) && exercise.equipment.length > 0 && (
                    <div className="text-xs text-gray-400">Equipment: {exercise.equipment.join(', ')}</div>
                  )}
                  {exercise.primary_muscles && Array.isArray(exercise.primary_muscles) && exercise.primary_muscles.length > 0 && (
                    <div className="text-xs text-gray-400">Primary Muscles: {exercise.primary_muscles.join(', ')}</div>
                  )}
                  {exercise.secondary_muscles && Array.isArray(exercise.secondary_muscles) && exercise.secondary_muscles.length > 0 && (
                    <div className="text-xs text-gray-400">Secondary Muscles: {exercise.secondary_muscles.join(', ')}</div>
                  )}
                  {exercise.instructions && Array.isArray(exercise.instructions) && exercise.instructions.length > 0 && (
                    <div className="text-xs text-gray-400">Instructions: {exercise.instructions[0]}...</div>
                  )}
                  <div className="text-sm text-gray-500">
                    Calories/Hour: {exercise.calories_per_hour}
                  </div>
                  {exercise.description && (
                    <div className="text-sm text-gray-400 mt-1">{exercise.description}</div>
                  )}
                  {exercise.images && exercise.images.length > 0 && (
                    <img
                      src={exercise.source ? `/uploads/exercises/${exercise.images[0]}` : exercise.images[0]}
                      alt={exercise.name}
                      className="w-16 h-16 object-contain mt-2"
                    />
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  {exercise.user_id === user?.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedExercise(exercise);
                          setEditExerciseName(exercise.name);
                          setEditExerciseCategory(exercise.category);
                          setEditExerciseCalories(exercise.calories_per_hour);
                          setEditExerciseDescription(exercise.description || "");
                          setEditExerciseLevel(exercise.level?.toLowerCase() || "");
                          setEditExerciseForce(exercise.force?.toLowerCase() || "");
                          setEditExerciseMechanic(exercise.mechanic?.toLowerCase() || "");
                          setEditExerciseEquipment(Array.isArray(exercise.equipment) ? exercise.equipment : []);
                          setEditExercisePrimaryMuscles(Array.isArray(exercise.primary_muscles) ? exercise.primary_muscles : []);
                          setEditExerciseSecondaryMuscles(Array.isArray(exercise.secondary_muscles) ? exercise.secondary_muscles : []);
                          setEditExerciseInstructions(Array.isArray(exercise.instructions) ? exercise.instructions : []);
                          setEditExerciseImages(Array.isArray(exercise.images) ? exercise.images : []);
                          setNewExerciseImageFiles([]);
                          setNewExerciseImageUrls([]);
                          setIsEditDialogOpen(true);
                        }}
                        className="h-8 w-8"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRequest(exercise)}
                        className="h-8 w-8 hover:bg-gray-200 dark:hover:bg-gray-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {exercise.user_id === user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleShareExercise(exercise.id, !exercise.shared_with_public)}
                      className="h-8 w-8"
                    >
                      {exercise.shared_with_public ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }
                    
                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNumber)}
                          isActive={pageNumber === currentPage}
                          className="cursor-pointer"
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workout Presets Section */}
      <Card>
        <CardHeader>
          <CardTitle>Workout Presets</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutPresetsManager onUsePreset={(preset) => {
            info(loggingLevel, `Using preset: ${preset.name}`);
            toast({
              title: "Preset Loaded",
              description: `Workout preset "${preset.name}" loaded to diary.`,
            });
            if (preset.exercises) {
              onPresetExercisesSelected(preset.exercises.map(e => ({
                id: e.id || '',
                exercise_id: e.exercise_id,
                sets: e.sets.length,
                reps: e.sets[0]?.reps || 0,
                weight: e.sets[0]?.weight || 0,
                exercise_name: e.exercise_name,
                image_url: e.image_url,
              })));
            }
          }} />
        </CardContent>
      </Card>

      {/* Workout Plans Section */}
      <Card>
        <CardHeader>
          <CardTitle>Workout Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutPlansManager />
        </CardContent>
      </Card>

      <AddExerciseDialog
        open={isAddExerciseDialogOpen}
        onOpenChange={setIsAddExerciseDialogOpen}
        onExerciseAdded={loadExercisesData}
        mode="database-manager"
      />
      {/* Edit Exercise Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[625px] overflow-y-auto max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Edit Exercise</DialogTitle>
            <DialogDescription>
              Edit the details of the selected exercise.
            </DialogDescription>
          </DialogHeader>
          {selectedExercise && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-name" className="text-right">
                  Name
                </Label>
                <Input
                  id="edit-name"
                  value={editExerciseName}
                  onChange={(e) => setEditExerciseName(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-category" className="text-right">
                  Category
                </Label>
                <Select onValueChange={setEditExerciseCategory} defaultValue={editExerciseCategory}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="strength">Strength</SelectItem>
                    <SelectItem value="cardio">Cardio</SelectItem>
                    <SelectItem value="yoga">Yoga</SelectItem>
                    <SelectItem value="powerlifting">Powerlifting</SelectItem>
                    <SelectItem value="olympic weightlifting">Olympic Weightlifting</SelectItem>
                    <SelectItem value="strongman">Strongman</SelectItem>
                    <SelectItem value="plyometrics">Plyometrics</SelectItem>
                    <SelectItem value="stretching">Stretching</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-calories" className="text-right">
                  Calories/Hour
                </Label>
                <Input
                  id="edit-calories"
                  type="number"
                  value={editExerciseCalories.toString()}
                  onChange={(e) => setEditExerciseCalories(Number(e.target.value))}
                  className="col-span-3"
                />
              </div>
              {/* New fields for editing */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-level" className="text-right">
                  Level
                </Label>
                <Select onValueChange={setEditExerciseLevel} defaultValue={editExerciseLevel}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-force" className="text-right">
                  Force
                </Label>
                <Select onValueChange={setEditExerciseForce} defaultValue={editExerciseForce}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select force" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pull">Pull</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="static">Static</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-mechanic" className="text-right">
                  Mechanic
                </Label>
                <Select onValueChange={setEditExerciseMechanic} defaultValue={editExerciseMechanic}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select mechanic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="isolation">Isolation</SelectItem>
                    <SelectItem value="compound">Compound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-equipment" className="text-right mt-1">
                  Equipment (comma-separated)
                </Label>
                <Input
                  id="edit-equipment"
                  value={editExerciseEquipment.join(', ')}
                  onChange={(e) => setEditExerciseEquipment(e.target.value.split(',').map(s => s.trim()))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-primary-muscles" className="text-right mt-1">
                  Primary Muscles (comma-separated)
                </Label>
                <Input
                  id="edit-primary-muscles"
                  value={editExercisePrimaryMuscles.join(', ')}
                  onChange={(e) => setEditExercisePrimaryMuscles(e.target.value.split(',').map(s => s.trim()))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-secondary-muscles" className="text-right mt-1">
                  Secondary Muscles (comma-separated)
                </Label>
                <Input
                  id="edit-secondary-muscles"
                  value={editExerciseSecondaryMuscles.join(', ')}
                  onChange={(e) => setEditExerciseSecondaryMuscles(e.target.value.split(',').map(s => s.trim()))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-instructions" className="text-right mt-1">
                  Instructions (one per line)
                </Label>
                <Textarea
                  id="edit-instructions"
                  value={editExerciseInstructions.join('\n')}
                  onChange={(e) => setEditExerciseInstructions(e.target.value.split('\n').map(s => s.trim()))}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-images" className="text-right mt-1">
                  Images
                </Label>
                <div className="col-span-3">
                  <Input
                    id="edit-images"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files) {
                        const filesArray = Array.from(e.target.files);
                        setNewExerciseImageFiles((prev) => [...prev, ...filesArray]);
                        filesArray.forEach((file) => {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewExerciseImageUrls((prev) => [...prev, reader.result as string]);
                          };
                          reader.readAsDataURL(file);
                        });
                      }
                    }}
                    className="col-span-3"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {editExerciseImages.map((url, index) => (
                      <div
                        key={`existing-${index}`}
                        draggable
                        onDragStart={() => setDraggedImageIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedImageIndex === null) return;
                          const newImages = [...editExerciseImages];
                          const [draggedItem] = newImages.splice(draggedImageIndex, 1);
                          newImages.splice(index, 0, draggedItem);
                          setEditExerciseImages(newImages);
                          setDraggedImageIndex(null);
                        }}
                        className="relative w-24 h-24 cursor-grab"
                      >
                        <img src={url.startsWith('http') ? url : `/uploads/exercises/${url}`} alt={`existing ${index}`} className="w-full h-full object-cover rounded" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={() => setEditExerciseImages((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {newExerciseImageUrls.map((url, index) => (
                      <div
                        key={`new-${index}`}
                        draggable
                        onDragStart={() => setDraggedImageIndex(editExerciseImages.length + index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedImageIndex === null) return;

                          const allImages = [...editExerciseImages, ...newExerciseImageUrls];
                          const allFiles = [...newExerciseImageFiles];

                          const targetIndex = index + editExerciseImages.length;

                          if (draggedImageIndex < editExerciseImages.length) { // Dragging an existing image
                            const newExistingImages = [...editExerciseImages];
                            const [draggedItem] = newExistingImages.splice(draggedImageIndex, 1);
                            newExistingImages.splice(targetIndex, 0, draggedItem);
                            setEditExerciseImages(newExistingImages);
                          } else { // Dragging a new image
                            const newNewImageFiles = [...newExerciseImageFiles];
                            const newNewImageUrls = [...newExerciseImageUrls];

                            const draggedNewImageIndex = draggedImageIndex - editExerciseImages.length;
                            const [draggedFile] = newNewImageFiles.splice(draggedNewImageIndex, 1);
                            const [draggedUrl] = newNewImageUrls.splice(draggedNewImageIndex, 1);

                            newNewImageFiles.splice(targetIndex - editExerciseImages.length, 0, draggedFile);
                            newNewImageUrls.splice(targetIndex - editExerciseImages.length, 0, draggedUrl);

                            setNewExerciseImageFiles(newNewImageFiles);
                            setNewExerciseImageUrls(newNewImageUrls);
                          }
                          setDraggedImageIndex(null);
                        }}
                        className="relative w-24 h-24 cursor-grab"
                      >
                        <img src={url} alt={`preview ${index}`} className="w-full h-full object-cover rounded" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={() => {
                            setNewExerciseImageFiles((prev) => prev.filter((_, i) => i !== index));
                            setNewExerciseImageUrls((prev) => prev.filter((_, i) => i !== index));
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="edit-description" className="text-right mt-1">
                  Description
                </Label>
                <Textarea
                  id="edit-description"
                  value={editExerciseDescription}
                  onChange={(e) => setEditExerciseDescription(e.target.value)}
                  className="col-span-3"
                />
              </div>
            </div>
          )}
          <Button onClick={handleEditExercise}>Save Changes</Button>
        </DialogContent>
      </Dialog>

      {deletionImpact && exerciseToDelete && (
        <ConfirmationDialog
          open={showDeleteConfirmation}
          onOpenChange={setShowDeleteConfirmation}
          onConfirm={confirmDelete}
          title={deletionImpact.isUsedByOthers ? `Delete ${exerciseToDelete.name}?` : `Delete ${exerciseToDelete.name}?`}
          description={
            <div>
              {deletionImpact.isUsedByOthers ? (
                <>
                  <p>This exercise is used by other users. Deleting it will affect their data and is not allowed; it will be hidden instead.</p>
                  <ul className="list-disc pl-5 mt-2">
                    <li>{deletionImpact.exerciseEntriesCount} diary entries (across users)</li>
                  </ul>
                </>
              ) : (
                <>
                  <p>This will permanently delete the exercise and all associated data for your account.</p>
                  <ul className="list-disc pl-5 mt-2">
                    <li>{deletionImpact.exerciseEntriesCount} diary entries</li>
                  </ul>
                </>
              )}
            </div>
          }
          warning={deletionImpact.isUsedByOthers ? "This exercise is used in workouts or diaries by other users. Deleting it will affect their data. It will be hidden instead." : undefined}
          variant={deletionImpact.isUsedByOthers ? "destructive" : "destructive"}
          confirmLabel={!deletionImpact.isUsedByOthers && deletionImpact.exerciseEntriesCount > 0 ? 'Force Delete' : 'Confirm'}
        />
      )}
      {showSyncConfirmation && (
        <ConfirmationDialog
          open={showSyncConfirmation}
          onOpenChange={setShowSyncConfirmation}
          onConfirm={handleSyncConfirmation}
          title="Sync Past Entries?"
          description="Do you want to update all your past diary entries for this exercise with the new information?"
        />
      )}
    </div>
  );
};

export default ExerciseDatabaseManager;
