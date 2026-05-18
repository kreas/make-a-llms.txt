import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ZodError } from 'zod';
import { getDb } from '@/db';
import { generations, sites } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { parseGenerationUid } from '@/lib/uid';
import { GenerationClient } from './generation-client';

export default async function GenerationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  let genUid: string;
  try {
    genUid = parseGenerationUid(id);
  } catch (e) {
    if (e instanceof ZodError) notFound();
    throw e;
  }

  const [row] = await getDb().select().from(generations).where(eq(generations.uid, genUid));
  if (!row || row.userId !== user.id) notFound();

  const [site] = await getDb().select({ uid: sites.uid }).from(sites).where(eq(sites.id, row.siteId));
  if (!site) notFound();

  return <GenerationClient initial={row} siteUid={site.uid} />;
}
