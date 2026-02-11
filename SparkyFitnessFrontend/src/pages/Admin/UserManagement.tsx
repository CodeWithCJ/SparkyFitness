import type React from 'react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { Search, Edit, Trash2, UserCog, KeyRound, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  userManagementService,
  type User,
} from '../../services/userManagementService';
import { useUsers } from '@/hooks/Admin/useSettings';
import { useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';

const UserManagement: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editedUser, setEditedUser] = useState<User | null>(null);
  const [sortBy, setSortBy] = useState<keyof User>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [accordionOpen, setAccordionOpen] = useState<string[]>([]); // Keep accordion closed by default
  const queryClient = useQueryClient();
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const {
    data: users,
    isLoading,
    isError,
  } = useUsers(debouncedSearchTerm, sortBy, sortOrder);

  const handleSaveFullName = async (
    userId: string,
    newFullName: string,
    currentFullName: string
  ) => {
    if (!newFullName || newFullName === currentFullName) {
      setEditingUserId(null);
      setEditedUser(null);
      return;
    }

    if (
      !window.confirm(
        t('admin.userManagement.confirmChangeFullName', {
          currentFullName,
          newFullName,
          defaultValue: `Are you sure you want to change ${currentFullName}'s full name to ${newFullName}?`,
        })
      )
    ) {
      setEditingUserId(null);
      setEditedUser(null);
      return;
    }

    setLoading(true);
    try {
      await userManagementService.updateUserFullName(userId, newFullName);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: t('success', 'Success'),
        description: t('admin.userManagement.fullNameUpdated', {
          currentFullName,
          defaultValue: `User ${currentFullName}'s full name updated successfully.`,
        }),
      });
      setEditingUserId(null);
      setEditedUser(null);
    } catch (err: any) {
      setError(
        err.message ||
          t(
            'admin.userManagement.failedToSaveFullName',
            'Failed to save user full name.'
          )
      );
      toast({
        title: t('admin.userManagement.error', 'Error'),
        description: t(
          'admin.userManagement.failedToSaveFullName',
          'Failed to save user full name.'
        ),
        variant: 'destructive',
      });
    } finally {
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await userManagementService.deleteUser(userId);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: t('success', 'Success'),
        description: t('admin.userManagement.deleteSuccess', {
          userId,
          defaultValue: `User with ID ${userId} deleted successfully.`,
        }),
      });
    } catch (err: any) {
      setError(
        err.message ||
          t('admin.userManagement.deleteFailed', 'Failed to delete user.')
      );
      toast({
        title: t('admin.userManagement.error', 'Error'),
        description: t(
          'admin.userManagement.deleteFailed',
          'Failed to delete user.'
        ),
        variant: 'destructive',
      });
    } finally {
    }
  };

  const handleResetPassword = async (userId: string, userName: string) => {
    if (
      !window.confirm(
        t('admin.userManagement.resetPasswordConfirm', {
          userName,
          defaultValue: `Are you sure you want to reset the password for ${userName}?`,
        })
      )
    ) {
      return;
    }
    try {
      await userManagementService.resetUserPassword(userId);
      toast({
        title: t('success', 'Success'),
        description: t('admin.userManagement.resetPasswordInitiated', {
          userName,
          defaultValue: `Password reset initiated for ${userName}.`,
        }),
      });
    } catch (err: any) {
      setError(
        err.message ||
          t(
            'admin.userManagement.resetPasswordFailed',
            'Failed to reset password.'
          )
      );
      toast({
        title: t('admin.userManagement.error', 'Error'),
        description: t(
          'admin.userManagement.resetPasswordFailed',
          'Failed to reset password.'
        ),
        variant: 'destructive',
      });
    } finally {
    }
  };

  const handleToggleUserStatus = async (
    userId: string,
    userName: string,
    newCheckedState: boolean
  ) => {
    const actualNewStatus = newCheckedState;
    const action = actualNewStatus ? 'activate' : 'deactivate'; // Action based on the actual new state
    if (
      !window.confirm(
        t('admin.userManagement.toggleUserStatusConfirm', {
          action,
          userName,
          defaultValue: `Are you sure you want to ${action} user ${userName}?`,
        })
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await userManagementService.updateUserStatus(userId, actualNewStatus);
      toast({
        title: t('success', 'Success'),
        description: t('admin.userManagement.userStatusUpdated', {
          userName,
          action,
          defaultValue: `User ${userName} ${action}d successfully.`,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      setError(
        err.message ||
          t('admin.userManagement.failedToUpdateUserStatus', {
            action,
            defaultValue: `Failed to ${action} user.`,
          })
      );
      toast({
        title: t('admin.userManagement.error', 'Error'),
        description: t('admin.userManagement.failedToUpdateUserStatus', {
          action,
          defaultValue: `Failed to ${action} user.`,
        }),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserRole = async (
    userId: string,
    userName: string,
    currentRole: string
  ) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (
      !window.confirm(
        t('admin.userManagement.toggleUserRoleConfirm', {
          userName,
          newRole,
          defaultValue: `Are you sure you want to change user ${userName}'s role to ${newRole}?`,
        })
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await userManagementService.updateUserRole(userId, newRole);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: t('success', 'Success'),
        description: t('admin.userManagement.userRoleUpdated', {
          userName,
          newRole,
          defaultValue: `User ${userName}'s role updated to ${newRole} successfully.`,
        }),
      });
    } catch (err: any) {
      setError(
        err.message ||
          t('admin.userManagement.failedToUpdateUserRole', {
            userName,
            defaultValue: `Failed to update user ${userName}'s role.`,
          })
      );
      toast({
        title: t('admin.userManagement.error', 'Error'),
        description: t('admin.userManagement.failedToUpdateUserRole', {
          userName,
          defaultValue: `Failed to update user ${userName}'s role.`,
        }),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetMfa = async (userId: string, userName: string) => {
    if (
      !window.confirm(
        t('admin.userManagement.resetMfaConfirm', {
          userName,
          defaultValue: `Are you sure you want to reset MFA for ${userName}? This will require the user to set up MFA again.`,
        })
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await userManagementService.resetUserMfa(userId);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({
        title: t('success', 'Success'),
        description: t('admin.userManagement.resetMfaSuccess', {
          userName,
          defaultValue: `MFA for ${userName} reset successfully.`,
        }),
      });
    } catch (err: any) {
      setError(
        err.message ||
          t('admin.userManagement.resetMfaFailed', 'Failed to reset MFA.')
      );
      toast({
        title: t('admin.userManagement.error', 'Error'),
        description: t(
          'admin.userManagement.resetMfaFailed',
          'Failed to reset MFA.'
        ),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div>
        {t('admin.userManagement.loadingUsers', 'Loading user data...')}
      </div>
    );
  }

  if (error || isError) {
    return (
      <div className="text-red-500">
        {t('admin.userManagement.error', 'Error')}: {error}
      </div>
    );
  }

  if (!users || users.length === 0) {
    return (
      <div>{t('admin.userManagement.noUsersFound', 'No users found.')}</div>
    );
  }

  const sortedUsers = [...users].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortOrder === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
      return sortOrder === 'asc'
        ? aValue === bValue
          ? 0
          : aValue
            ? -1
            : 1
        : aValue === bValue
          ? 0
          : aValue
            ? 1
            : -1;
    }
    if (
      (sortBy === 'created_at' || sortBy === 'last_login_at') &&
      typeof aValue === 'string' &&
      typeof bValue === 'string'
    ) {
      const dateA = new Date(aValue);
      const dateB = new Date(bValue);
      return sortOrder === 'asc'
        ? dateA.getTime() - dateB.getTime()
        : dateB.getTime() - dateA.getTime();
    }
    // Fallback for other types or mixed types, treat as strings
    return sortOrder === 'asc'
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });

  const filteredUsers = sortedUsers.filter(
    (user) =>
      (user.full_name?.toLowerCase() ?? '').includes(
        searchTerm.toLowerCase()
      ) || (user.email?.toLowerCase() ?? '').includes(searchTerm.toLowerCase())
  );

  const handleEditedUserChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    if (editedUser) {
      setEditedUser((prev) => ({ ...prev!, [id]: value }));
    }
  };

  const handleSortChange = (column: keyof User) => {
    if (sortBy === column) {
      setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  return (
    <Accordion
      type="multiple"
      className="w-full"
      value={accordionOpen}
      onValueChange={setAccordionOpen}
    >
      <AccordionItem value="user-management" className="border rounded-lg mb-4">
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description={t(
            'admin.userManagement.description',
            'Manage user accounts, roles, and statuses.'
          )}
        >
          <UserCog className="h-5 w-5" />
          {t('admin.userManagement.title', 'User Management')}
        </AccordionTrigger>
        <AccordionContent className="p-4 pt-0 space-y-6">
          <Card className="w-full mx-auto">
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t(
                    'admin.userManagement.searchUsers',
                    'Search users...'
                  )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange('full_name');
                        }}
                      >
                        {t('admin.userManagement.fullName', 'Full Name')}{' '}
                        {sortBy === 'full_name' &&
                          (sortOrder === 'asc' ? '▲' : '▼')}{' '}
                        <Edit className="h-4 w-4 inline-block ml-1" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange('email');
                        }}
                      >
                        {t('admin.userManagement.email', 'Email')}{' '}
                        {sortBy === 'email' &&
                          (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange('role');
                        }}
                      >
                        {t('admin.userManagement.admin', 'Admin')}{' '}
                        {sortBy === 'role' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange('is_active');
                        }}
                      >
                        {t('admin.userManagement.active', 'Active')}{' '}
                        {sortBy === 'is_active' &&
                          (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange('created_at');
                        }}
                      >
                        {t('admin.userManagement.createdAt', 'Created At')}{' '}
                        {sortBy === 'created_at' &&
                          (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange('last_login_at');
                        }}
                      >
                        {t('admin.userManagement.lastLogin', 'Last Login')}{' '}
                        {sortBy === 'last_login_at' &&
                          (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange('mfa_totp_enabled');
                        }}
                      >
                        {t('admin.userManagement.totpEnabled', 'TOTP')}{' '}
                        {sortBy === 'mfa_totp_enabled' &&
                          (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSortChange('mfa_email_enabled');
                        }}
                      >
                        {t('admin.userManagement.emailMfaEnabled', 'Email MFA')}{' '}
                        {sortBy === 'mfa_email_enabled' &&
                          (sortOrder === 'asc' ? '▲' : '▼')}
                      </TableHead>
                      <TableHead className="text-right">
                        {t('admin.userManagement.actions', 'Actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell
                          className="font-medium"
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
                              onBlur={(e) =>
                                handleSaveFullName(
                                  user.id,
                                  e.target.value,
                                  user.full_name
                                )
                              }
                              autoFocus
                            />
                          ) : (
                            user.full_name
                          )}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Switch
                            id={`role-${user.id}`}
                            checked={user.role === 'admin'}
                            onCheckedChange={(checked) =>
                              handleToggleUserRole(
                                user.id,
                                user.full_name,
                                user.role
                              )
                            }
                            disabled={loading}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            id={`is_active-${user.id}`}
                            checked={user.is_active}
                            onCheckedChange={(newCheckedState) =>
                              handleToggleUserStatus(
                                user.id,
                                user.full_name,
                                newCheckedState
                              )
                            }
                            disabled={loading}
                          />
                        </TableCell>
                        <TableCell>
                          {user.created_at
                            ? new Date(user.created_at).toLocaleString()
                            : t('common.notApplicable', 'N/A')}
                        </TableCell>
                        <TableCell>
                          {user.last_login_at
                            ? new Date(user.last_login_at).toLocaleString()
                            : t('common.notApplicable', 'N/A')}
                        </TableCell>
                        <TableCell>
                          <Switch
                            id={`mfa_totp_enabled-${user.id}`}
                            checked={user.mfa_totp_enabled}
                            disabled
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            id={`mfa_email_enabled-${user.id}`}
                            checked={user.mfa_email_enabled}
                            disabled
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleResetPassword(
                                        user.id,
                                        user.full_name
                                      )
                                    }
                                    disabled={loading}
                                  >
                                    <KeyRound className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {t(
                                      'admin.userManagement.resetPassword',
                                      'Reset Password'
                                    )}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDeleteUser(user.id)}
                                    disabled={loading}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {t(
                                      'admin.userManagement.deleteUser',
                                      'Delete User'
                                    )}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleResetMfa(user.id, user.full_name)
                                    }
                                    disabled={loading}
                                  >
                                    <Lock className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {t(
                                      'admin.userManagement.resetMfa',
                                      'Reset MFA'
                                    )}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
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
