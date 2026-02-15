import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
interface MagicLinkRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRequest: (email: string) => Promise<void>;
  loading: boolean;
  initialEmail?: string; // Add optional initialEmail prop
}

export const MagicLinkRequestDialog: React.FC<MagicLinkRequestDialogProps> = ({
  isOpen,
  onClose,
  onRequest,
  loading,
  initialEmail, // Add initialEmail prop
}) => {
  const [email, setEmail] = useState(initialEmail || ''); // Use initialEmail for default value

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log(
      'MagicLinkRequestDialog: Sending magic link request for email:',
      email
    ); // Add logging
    await onRequest(email);
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail(initialEmail || ''); // Reset email when dialog opens
    }
  }, [isOpen, initialEmail]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md p-6">
        <CardHeader>
          <CardTitle>Request Magic Link</CardTitle>
          <CardDescription>
            Enter your email to receive a magic link for login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magic-link-email">Email</Label>
              <Input
                id="magic-link-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Sending...' : 'Send Magic Link'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
