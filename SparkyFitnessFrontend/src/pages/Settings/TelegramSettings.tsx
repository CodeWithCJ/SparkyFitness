import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  MessageSquare,
  Link as LinkIcon,
  Unlink,
  Copy,
  Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  useTelegramStatus,
  useGenerateTelegramCode,
  useUnlinkTelegram,
} from '@/hooks/Integrations/useTelegram';

const TelegramSettings = () => {
  const { toast } = useToast();
  const { data: status, isLoading } = useTelegramStatus();
  const { mutateAsync: generateCode, isPending: isGenerating } =
    useGenerateTelegramCode();
  const { mutateAsync: unlinkAccount, isPending: isUnlinking } =
    useUnlinkTelegram();

  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerateLinkCode = async () => {
    try {
      const data = await generateCode();
      setLinkCode(data.code);
    } catch (error) {
      console.error('Error generating code:', error);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!confirm('Are you sure you want to unlink your Telegram account?'))
      return;
    try {
      await unlinkAccount();
      setLinkCode(null);
    } catch (error) {
      console.error('Error unlinking:', error);
    }
  };

  const copyToClipboard = () => {
    if (linkCode) {
      navigator.clipboard.writeText(`/start ${linkCode}`);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Command copied to clipboard.',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const loading = isLoading || isGenerating || isUnlinking;

  return (
    <Card className="overflow-hidden border-none shadow-md bg-gradient-to-br from-background to-secondary/20">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#0088cc]/10 rounded-2xl">
              <MessageSquare className="h-6 w-6 text-[#0088cc]" />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight">Telegram Bot</h3>
              <p className="text-sm text-muted-foreground">
                Log meals & chat with AI anywhere
              </p>
            </div>
          </div>
          <Badge
            variant={status?.isLinked ? 'default' : 'secondary'}
            className={
              status?.isLinked ? 'bg-green-500 hover:bg-green-600' : ''
            }
          >
            {status?.isLinked ? 'Connected' : 'Not Linked'}
          </Badge>
        </div>

        <div className="grid gap-6">
          {status?.isLinked ? (
            <div className="space-y-4 animate-in fade-in duration-500">
              <div className="p-4 bg-secondary/30 rounded-xl border border-secondary/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Telegram ID</span>
                  <span className="text-xs font-mono bg-background/50 px-2 py-1 rounded">
                    {status.chatId}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your account is linked! You can now send photos and messages
                  to our bot.
                </p>
              </div>

              <Button
                variant="destructive"
                onClick={handleUnlinkTelegram}
                className="w-full"
                disabled={loading}
              >
                <Unlink className="h-4 w-4 mr-2" />
                Unlink Telegram Account
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {!linkCode ? (
                <div className="text-center space-y-4 py-4">
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                    <LinkIcon className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-lg">Connect to Telegram</p>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Link your account to start logging meals, exercises, and
                      chatting with AI directly from Telegram.
                    </p>
                  </div>
                  <Button
                    onClick={handleGenerateLinkCode}
                    className="w-full sm:w-auto px-8"
                    disabled={loading}
                  >
                    Generate Linking Code
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 p-4 bg-background/60 rounded-xl border border-primary/20 animate-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Step 1: Open Bot
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Search for your bot on Telegram or open it via the link.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Step 2: Send Command
                    </Label>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-secondary p-3 rounded-lg font-mono text-sm break-all">
                        /start {linkCode}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={copyToClipboard}
                        className="shrink-0 h-[46px] w-[46px]"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2 text-xs text-[#0088cc] italic">
                    <Sparkles className="h-3 w-3" />
                    Waiting for your activation...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const Sparkles = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

export default TelegramSettings;
