'use client';

import { useState } from 'react';
import { Copy, Check, RefreshCw, Sparkles, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const TOKEN_PLACEHOLDER = '<YOUR_WEBHOOK_TOKEN>';

export type SettingsDialogDetails = {
  name: string;
  displayName: string | null;
  description: string | null;
  faviconUrl: string | null;
};

export type DetailsUpdate = {
  name?: string;
  displayName?: string | null;
  description?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  siteName: string;
  tokenPrefix: string;
  freshToken: string | null;
  onRotate: () => void;
  isRotating: boolean;
  details: SettingsDialogDetails;
  onSaveDetails: (update: DetailsUpdate) => void;
  isSavingDetails: boolean;
  onRecaptureDetails: () => void;
  isRecapturing: boolean;
  detailsError: string | null;
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
  details,
  onSaveDetails,
  isSavingDetails,
  onRecaptureDetails,
  isRecapturing,
  detailsError,
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
            Site configuration for <span className="text-ink">{siteName}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="min-w-0">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">
              Details
            </TabsTrigger>
            <TabsTrigger value="webhook" className="flex-1">
              Webhook
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="min-w-0">
            <DetailsTab
              key={`${details.name}:${details.displayName ?? ''}:${details.description ?? ''}`}
              details={details}
              onSave={onSaveDetails}
              isSaving={isSavingDetails}
              onRecapture={onRecaptureDetails}
              isRecapturing={isRecapturing}
              error={detailsError}
            />
          </TabsContent>

          <TabsContent value="webhook" className="min-w-0">
            <div className="flex min-w-0 flex-col gap-6 pt-2">
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
                    title={copiedKey === 'url' ? 'Copied' : 'Copy webhook URL'}
                  >
                    {copiedKey === 'url' ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="sr-only">
                      {copiedKey === 'url' ? 'Copied' : 'Copy webhook URL'}
                    </span>
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
                        title={copiedKey === 'token' ? 'Copied' : 'Copy bearer token'}
                      >
                        {copiedKey === 'token' ? (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span className="sr-only">
                          {copiedKey === 'token' ? 'Copied' : 'Copy bearer token'}
                        </span>
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
                  title="Issue a new webhook bearer token"
                >
                  <RefreshCw
                    className={cn('mr-2 h-4 w-4', isRotating && 'animate-spin')}
                    aria-hidden="true"
                  />
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
                    token. Use <span className="text-ink">Rotate Token</span> above to issue a new
                    one.
                  </p>
                )}
              </section>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DetailsTab({
  details,
  onSave,
  isSaving,
  onRecapture,
  isRecapturing,
  error,
}: {
  details: SettingsDialogDetails;
  onSave: (update: DetailsUpdate) => void;
  isSaving: boolean;
  onRecapture: () => void;
  isRecapturing: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(details.name);
  const [displayName, setDisplayName] = useState(details.displayName ?? '');
  const [description, setDescription] = useState(details.description ?? '');

  const dirty =
    name.trim() !== details.name ||
    (displayName.trim() || null) !== details.displayName ||
    (description.trim() || null) !== details.description;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    const update: DetailsUpdate = {};
    if (name.trim() !== details.name) update.name = name.trim();
    const dn = displayName.trim() || null;
    if (dn !== details.displayName) update.displayName = dn;
    const desc = description.trim() || null;
    if (desc !== details.description) update.description = desc;
    onSave(update);
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-6 pt-2">
      <section className="flex items-center gap-4">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-hairline bg-canvas-soft">
          {details.faviconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={details.faviconUrl}
              alt=""
              className="h-12 w-12 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="caption-uppercase text-muted-soft">no icon</span>
          )}
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <label htmlFor="settings-name" className="caption-uppercase text-muted-strong">
          Internal name
        </label>
        <Input
          id="settings-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
        <p className="text-xs text-muted-soft">
          How this project is labeled in your dashboard.
        </p>
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <label htmlFor="settings-display-name" className="caption-uppercase text-muted-strong">
          Brand name
        </label>
        <Input
          id="settings-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={80}
          placeholder="e.g. Hopdoddy"
        />
        <p className="text-xs text-muted-soft">
          The canonical brand name. Used to detect entity mentions during citation audits.
        </p>
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <label htmlFor="settings-description" className="caption-uppercase text-muted-strong">
          Description
        </label>
        <Textarea
          id="settings-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="One or two sentences describing the business."
        />
        <p className="text-xs text-muted-soft">{description.length} / 500</p>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRecapture}
          disabled={isRecapturing}
          title={isRecapturing ? 'Recapturing from site' : 'Recapture from site'}
        >
          <Sparkles
            className={cn('h-4 w-4', isRecapturing && 'animate-pulse')}
            aria-hidden="true"
          />
          <span className="sr-only">
            {isRecapturing ? 'Recapturing from site' : 'Recapture from site'}
          </span>
        </Button>
        <Button
          type="submit"
          size="icon"
          disabled={!dirty || isSaving}
          title={isSaving ? 'Saving changes' : 'Save changes'}
        >
          <Save className={cn('h-4 w-4', isSaving && 'animate-pulse')} aria-hidden="true" />
          <span className="sr-only">{isSaving ? 'Saving changes' : 'Save changes'}</span>
        </Button>
      </div>
    </form>
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
        title={copied ? 'Copied' : 'Copy snippet'}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="sr-only">{copied ? 'Copied' : 'Copy snippet'}</span>
      </Button>
    </div>
  );
}
