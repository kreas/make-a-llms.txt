'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function WebhookBlock({
  siteId,
  tokenPrefix,
  freshToken,
  onRotate,
}: {
  siteId: number;
  tokenPrefix: string;
  freshToken?: string;
  onRotate: () => void;
}) {
  const url = `/api/webhooks/sites/${siteId}/regenerate`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-card p-4">
      <div className="text-sm">
        <div className="caption-uppercase text-muted-strong">Webhook URL</div>
        <code className="font-mono text-ink">{url}</code>
      </div>
      <div className="text-sm">
        <div className="caption-uppercase text-muted-strong">Bearer token</div>
        {freshToken ? (
          <Input readOnly value={freshToken} aria-label="fresh webhook token" />
        ) : (
          <span className="font-mono text-ink">{tokenPrefix}••••••••••••••••••••••••</span>
        )}
      </div>
      <Button onClick={onRotate} variant="outline" className="self-start">
        Rotate token
      </Button>
    </div>
  );
}
