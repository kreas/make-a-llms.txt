import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { SignInForm } from './signin-form';

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  return <SignInForm />;
}
