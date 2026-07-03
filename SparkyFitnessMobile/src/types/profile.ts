export interface UserProfile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  bio: string | null;
  avatar_url: string | null;
  gender: 'male' | 'female' | null;
}
