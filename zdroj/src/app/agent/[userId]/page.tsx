import { redirect } from 'next/navigation';

export default async function AgentProfileRedirectPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  redirect(`/profile/${encodeURIComponent(userId)}`);
}
