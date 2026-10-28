/*
 * 한 도구에 계정 여러 개 (개인 + 회사 구글, 노션 워크스페이스 두 곳) — 화면이 쓰는 묶음 계산. React 없이 테스트한다.
 */

// The tool's accounts in the order they were connected, each with what it watches.
// A subscription whose connection_id is empty or unknown goes under the first account.
export function toolAccounts(state, provider) {
  const groups = (state?.connections || []).filter((c) => c.provider === provider).map((conn) => ({ conn, subs: [] }));
  if (!groups.length) return groups;
  const byId = new Map(groups.map((g) => [g.conn.id, g]));
  for (const s of state?.subscriptions || []) if (s.provider === provider) (byId.get(s.connection_id) || groups[0]).subs.push(s);
  return groups;
}

export const connectionIds = (state, provider) => (state?.connections || []).filter((c) => c.provider === provider).map((c) => c.id);

// waiting: { [provider]: { at, known: [connection ids before the click] } }. A provider stops waiting once a NEW
// connection id shows up (re-reading an old one is not the account just added) or after `limit` ms.
export function stillWaiting(waiting, state, now, limit) {
  return Object.fromEntries(Object.entries(waiting || {}).filter(([p, w]) =>
    now - w.at < limit && !connectionIds(state, p).some((id) => !(w.known || []).includes(id))));
}
