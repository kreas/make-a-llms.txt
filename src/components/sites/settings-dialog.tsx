'use client';

import { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TOKEN_PLACEHOLDER = '<YOUR_WEBHOOK_TOKEN>';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  siteName: string;
  tokenPrefix: string;
  freshToken: string | null;
  onRotate: () => void;
  isRotating: boolean;
};

export function SettingsDialog({
  open,
  onOpenChange,
  siteId,
  siteName,
  tokenPrefix,
  freshToken,
  onRotate,
  isRotating,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${baseUrl}/api/webhooks/sites/${siteId}/regenerate`;
  const tokenForSnippet = freshToken ?? TOKEN_PLACEHOLDER;

  const curlSnippet = `curl -X POST \\
  -H "Authorization: Bearer ${tokenForSnippet}" \\
  ${webhookUrl}`;

  const nodeSnippet = `await fetch('${webhookUrl}', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.LLMSTXT_WEBHOOK_TOKEN}\`,
  },
});`;

  async function copy(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Webhook configuration for <span className="text-ink">{siteName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex min-w-0 flex-col gap-2">
            <label className="caption-uppercase text-muted-strong">Webhook URL</label>
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-hairline bg-canvas-soft p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">
                {webhookUrl}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy('url', webhookUrl)}
                aria-label="Copy webhook URL"
              >
                {copiedKey === 'url' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-2">
            <label className="caption-uppercase text-muted-strong">Bearer Token</label>
            {freshToken ? (
              <>
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-semantic-success bg-canvas-soft p-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">
                    {freshToken}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copy('token', freshToken)}
                    aria-label="Copy bearer token"
                  >
                    {copiedKey === 'token' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-strong">
                  Copy this token now — you won&apos;t see it again.
                </p>
              </>
            ) : (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-hairline bg-canvas-soft p-3">
                <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">
                  {tokenPrefix}••••••••••••••••••••••••
                </code>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onRotate}
              disabled={isRotating}
              className="self-start"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', isRotating && 'animate-spin')} />
              {isRotating ? 'Rotating…' : 'Rotate Token'}
            </Button>
          </section>

          <section className="flex min-w-0 flex-col gap-2">
            <label className="caption-uppercase text-muted-strong">Code Snippets</label>
            <Tabs defaultValue="curl" className="min-w-0">
              <TabsList className="w-full">
                <TabsTrigger value="curl" className="flex-1">
                  curl
                </TabsTrigger>
                <TabsTrigger value="node" className="flex-1">
                  Node.js
                </TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="min-w-0">
                <SnippetBlock
                  code={curlSnippet}
                  copied={copiedKey === 'curl'}
                  onCopy={() => copy('curl', curlSnippet)}
                />
              </TabsContent>
              <TabsContent value="node" className="min-w-0">
                <SnippetBlock
                  code={nodeSnippet}
                  copied={copiedKey === 'node'}
                  onCopy={() => copy('node', nodeSnippet)}
                />
              </TabsContent>
            </Tabs>
            {!freshToken && (
              <p className="text-sm text-muted-strong">
                Replace <code className="font-mono">{TOKEN_PLACEHOLDER}</code> with your actual
                token. Use <span className="text-ink">Rotate Token</span> above to issue a new one.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SnippetBlock({
  code,
  copied,
  onCopy,
}: {
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="relative min-w-0">
      <pre className="w-full overflow-x-auto rounded-md border border-hairline bg-canvas-soft p-4 pr-12 font-mono text-[13px] text-ink">
        {code}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onCopy}
        className="absolute right-2 top-2"
        aria-label="Copy snippet"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
