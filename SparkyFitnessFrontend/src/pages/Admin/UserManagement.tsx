import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Users, Search, Edit, Trash2, UserCog, KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { userManagementService, type User } from '../../services/userManagementService';

const UserManagement: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editedUser, setEditedUser] = useState<User | null>(null);
  const [sortBy, setSortBy] = useState<keyof User>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [accordionOpen, setAccordionOpen] = useState<string[]>([]); // Keep accordion closed by default

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const fetchedUsers = await userManagementService.getUsers(searchTerm); // Fetch without sort parameters
      setUsers(fetchedUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch user data.');
      toast({
        title: "Error",
        description: "Failed to load user data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [searchTerm, sortBy, sortOrder]); // Re-fetch when search term or sort changes



  const handleSaveFullName = async (userId: string, newFullName: string, currentFullName: string) => {
    if (!newFullName || newFullName === currentFullName) {
      setEditingUserId(null);
      setEditedUser(null);
      return;
    }

    if (!window.confirm(`Are you sure you want to change ${currentFullName}'s full name to ${newFullName}?`)) {
      setEditingUserId(null);
      setEditedUser(null);
      return;
    }

    setLoading(true);
    try {
      await userManagementService.updateUserFullName(userId, newFullName);
      setUsers(prevUsers => prevUsers.map(u => (u.id === userId ? { ...u, full_name: newFullName } : u)));
      toast({
        title: "Success",
        description: `User ${currentFullName}'s full name updated successfully.`,
      });
      setEditingUserId(null);
      setEditedUser(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save user full name.');
      toast({
        title: "Error",
        description: "Failed to save user full name.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setLoading(true);
    try {
      await userManagementService.deleteUser(userId);
      setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));
      toast({
        title: "Success",
        description: `User with ID ${userId} deleted successfully.`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
      toast({
        title: "Error",
        description: "Failed to delete user.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to reset the password for ${userName}?`)) {
      return;
    }
    setLoading(true);
    try {
      await userManagementService.resetUserPassword(userId);
      toast({
        title: "Success",
        description: `Password reset initiated for ${userName}.`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
      toast({
        title: "Error",
        description: "Failed to reset password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserStatus = async (userId: string, userName: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} user ${userName}?`)) {
      return;
    }
    setLoading(true);
    try {
      await userManagementService.updateUserStatus(userId, !currentStatus);
      setUsers(prevUsers =>
        prevUsers.map(u => (u.id === userId ? { ...u, isActive: !currentStatus } : u))
      );
      toast({
        title: "Success",
        description: `User ${userName} ${action}d successfully.`,
      });
    } catch (err: any) {
      setError(err.message || `Failed to ${action} user.`);
      toast({
        title: "Error",
        description: `Failed to ${action} user.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserRole = async (userId: string, userName: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Are you sure you want to change user ${userName}'s role to ${newRole}?`)) {
      return;
    }
    setLoading(true);
    try {
      await userManagementService.updateUserRole(userId, newRole);
      setUsers(prevUsers =>
        prevUsers.map(u => (u.id === userId ? { ...u, role: newRole } : u))
      );
      toast({
        title: "Success",
        description: `User ${userName}'s role updated to ${newRole} successfully.`,
      });
    } catch (err: any) {
      setError(err.message || `Failed to update user ${userName}'s role.`);
      toast({
        title: "Error",
        description: `Failed to update user ${userName}'s role.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
 
  if (loading) {
    return <div>Loading user data...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!users || users.length === 0) {
    return <div>No users found.</div>;
  }

  const sortedUsers = [...users].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }
    if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
      return sortOrder === 'asc' ? (aValue === bValue ? 0 : aValue ? -1 : 1) : (aValue === bValue ? 0 : aValue ? 1 : -1);
    }
    if ((sortBy === 'created_at' || sortBy === 'last_login_at') && typeof aValue === 'string' && typeof bValue === 'string') {
      const dateA = new Date(aValue);
      const dateB = new Date(bValue);
      return sortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
    }
    // Fallback for other types or mixed types, treat as strings
    return sortOrder === 'asc' ? String(aValue).localeCompare(String(bValue)) : String(bValue).localeCompare(String(aValue));
  });

  const filteredUsers = sortedUsers.filter(user =>
    (user.full_name?.toLowerCase() ?? '').includes(searchTerm.toLowerCase()) ||
    (user.email?.toLowerCase() ?? '').includes(searchTerm.toLowerCase())
  );

  const handleEditedUserChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    if (editedUser) {
      setEditedUser(prev => ({ ...prev!, [id]: value }));
    }
  };

  const handleSortChange = (column: keyof User) => {
    if (sortBy === column) {
      setSortOrder(prevOrder => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };
 
  return (
    <Accordion type="multiple" className="w-full" value={accordionOpen} onValueChange={setAccordionOpen}>
      <AccordionItem value="user-management" className="border rounded-lg mb-4">
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description="Manage user accounts, roles, and statuses."
        >
          <UserCog className="h-5 w-5" />
          User Management
        </AccordionTrigger>
        <AccordionContent className="p-4 pt-0 space-y-6">
          <Card className="w-full mx-auto">
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleSortChange('full_name'); }}
                      >
                        Full Name {sortBy === 'full_name' && (sortOrder === 'asc' ? '▲' : '▼')} <Edit className="h-4 w-4 inline-block ml-1" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleSortChange('email'); }}
                      >
                        Email {sortBy === 'email' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleSortChange('role'); }}
                      >
                        Admin {sortBy === 'role' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleSortChange('isActive'); }}
                      >
                        Active {sortBy === 'isActive' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleSortChange('created_at'); }}
                      >
                        Created At {sortBy === 'created_at' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleSortChange('last_login_at'); }}
                      >
                        Last Login {sortBy === 'last_login_at' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium"
                          onClick={() => {
                            setEditingUserId(user.id);
                            setEditedUser({ ...user });
                          }}
                        >
                          {editingUserId === user.id ? (
                            <Input
                              id="full_name"
                              value={editedUser?.full_name || ''}
                              onChange={handleEditedUserChange}
                              onBlur={(e) => handleSaveFullName(user.id, e.target.value, user.full_name)}
                              autoFocus
                            />
                          ) : (
                            user.full_name
                          )}
                        </TableCell>
                        <TableCell>
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Switch
                            id={`role-${user.id}`}
                            checked={user.role === 'admin'}
                            onCheckedChange={(checked) => handleToggleUserRole(user.id, user.full_name, user.role)}
                            disabled={loading}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            id={`isActive-${user.id}`}
                            checked={user.isActive}
                            onCheckedChange={(checked) => handleToggleUserStatus(user.id, user.full_name, user.isActive)}
                            disabled={loading}
                          />
                        </TableCell>
                        <TableCell>
                          {user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleResetPassword(user.id, user.full_name)} disabled={loading} className="mr-2">
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(user.id)} disabled={loading}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default UserManagement;