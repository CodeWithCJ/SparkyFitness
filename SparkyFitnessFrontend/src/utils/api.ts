const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId'); // Get the currently logged-in user's ID
  const activeUserId = localStorage.getItem('activeUserId'); // Get the active user's ID (could be the same as userId or a family member's)

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If an activeUserId is set and it's different from the logged-in userId,
  // add the X-On-Behalf-Of-User-Id header
  if (activeUserId && userId && activeUserId !== userId) {
    headers['X-On-Behalf-Of-User-Id'] = activeUserId;
  }

  return headers;
};

export const get = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const post = async <T>(url: string, body: any): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const put = async <T>(url: string, body: any): Promise<T> => {
  const response = await fetch(url, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export const del = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json() as Promise<T>;
};
