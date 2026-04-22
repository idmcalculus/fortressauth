import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: [
    '/',
    '/(en|es|fr|de|zh|ja|pt|ru|ar|hi|yo)/:path*',
    '/((?!api|auth|react-demo|vue-demo|svelte-demo|angular-demo|verify-email|reset-password|_next|.*\\..*).*)',
  ],
};
