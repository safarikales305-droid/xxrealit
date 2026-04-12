import { ShortsEditor } from './ShortsEditor';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ShortsEditorPage({ params }: PageProps) {
  const { id } = await params;
  return <ShortsEditor listingId={id} />;
}
