import { requireUser } from '@/lib/auth-guards';
import { AppShell } from '@/components/layout/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell userEmail={user.email}>{children}</AppShell>;
}
