import ApiError from './ApiError.js';

// Per-IP fixed-window limiter, in process memory.
//
// WHY THIS IS HAND-ROLLED: no rate-limit dependency is installed, and the public
// comment endpoint is the first thing in this API that anonymous callers can write
// to, so it needs a bound before it ships. If the project ever takes on
// express-rate-limit, this file is the only thing to delete.
//
// WHAT THIS DOES NOT DO, and the limit is worth stating plainly: state is per Node
// process, so N instances allow N times the configured rate, and everything resets on
// deploy. It stops a bored person with one browser, not a botnet, and it is not a
// substitute for a shared store (Redis) or an edge/WAF limit. It is a floor, not a
// perimeter.
//
// The identity is the IP. A proxy in front of the app makes every request look like
// one address, which would let one noisy office lock out everyone behind it — so the
// key is the IP plus the User-Agent, which splits shared NAT by browser without
// pretending to identify a person. Behind a proxy that sets neither correctly this
// degrades to a single bucket; TRUST_PROXY has to be configured for the real client
// IP to be visible at all, and that is a deployment decision, not a code one.
const buckets = new Map();

// Interval and cap are per-limit rather than module constants so each route can pick
// its own budget: voting is a single cheap row, commenting writes text anyone can read.
export const rateLimit = ({ windowMs = 60_000, max = 10, key = 'default' } = {}) => {
  // One sweep per limiter rather than a timer per bucket. setInterval would keep the
  // event loop alive after the last request, so it is unref'd.
  const sweep = setInterval(() => {
    const cutoff = Date.now() + windowMs;
    for (const [bucketKey, entry] of buckets) {
      if (entry.resetAt <= cutoff) {
        buckets.delete(bucketKey);
      }
    }
  }, windowMs);
  sweep.unref?.();

  return (req, res, next) => {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const agent = req.get?.('user-agent') ?? 'no-agent';
    const bucketKey = `${key}:${ip}:${agent}`;

    const now = Date.now();
    const existing = buckets.get(bucketKey);

    // A window that has fully elapsed starts over, rather than counting up to a limit
    // that was set for a period which no longer applies.
    if (!existing || existing.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      res.setHeader?.('X-RateLimit-Remaining', String(max - 1));
      return next();
    }

    if (existing.count >= max) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader?.('Retry-After', String(retryAfter));
      throw new ApiError(
        429,
        `Too many requests. Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
      );
    }

    existing.count += 1;
    res.setHeader?.('X-RateLimit-Remaining', String(Math.max(0, max - existing.count)));
    return next();
  };
};

// Exposed for tests and for an operator who wants to confirm the map is not growing
// without bound in a long-running process.
export const rateLimitState = {
  size: () => buckets.size,
  reset: () => buckets.clear(),
};
