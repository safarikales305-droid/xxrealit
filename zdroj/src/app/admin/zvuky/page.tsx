import { redirect } from 'next/navigation';

/** Zvuky pro příspěvky i Shorts — jedna společná knihovna v administraci Hudba. */
export default function AdminZvukyRedirectPage() {
  redirect('/admin/hudba');
}
