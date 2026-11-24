// A lab clock: virtual time in milliseconds, advanced only by the lab. Tests and scenarios never wait on real time.
export function createClock(start = 0) {
  if (!Number.isFinite(start) || start < 0) throw new RangeError('clock start must be a non-negative number');
  let t = start;
  return {
    now: () => t,
    advance(ms) {
      if (!Number.isFinite(ms) || ms < 0) throw new RangeError('advance needs a non-negative number of ms');
      t += ms;
      return t;
    },
    set(ms) {
      if (!Number.isFinite(ms) || ms < 0) throw new RangeError('set needs a non-negative number of ms');
      t = ms;
      return t;
    },
  };
}
