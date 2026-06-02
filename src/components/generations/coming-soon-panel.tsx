import { Sparkles } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';

export function ComingSoonPanel({ title, blurb }: { title: string; blurb: string }) {
  return (
    <TabPanel flat>
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <Sparkles className="h-8 w-8 text-muted-soft" aria-hidden="true" />
        <h3 className="display-sm text-ink mt-4">{title}</h3>
        <p className="mt-2 max-w-md text-base text-muted-strong">{blurb}</p>
      </div>
    </TabPanel>
  );
}
