import { ShareListingNotFound } from '@/components/share/ShareListingStatus';

export default function ShortsListingNotFound() {
  return (
    <ShareListingNotFound
      title="Inzerát nenalezen"
      message="Shorts inzerát s tímto odkazem neexistuje nebo není veřejný."
    />
  );
}
