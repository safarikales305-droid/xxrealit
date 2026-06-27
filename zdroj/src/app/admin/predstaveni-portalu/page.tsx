import { redirect } from 'next/navigation';

/** Zpětná kompatibilita — stará URL administrace prezentace. */
export default function AdminPredstaveniPortaluRedirect() {
  redirect('/admin/o-portalu');
}
