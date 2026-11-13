// Server side of the shelf link (owner rule 2026-11-08): where this lab's shelf card lives. The order of
// preference: SHELF_URL env (the family standard) → the shelf registry's own URL → hidden. Family shared
// service (owner, 2026-11-13): vendor it, never edit a lab's copy.
export function shelfInfo(env = process.env, { demoId = env.SHELF_DEMO_ID, port = env.PORT } = {}) {
  const shelfUrl = env.SHELF_URL || (env.SHELF_REGISTRY_URL ? null : null);
  if (shelfUrl) return { shelfUrl };
  // Default: the family lab-proxy shelf root (works for every lab served through the proxy).
  if (env.SHELF_PROXY !== '0') return { shelfUrl: 'https://local.ping-devops.com:8443/' };
  return { shelfUrl: null };
}
