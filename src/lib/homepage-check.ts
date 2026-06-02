'use step';

/**
 * Checks whether a site's homepage is reachable. Returns true on any 2xx
 * response (redirects are followed by fetch). Network failures resolve to
 * false rather than throwing so callers can report a clean "unreachable".
 */
export async function checkHomepage(rootUrl: string): Promise<boolean> {
  console.log(`[homepage-check] start root=${rootUrl}`);
  try {
    const res = await fetch(rootUrl, { redirect: 'follow' });
    if (res.ok) {
      console.log(`[homepage-check] reachable ${rootUrl} (${res.status})`);
      return true;
    }
    console.warn(`[homepage-check] not ok ${rootUrl} (${res.status})`);
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[homepage-check] unreachable ${rootUrl}: ${msg}`);
    return false;
  }
}
