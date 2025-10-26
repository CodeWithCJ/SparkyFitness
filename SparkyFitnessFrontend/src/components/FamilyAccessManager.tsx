
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Plus, Edit, Trash2, Calendar } from 'lucide-react';
import {
  loadFamilyAccess,
  createFamilyAccess,
  updateFamilyAccess,
  toggleFamilyAccessActiveStatus,
  deleteFamilyAccess,
  findUserByEmail,
  FamilyAccess,
} from '@/services/familyAccessService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';


const FamilyAccessManager = () => {
  const { user } = useAuth();
  const [familyAccess, setFamilyAccess] = useState<FamilyAccess[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccess, setEditingAccess] = useState<FamilyAccess | null>(null);
  const [formData, setFormData] = useState({
    family_email: '',
    can_manage_diary: false,
    can_view_food_library: false,
    can_view_exercise_library: false,
    can_manage_checkin: false,
    can_view_reports: false,
    share_external_providers: false,
    access_end_date: '',
  });

  const fetchFamilyAccess = async () => {
    if (!user) return;
    try {
      const data = await loadFamilyAccess(user.id);
      setFamilyAccess(data);
    } catch (error) {
      console.error('Error loading family access:', error);
      toast({
        title: "Error",
        description: "Failed to load family access records",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchFamilyAccess();
  }, [user?.id]);

  const rulesICreated = familyAccess.filter(
    (access) => user && access.owner_user_id === user.id
  );
  const rulesGivenToMe = familyAccess.filter(
    (access) => user && access.family_user_id === user.id && access.owner_user_id !== user.id
  );

  const resetForm = () => {
    setFormData({
      family_email: '',
      can_manage_diary: false,
      can_view_food_library: false,
      can_view_exercise_library: false,
      can_manage_checkin: false,
      can_view_reports: false,
      share_external_providers: false,
      access_end_date: '',
    });
    setEditingAccess(null);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (access: FamilyAccess) => {
    setFormData({
      family_email: access.family_email,
      can_manage_diary: access.access_permissions.can_manage_diary,
      can_view_food_library: access.access_permissions.can_view_food_library,
      can_view_exercise_library: access.access_permissions.can_view_exercise_library,
      can_manage_checkin: access.access_permissions.can_manage_checkin, // Add new permission
      can_view_reports: access.access_permissions.can_view_reports, // Add new permission
      share_external_providers: access.access_permissions.share_external_providers,
      access_end_date: access.access_end_date ? access.access_end_date.split('T')[0] : '',
    });
    setEditingAccess(access);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user || !formData.family_email) return;

    // Check if at least one permission is selected
    if (!formData.can_manage_diary && !formData.can_view_food_library && !formData.can_view_exercise_library && !formData.can_manage_checkin && !formData.can_view_reports && !formData.share_external_providers) {
      toast({
        title: "Error",
        description: "Please select at least one permission",
        variant: "destructive",
      });
      return;
    }

    // Prevent adding yourself
    if (formData.family_email.toLowerCase() === user.email?.toLowerCase()) {
      toast({
        title: "Error",
        description: "You cannot grant access to yourself",
        variant: "destructive",
      });
      return;
    }

    try {
      
      const foundUserId = await findUserByEmail(formData.family_email);

      if (!editingAccess && foundUserId) {
        const existingAccess = familyAccess.find(
          (access) => access.owner_user_id === user.id && access.family_user_id === foundUserId
        );
        if (existingAccess) {
          toast({
            title: "Error",
            description: "Access already granted to this family member",
            variant: "destructive",
          });
          return;
        }
      }

      // For new access grants, we'll use a placeholder UUID if user not found
      // This allows the access to be created and activated later when the user signs up
      const familyUserId = foundUserId || '00000000-0000-0000-0000-000000000000';
      const status = foundUserId ? 'active' : 'pending';

      const accessData = {
        owner_user_id: user.id,
        family_user_id: familyUserId,
        family_email: formData.family_email,
        access_permissions: {
          can_manage_diary: formData.can_manage_diary,
          can_view_food_library: formData.can_view_food_library,
          can_view_exercise_library: formData.can_view_exercise_library,
          can_manage_checkin: formData.can_manage_checkin, // Add new permission
          can_view_reports: formData.can_view_reports, // Add new permission
          share_external_providers: formData.share_external_providers,
        },
        access_end_date: formData.access_end_date || null,
        status: status,
      };


      if (editingAccess) {
        // Update existing access
        await updateFamilyAccess(editingAccess.id, accessData);
        
        toast({
          title: "Success",
          description: "Family access updated successfully",
        });
      } else {
        // Create new access
        await createFamilyAccess(accessData);
        
        const statusMessage = foundUserId 
          ? "Family access granted successfully" 
          : `Access invitation sent to ${formData.family_email}. They'll have access once they create a SparkyFitness account.`;
        
        toast({
          title: "Success",
          description: statusMessage,
        });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchFamilyAccess(); // Call the function directly
    } catch (error) {
      console.error('Error saving family access:', error);
      toast({
        title: "Error",
        description: "Failed to save family access",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (access: FamilyAccess) => {
    try {
      await toggleFamilyAccessActiveStatus(access.id, !access.is_active);
      
      toast({
        title: "Success",
        description: `Family access ${!access.is_active ? 'activated' : 'deactivated'}`,
      });
      
      fetchFamilyAccess(); // Call the function directly
    } catch (error) {
      console.error('Error toggling family access:', error);
      toast({
        title: "Error",
        description: "Failed to update family access",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (accessId: string) => {
    try {
      await deleteFamilyAccess(accessId);
      
      toast({
        title: "Success",
        description: "Family access removed successfully",
      });
      
      fetchFamilyAccess(); // Call the function directly
    } catch (error) {
      console.error('Error deleting family access:', error);
      toast({
        title: "Error",
        description: "Failed to remove family access",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive) {
      return <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">Inactive</span>;
    }
    
    switch (status) {
      case 'active':
        return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Active</span>;
      case 'pending':
        return <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">Pending</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">Unknown</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Family Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingAccess ? 'Edit' : 'Add'} Family Access
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="family_email">Family Member Email</Label>
                <Input
                  id="family_email"
                  type="email"
                  value={formData.family_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, family_email: e.target.value }))}
                  placeholder="Enter family member's email"
                  disabled={!!editingAccess}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  They'll get access once they create a SparkyFitness account (if they don't have one already)
                </p>
              </div>

              <Separator />

              <div>
                <Label className="text-base font-medium">Access Permissions</Label>
                <div className="space-y-3 mt-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_manage_diary"
                      checked={formData.can_manage_diary}
                      onCheckedChange={(checked) =>
                        setFormData(prev => ({ ...prev, can_manage_diary: !!checked }))
                      }
                    />
                    <Label htmlFor="can_manage_diary" className='cursor-pointer'>Can Manage Diary</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_view_food_library"
                      checked={formData.can_view_food_library}
                      onCheckedChange={(checked) =>
                        setFormData(prev => ({ ...prev, can_view_food_library: !!checked }))
                      }
                    />
                    <Label htmlFor="can_view_food_library" className='cursor-pointer'>Can Use My Food & Meal Library</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_view_exercise_library"
                      checked={formData.can_view_exercise_library}
                      onCheckedChange={(checked) =>
                        setFormData(prev => ({ ...prev, can_view_exercise_library: !!checked }))
                      }
                    />
                    <Label htmlFor="can_view_exercise_library" className='cursor-pointer'>Can Use My Exercise & Workout Library</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_manage_checkin"
                      checked={formData.can_manage_checkin}
                      onCheckedChange={(checked) =>
                        setFormData(prev => ({ ...prev, can_manage_checkin: !!checked }))
                      }
                    />
                    <Label htmlFor="can_manage_checkin" className='cursor-pointer'>Can Manage Check-in Data</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="can_view_reports"
                      checked={formData.can_view_reports}
                      onCheckedChange={(checked) =>
                        setFormData(prev => ({ ...prev, can_view_reports: !!checked }))
                      }
                    />
                    <Label htmlFor="can_view_reports" className='cursor-pointer'>Can View Reports</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="share_external_providers"
                      checked={formData.share_external_providers}
                      onCheckedChange={(checked) =>
                        setFormData(prev => ({ ...prev, share_external_providers: !!checked }))
                      }
                    />
                    <Label htmlFor="share_external_providers" className='cursor-pointer'>Share External Data Providers</Label>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="access_end_date">Access End Date (Optional)</Label>
                <Input
                  id="access_end_date"
                  type="date"
                  value={formData.access_end_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, access_end_date: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty for indefinite access
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSubmit} className="flex-1">
                  {editingAccess ? 'Update' : 'Grant'} Access
                </Button>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {rulesICreated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rules I Created</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Family Member</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rulesICreated.map((access) => (
                  <TableRow key={access.id}>
                    <TableCell>{access.family_email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {access.access_permissions.can_manage_diary && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            Manages Diary
                          </span>
                        )}
                        {access.access_permissions.can_view_food_library && (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                            Food Library
                          </span>
                        )}
                        {access.access_permissions.can_view_exercise_library && (
                          <span className="bg-teal-100 text-teal-800 text-xs px-2 py-1 rounded">
                            Exercise Library
                          </span>
                        )}
                        {access.access_permissions.can_manage_checkin && (
                          <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                            Manages Check-in
                          </span>
                        )}
                        {access.access_permissions.can_view_reports && (
                          <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">
                            Views Reports
                          </span>
                        )}
                        {access.access_permissions.share_external_providers && (
                          <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                            Shares External Providers
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {access.access_end_date ?
                        new Date(access.access_end_date).toLocaleDateString() :
                        'No end date'
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={access.is_active}
                          onCheckedChange={() => handleToggleActive(access)}
                        />
                        {getStatusBadge(access.status, access.is_active)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(access)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(access.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {rulesGivenToMe.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rules Given to Me</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Granted By</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rulesGivenToMe.map((access) => (
                  <TableRow key={access.id}>
                    <TableCell>{access.owner_email || 'N/A'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {access.access_permissions.can_manage_diary && (
                          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            Manages Diary
                          </span>
                        )}
                        {access.access_permissions.can_view_food_library && (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                            Food Library
                          </span>
                        )}
                        {access.access_permissions.can_view_exercise_library && (
                          <span className="bg-teal-100 text-teal-800 text-xs px-2 py-1 rounded">
                            Exercise Library
                          </span>
                        )}
                        {access.access_permissions.can_manage_checkin && (
                          <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                            Manages Check-in
                          </span>
                        )}
                        {access.access_permissions.can_view_reports && (
                          <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">
                            Views Reports
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {access.access_end_date ?
                        new Date(access.access_end_date).toLocaleDateString() :
                        'No end date'
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={access.is_active}
                          onCheckedChange={() => handleToggleActive(access)}
                          disabled={true}
                        />
                        {getStatusBadge(access.status, access.is_active)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(access)}
                          disabled={true}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(access.id)}
                          disabled={true}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {familyAccess.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No family access granted yet</p>
          <p className="text-sm">Add family members to let them help manage your fitness data</p>
        </div>
      )}
    </div>
  );
};

export default FamilyAccessManager;
