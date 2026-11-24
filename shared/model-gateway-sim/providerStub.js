// A mock LLM provider. Deterministic: same prompt and state give the same answer. No network, no randomness.
// Every failure carries origin: 'provider', so a gateway's own 429 (a rate limit) can be told apart from a provider's.
// The status codes and latencies are THIS LAB'S MODEL of a provider failing, UNVERIFIED against any real provider.
export const PROVIDER_STATES = ['healthy', 'down', 'overloaded', 'timeout', 'slow'];
export const MAX_PROMPT_CHARS = 20000;

const FAILURE = {
  down: { status: 503, error: 'provider_unavailable' },
  overloaded: { status: 429, error: 'provider_overloaded' },
  timeout: { status: 504, error: 'provider_timeout' },
};

const countWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function createProvider({ id, model, latencyMs = 400, timeoutMs = 30000, replyTokens = 120 }, clock) {
  if (!clock || typeof clock.now !== 'function' || typeof clock.advance !== 'function') throw new TypeError('a lab clock is required');
  if (typeof id !== 'string' || !id) throw new TypeError('provider id is required');
  if (typeof model !== 'string' || !model) throw new TypeError('model is required');
  let state = 'healthy';
  return {
    id,
    model,
    getState: () => state,
    setState(next) {
      if (!PROVIDER_STATES.includes(next)) throw new RangeError(`unknown provider state: ${String(next).slice(0, 40)}`);
      state = next;
    },
    // Advances the lab clock by the call's latency, so a caller's trace shows the time each attempt cost.
    call({ prompt } = {}) {
      if (typeof prompt !== 'string') throw new TypeError('prompt must be a string');
      if (prompt.length > MAX_PROMPT_CHARS) throw new RangeError(`prompt is over ${MAX_PROMPT_CHARS} characters`);
      const base = { provider: id, model, startedAt: clock.now() };
      // A slow call that would take as long as the timeout IS a timeout.
      const slowMs = latencyMs * 10;
      if (state === 'timeout' || (state === 'slow' && slowMs >= timeoutMs)) {
        clock.advance(timeoutMs);
        return { ...base, ok: false, origin: 'provider', ...FAILURE.timeout, latencyMs: timeoutMs, usage: { inputTokens: 0, outputTokens: 0 } };
      }
      if (state === 'down' || state === 'overloaded') {
        const ms = 20;
        clock.advance(ms);
        return { ...base, ok: false, origin: 'provider', ...FAILURE[state], latencyMs: ms, usage: { inputTokens: 0, outputTokens: 0 } };
      }
      const ms = state === 'slow' ? slowMs : latencyMs;
      clock.advance(ms);
      // The reply echoes at most 40 characters (by code point, so never half an emoji) as inert text (a lab string, never markup).
      return {
        ...base, ok: true, status: 200, latencyMs: ms,
        text: `[${model}] answer to: ${Array.from(prompt).slice(0, 40).join('')}`,
        usage: { inputTokens: countWords(prompt), outputTokens: replyTokens },
      };
    },
  };
}
