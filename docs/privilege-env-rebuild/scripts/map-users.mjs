// Match source (old tenant) users to destination users the replay library cannot match by UserName.
// buildMaps() compares Spec.UserName only; after the move to a console-made environment the usernames differ
// (e.g. jordan.ellis -> cmuir+jordan@pingone.com). Returns dstUsers plus one alias copy per extra match, carrying the
// SOURCE UserName, so buildMaps() finds it. Matching order: same EmailID (case-insensitive), then ALIASES (judgment calls
// the owner confirmed on 2026-11-24 for the PrivilegeAdmins members).
const ALIASES = { demoadmin: 'demoAdmin@pingone.com', antonik_adham: 'cmuir+antonik_adham@pingone.com' };
export function withEmailAliases(srcUsers, dstUsers) {
  const lc = (s) => String(s || '').toLowerCase();
  const names = new Set(dstUsers.map((u) => lc(u.Spec.UserName)));
  const byMail = new Map(dstUsers.filter((u) => u.Spec.EmailID).map((u) => [lc(u.Spec.EmailID), u]));
  const byName = new Map(dstUsers.map((u) => [lc(u.Spec.UserName), u]));
  const extra = [];
  for (const s of srcUsers) {
    if (names.has(lc(s.Spec.UserName))) continue;
    const t = byMail.get(lc(s.Spec.EmailID)) || byName.get(lc(ALIASES[lc(s.Spec.UserName)]));
    if (t) extra.push({ ...t, Spec: { ...t.Spec, UserName: s.Spec.UserName } });
  }
  return [...dstUsers, ...extra];
}
