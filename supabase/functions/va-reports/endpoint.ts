/** Accept an API root or legacy host without duplicating /api/v1. */
export function noveApiBase(endpoint: string): string {
  const url = new URL(endpoint.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Indirizzo del server Nove non valido');
  }
  const root = url.pathname.replace(/\/+$/, '').replace(/\/api(?:\/v1)?$/, '');
  return `${url.origin}${root}/api/v1`;
}