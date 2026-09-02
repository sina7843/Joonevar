import { redirect } from 'next/navigation';

/** The mating area currently opens on the official permits list (§16). */
export default function MatingPage(): never {
  redirect('/mating/permits');
}
