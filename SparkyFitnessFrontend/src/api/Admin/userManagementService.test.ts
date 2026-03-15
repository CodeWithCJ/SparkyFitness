import { userManagementService } from './userManagementService';
import { api } from '@/api/api';

jest.mock('@/api/api', () => ({
  api: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    post: jest.fn(),
  },
}));

describe('userManagementService', () => {
  it('updateUserFullName should send correct payload', async () => {
    const userId = '123';
    const newFullName = 'John Doe';

    await userManagementService.updateUserFullName(userId, newFullName);

    expect(api.put).toHaveBeenCalledWith(`/admin/users/${userId}/full-name`, {
      body: { fullName: newFullName },
    });
  });
});
