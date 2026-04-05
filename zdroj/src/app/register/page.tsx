import { redirect } from 'next/navigation';

/** Zpětná kompatibilita — registrace přes Prisma je na `/registrace`. */
export default function RegisterRedirectPage() {
  redirect('/registrace');
}
