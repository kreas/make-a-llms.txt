'use client';
import { useState } from 'react';
import type { Generation } from '@/db/schema';
import { Menubar, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { LlmsContentPanel } from './llms-content-panel';
import { CrawlerAuditTab } from '../crawlers/crawler-audit-tab';

export function SetupPanel({ generation, siteId }: { generation: Generation | null; siteId: string }) {
  const [tab, setTab] = useState<'llms' | 'crawlers'>('llms');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center bg-[#f3efdb] p-1 rounded-lg border border-hairline w-full">
        <Menubar className="border-0 bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger isActive={tab === 'llms'} onClick={() => setTab('llms')}>llms.txt</MenubarTrigger>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger isActive={tab === 'crawlers'} onClick={() => setTab('crawlers')}>AI Crawlers</MenubarTrigger>
          </MenubarMenu>
        </Menubar>
      </div>
      {tab === 'llms' ? <LlmsContentPanel generation={generation} siteId={siteId} /> : <CrawlerAuditTab siteId={siteId} />}
    </div>
  );
}
