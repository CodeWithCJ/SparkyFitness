export const garminKeys = {
  status: ['garminStatus'] as const,
};

export const huaweiHealthKeys = {
  all: ['huaweiHealth'] as const,
  status: () => [...huaweiHealthKeys.all, 'status'] as const,
};
