import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { GenerationClient } from './generation-client';

export default async function GenerationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const genId = Number(id);
  const user = await requireUser();
  if (!Number.isInteger(genId) || genId <= 0) notFound();
  const [row] = await getDb().select().from(generations).where(eq(generations.id, genId));
  if (!row || row.userId !== user.id) notFound();
  return <GenerationClient initial={row} />;
}
