import { redirect } from 'next/navigation';

/** The profile lives under /account/profile; this keeps the bottom tab stable. */
export default function ProfileTabPage() {
  redirect('/account/profile');
}
