// An LLM key as the labs model it: a token budget ledger and a Usage counter. Units are the lab's own (tokens),
// UNVERIFIED against the product's Usage tab (Requests, From cache, Saved).
export function createLedger(limitTokens) {
  if (!Number.isFinite(limitTokens) || limitTokens < 0) throw new RangeError('budget must be a non-negative number');
  let spent = 0;
  const check = (n) => {
    if (!Number.isFinite(n) || n < 0) throw new RangeError('amount must be a non-negative number');
  };
  return {
    limit: limitTokens,
    spent: () => spent,
    remaining: () => limitTokens - spent,
    canSpend(n) { check(n); return spent + n <= limitTokens; },
    // Refuses rather than overdrawing: returns false and changes nothing.
    spend(n) { check(n); if (spent + n > limitTokens) return false; spent += n; return true; },
    reset() { spent = 0; },
  };
}

export function createUsage() {
  let requests = 0, fromCache = 0, savedTokens = 0;
  return {
    record({ fromCache: hit = false, savedTokens: saved = 0 } = {}) {
      if (!Number.isFinite(saved) || saved < 0) throw new RangeError('savedTokens must be a non-negative number');
      requests += 1;
      if (hit) { fromCache += 1; savedTokens += saved; }
    },
    snapshot: () => ({ requests, fromCache, savedTokens }),
    reset() { requests = 0; fromCache = 0; savedTokens = 0; },
  };
}

export function createLlmKey({ id, budgetTokens }) {
  if (typeof id !== 'string' || !id) throw new TypeError('key id is required');
  return { id, ledger: createLedger(budgetTokens), usage: createUsage() };
}
