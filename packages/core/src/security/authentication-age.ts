/** Resource servers can use this helper to enforce a sensitive-operation freshness policy. */
export function isAuthenticationFresh(
  authenticationTime: Date | null | undefined,
  maxAgeSeconds: number,
  now = new Date(),
): boolean {
  if (!authenticationTime || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 1) return false;
  const ageMs = now.getTime() - authenticationTime.getTime();
  return ageMs >= 0 && ageMs <= maxAgeSeconds * 1000;
}
