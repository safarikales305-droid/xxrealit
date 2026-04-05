import { redirect } from 'next/navigation';

/** Stará URL — přesměrování na nový formulář. */
export default function CreatePropertyRedirectPage() {
  redirect('/inzerat/pridat');
}
