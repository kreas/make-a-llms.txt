import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { SignUpForm } from './signup-form';

export default async function SignUpPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  return <SignUpForm />;
}
