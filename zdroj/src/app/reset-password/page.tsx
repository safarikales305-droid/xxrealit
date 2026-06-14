import { redirect } from 'next/navigation';

type Props = {
  searchParams: Promise<{ token?: string }>;
};

/** Anglická URL alias — přesměruje na českou stránku obnovy hesla. */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token?.trim();
  if (token) {
    redirect(`/reset-hesla?token=${encodeURIComponent(token)}`);
  }
  redirect('/reset-hesla');
}
