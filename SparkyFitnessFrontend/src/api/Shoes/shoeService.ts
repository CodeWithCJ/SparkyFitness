import { api } from '@/api/api';
import type {
  AssignShoeResponse,
  CreateShoeBody,
  ShoeListResponse,
  ShoeResponse,
  ShoeStatus,
  UpdateShoeBody,
} from '@workspace/shared';

export const fetchShoes = async (
  status?: ShoeStatus
): Promise<ShoeListResponse> => {
  return api.get('/v2/shoes', { params: status ? { status } : undefined });
};

export const createShoe = async (
  data: CreateShoeBody
): Promise<ShoeResponse> => {
  return api.post('/v2/shoes', { body: data });
};

export const updateShoe = async (
  id: string,
  data: UpdateShoeBody
): Promise<ShoeResponse> => {
  return api.put(`/v2/shoes/${id}`, { body: data });
};

export const deleteShoe = async (id: string): Promise<{ success: boolean }> => {
  return api.delete(`/v2/shoes/${id}`);
};

export const assignShoeToEntry = async (
  exerciseEntryId: string,
  shoeId: string | null
): Promise<AssignShoeResponse> => {
  return api.put(`/v2/shoes/assignments/${exerciseEntryId}`, {
    body: { shoe_id: shoeId },
  });
};
