/**
 * Keep-alive ping for the Render free web service.
 *
 * The free plan sleeps a service after 15 minutes without traffic, and the
 * next visitor then pays a 30-50 s cold start. A cron job running this file
 * every 10 minutes keeps the idle timer below that window.
 *
 * /robots.txt is a static file — no database, no rendering — so the ping
 * costs Render almost nothing while still counting as traffic.
 *
 * Exit code 0 = site answered, non-zero = failed (Render marks the run).
 */
const target = process.env.KEEPALIVE_URL || "https://imalissa.onrender.com/robots.txt";

const t0 = Date.now();
try {
  const res = await fetch(target, {
    headers: { "user-agent": "imalissa-keepalive" },
    signal: AbortSignal.timeout(30_000),
  });
  console.log(`${res.status} ${target} in ${Date.now() - t0} ms`);
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  const message = err?.message || err;
  console.error(`keep-alive failed: ${message}`);
  // Distinguish timeout vs network errors
  if (message?.includes('timeout') || message?.includes('ETIMEDOUT')) {
    console.error('Error type: TIMEOUT - external service unreachable');
  } else if (message?.includes('fetch failed') || message?.includes('ECONNREFUSED')) {
    console.error('Error type: NETWORK - connection refused');
  }
  process.exit(1);
}
