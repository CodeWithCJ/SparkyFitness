import { authClient } from '@/lib/auth-client';

export interface PasskeyRecord {
  id: string;
  name: string | null;
  createdAt: string | Date;
}

export const getPasskeys = async (): Promise<PasskeyRecord[]> => {
  const { data, error } = await authClient.passkey.listUserPasskeys();
  if (error) throw error;
  return (data || []) as PasskeyRecord[];
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
