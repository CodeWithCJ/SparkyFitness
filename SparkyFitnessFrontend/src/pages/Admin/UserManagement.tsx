import type React from 'react';
import { useState, useMemo } from 'react';
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
import { type User } from '../../api/Admin/userManagementService';
import { useUsers } from '@/hooks/Admin/useUsers';
import { useDebounce } from '@/hooks/useDebounce';

import {
  useUpdateUserFullName,
  useDeleteUser,
  useResetUserPassword,
  useUpdateUserStatus,
  useUpdateUserRole,
  useResetUserMfa,
} from '@/hooks/Admin/useUsers';

const UserManagement: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Local State
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editedUser, setEditedUser] = useState<User | null>(null);
  const [sortBy, setSortBy] = useState<keyof User>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [accordionOpen, setAccordionOpen] = useState<string[]>([]);

  // Queries & Mutations
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const {
    data: users,
    isLoading,
    isError,
  } = useUsers(debouncedSearchTerm, sortBy, sortOrder);

  const { mutate: updateFullName } = useUpdateUserFullName();
  const { mutate: deleteUser } = useDeleteUser();
  const { mutate: resetPassword } = useResetUserPassword();
  const { mutate: updateStatus } = useUpdateUserStatus();
  const { mutate: updateRole } = useUpdateUserRole();
  const { mutate: resetMfa } = useResetUserMfa();

  // --- Handlers ---

  const handleSaveFullName = (
    userId: string,
    newFullName: string,
    currentFullName: string
  ) => {
    if (!newFullName || newFullName === currentFullName) {
      setEditingUserId(null);
      return;
    }

    if (
      !window.confirm(
        t(
          'admin.userManagement.confirmChangeFullName',
          `Change name to ${newFullName}?`
        )
      )
    ) {
      setEditingUserId(null);
      return;
    }

    updateFullName(
      { userId, fullName: newFullName },
      {
        onSuccess: () => {
          toast({
            title: t('success', 'Success'),
            description: t(
              'admin.userManagement.fullNameUpdated',
              'Name updated.'
            ),
          });
          setEditingUserId(null);
          setEditedUser(null);
        },
        onError: (err: any) => {
          toast({
            title: t('error', 'Error'),
            description: err.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleDeleteUser = (userId: string) => {
    if (
      !window.confirm(
        t(
          'admin.userManagement.deleteUserConfirm',
          'Are you sure you want to delete this user?'
        )
      )
    )
      return;

    deleteUser(userId, {
      onSuccess: () =>
        toast({
          title: t('success', 'Success'),
          description: t('admin.userManagement.deleteSuccess', 'User deleted.'),
        }),
      onError: (err: any) =>
        toast({
          title: t('error', 'Error'),
          description: err.message,
          variant: 'destructive',
        }),
    });
  };

  const handleResetPassword = (userId: string, userName: string) => {
    if (
      !window.confirm(
        t(
          'admin.userManagement.resetPasswordConfirm',
          `Reset password for ${userName}?`
        )
      )
    )
      return;

    resetPassword(userId, {
      onSuccess: () =>
        toast({
          title: t('success', 'Success'),
          description: t(
            'admin.userManagement.resetPasswordInitiated',
            'Password reset initiated.'
          ),
        }),
      onError: (err: any) =>
        toast({
          title: t('error', 'Error'),
          description: err.message,
          variant: 'destructive',
        }),
    });
  };

  const handleToggleUserStatus = (
    userId: string,
    userName: string,
    newCheckedState: boolean
  ) => {
    const action = newCheckedState ? 'activate' : 'deactivate';
    if (
      !window.confirm(
        t(
          'admin.userManagement.toggleUserStatusConfirm',
          `${action} user ${userName}?`
        )
      )
    )
      return;

    updateStatus(
      { userId, isActive: newCheckedState },
      {
        onSuccess: () =>
          toast({
            title: t('success', 'Success'),
            description: t(
              'admin.userManagement.userStatusUpdated',
              `User ${action}d.`
            ),
          }),
        onError: (err: any) =>
          toast({
            title: t('error', 'Error'),
            description: err.message,
            variant: 'destructive',
          }),
      }
    );
  };

  const handleToggleUserRole = (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (
      !window.confirm(
        t(
          'admin.userManagement.toggleUserRoleConfirm',
          `Change role to ${newRole}?`
        )
      )
    )
      return;

    updateRole(
      { userId, role: newRole },
      {
        onSuccess: () =>
          toast({
            title: t('success', 'Success'),
            description: t(
              'admin.userManagement.userRoleUpdated',
              `Role updated to ${newRole}.`
            ),
          }),
        onError: (err: any) =>
          toast({
            title: t('error', 'Error'),
            description: err.message,
            variant: 'destructive',
          }),
      }
    );
  };

  const handleResetMfa = (userId: string, userName: string) => {
    if (
      !window.confirm(
        t('admin.userManagement.resetMfaConfirm', `Reset MFA for ${userName}?`)
      )
    )
      return;

    resetMfa(userId, {
      onSuccess: () =>
        toast({
          title: t('success', 'Success'),
          description: t('admin.userManagement.resetMfaSuccess', 'MFA reset.'),
        }),
      onError: (err: any) =>
        toast({
          title: t('error', 'Error'),
          description: err.message,
          variant: 'destructive',
        }),
    });
  };

  const handleSortChange = (column: keyof User) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleEditedUserChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (editedUser) {
      setEditedUser({ ...editedUser, [e.target.id]: e.target.value });
    }
  };

  const processedUsers = useMemo(() => {
    if (!users) return [];

    const sorted = [...users].sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      const compare = (valA: any, valB: any) => {
        if (typeof valA === 'string' && typeof valB === 'string')
          return valA.localeCompare(valB);
        if (typeof valA === 'boolean' && typeof valB === 'boolean')
          return valA === valB ? 0 : valA ? -1 : 1;
        if (sortBy.includes('_at'))
          return new Date(valA).getTime() - new Date(valB).getTime();
        return String(valA).localeCompare(String(valB));
      };

      const result = compare(aValue, bValue);
      return sortOrder === 'asc' ? result : -result;
    });

    return sorted.filter(
      (user) =>
        (user.full_name?.toLowerCase() ?? '').includes(
          searchTerm.toLowerCase()
        ) ||
        (user.email?.toLowerCase() ?? '').includes(searchTerm.toLowerCase())
    );
  }, [users, sortBy, sortOrder, searchTerm]);

  if (isLoading)
    return <div>{t('admin.userManagement.loadingUsers', 'Loading...')}</div>;
  if (isError)
    return (
      <div className="text-red-500">
        {t('admin.userManagement.error', 'Error loading users')}
      </div>
    );

  return (
    <Accordion
      type="multiple"
      className="w-full"
      value={accordionOpen}
      onValueChange={setAccordionOpen}
    >
      <AccordionItem value="user-management" className="border rounded-lg mb-4">
        <AccordionTrigger className="flex items-center gap-2 p-4 hover:no-underline">
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

              {!processedUsers || processedUsers.length === 0 ? (
                <div>
                  {t('admin.userManagement.noUsersFound', 'No users found.')}
                </div>
              ) : (
                <div onClick={(e) => e.stopPropagation()}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead
                          label={t('admin.userManagement.fullName', 'Name')}
                          col="full_name"
                          currentSort={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortChange}
                        />
                        <SortableHead
                          label={t('admin.userManagement.email', 'Email')}
                          col="email"
                          currentSort={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortChange}
                        />
                        <SortableHead
                          label={t('admin.userManagement.admin', 'Admin')}
                          col="role"
                          currentSort={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortChange}
                        />
                        <SortableHead
                          label={t('admin.userManagement.active', 'Active')}
                          col="is_active"
                          currentSort={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortChange}
                        />
                        <SortableHead
                          label={t('admin.userManagement.createdAt', 'Created')}
                          col="created_at"
                          currentSort={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortChange}
                        />
                        <SortableHead
                          label={t(
                            'admin.userManagement.lastLogin',
                            'Last Login'
                          )}
                          col="last_login_at"
                          currentSort={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortChange}
                        />
                        <SortableHead
                          label="TOTP"
                          col="mfa_totp_enabled"
                          currentSort={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortChange}
                        />
                        <SortableHead
                          label="Email MFA"
                          col="mfa_email_enabled"
                          currentSort={sortBy}
                          sortOrder={sortOrder}
                          onSort={handleSortChange}
                        />
                        <TableHead className="text-right">
                          {t('admin.userManagement.actions', 'Actions')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processedUsers.map((user) => (
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
                              <>
                                {user.full_name}{' '}
                                <Edit className="h-3 w-3 inline opacity-50 ml-1" />
                              </>
                            )}
                          </TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Switch
                              checked={user.role === 'admin'}
                              onCheckedChange={() =>
                                handleToggleUserRole(user.id, user.role)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={user.is_active}
                              onCheckedChange={(c) =>
                                handleToggleUserStatus(
                                  user.id,
                                  user.full_name,
                                  c
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            {user.created_at
                              ? new Date(user.created_at).toLocaleString()
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {user.last_login_at
                              ? new Date(user.last_login_at).toLocaleString()
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Switch checked={user.mfa_totp_enabled} disabled />
                          </TableCell>
                          <TableCell>
                            <Switch checked={user.mfa_email_enabled} disabled />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end space-x-2">
                              <ActionButton
                                icon={<KeyRound className="h-4 w-4" />}
                                onClick={() =>
                                  handleResetPassword(user.id, user.full_name)
                                }
                                tooltip={t(
                                  'admin.userManagement.resetPassword',
                                  'Reset Password'
                                )}
                              />
                              <ActionButton
                                icon={<Lock className="h-4 w-4" />}
                                onClick={() =>
                                  handleResetMfa(user.id, user.full_name)
                                }
                                tooltip={t(
                                  'admin.userManagement.resetMfa',
                                  'Reset MFA'
                                )}
                              />
                              <ActionButton
                                icon={<Trash2 className="h-4 w-4" />}
                                onClick={() => handleDeleteUser(user.id)}
                                tooltip={t(
                                  'admin.userManagement.deleteUser',
                                  'Delete'
                                )}
                                variant="destructive"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

const SortableHead = ({ label, col, currentSort, sortOrder, onSort }: any) => (
  <TableHead
    className="cursor-pointer select-none"
    onClick={(e) => {
      e.stopPropagation();
      onSort(col);
    }}
  >
    {label} {currentSort === col && (sortOrder === 'asc' ? '▲' : '▼')}
  </TableHead>
);

const ActionButton = ({ icon, onClick, tooltip, variant = 'outline' }: any) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size="sm" onClick={onClick}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default UserManagement;
