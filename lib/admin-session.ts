/* The signed-in admin for /admin pages, read from the session cookie. Pages
 * call this inside a <Suspense> boundary, since it reads the request. */
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authenticate, type Admin } from './admin';
import { SESSION_COOKIE } from './admin-http';
import { db } from './db';

/** The current admin, or a redirect to the login page. Reads the role as it is now, uncached. */
export async function pageAdmin(): Promise<Admin> {
  const admin = await authenticate(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!admin) redirect('/admin/login');
  return admin;
}

export const managesAdmins = (admin: Admin) => admin.role === 'supreme' || admin.role === 'right_hand';
