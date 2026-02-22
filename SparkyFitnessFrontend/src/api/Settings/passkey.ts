import { authClient } from '@/lib/auth-client';

export const getPasskeys = async () => {
  const { data, error } = await authClient.passkey.listUserPasskeys();
  if (error) throw error;
  return data || [];
};
export const addPasskey = async (name?: string) => {
  const { data, error } = await authClient.passkey.addPasskey({
    name: name || undefined,
  });
  if (error) throw error;
  return data;
};

export const deletePasskey = async (id: string) => {
  const { error } = await authClient.passkey.deletePasskey({ id });
  if (error) throw error;
};
