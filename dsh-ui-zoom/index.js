/**
 * Host half of the interface-zoom bundle.
 *
 * The zoom preference itself is a per-browser display choice and lives in the
 * page (localStorage), so this half does one thing only: embed the profile
 * default from `cordis.patch.yml` into the page before first paint, so a
 * profile configured with `zoom: 125` does not flash at 100%.
 *
 * It deliberately imports nothing: a profile-installed bundle resolves modules
 * from the profile's own node_modules, where the Host's `@deepseek-ai/*`
 * packages are not present.
 */

/** Smallest accepted zoom percentage. */
export const ZOOM_MIN = 50;
/** Largest accepted zoom percentage. */
export const ZOOM_MAX = 400;
/** Zoom percentage used when the profile does not set one. */
export const ZOOM_DEFAULT = 100;

/**
 * Clamp the profile default into the supported range.
 * @param value - raw `zoom` value from the row config.
 * @returns an integer percentage, or 100 when the value is unusable.
 */
function normalizeZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(numeric)));
}

/**
 * Serve the pre-paint zoom value for this profile.
 *
 * The script always runs: it prefers the per-browser localStorage choice and
 * falls back to this row's `zoom`, so a reload paints at the stored percentage
 * instead of flashing the profile default (or 100%) before the client loads.
 * @param ctx - Host plugin context.
 * @param config - this row's config object (`{ zoom }`).
 */
export function apply(ctx, config) {
  const zoom = normalizeZoom(config === undefined || config === null ? ZOOM_DEFAULT : config.zoom);
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'script',
      placement: 'body',
      text: `(() => {
  if (!document.body) return
  var percent = ${JSON.stringify(zoom)}
  try {
    var stored = window.localStorage.getItem('dsh-ui-zoom')
    if (stored !== null && stored !== '') {
      var parsed = Number(stored)
      if (isFinite(parsed)) percent = Math.min(${ZOOM_MAX}, Math.max(${ZOOM_MIN}, Math.round(parsed)))
    }
  } catch (error) {}
  if (percent === ${ZOOM_DEFAULT}) return
  var host = document.getElementById('root') || document.body
  if (!host) return
  document.body.style.removeProperty('zoom')
  host.style.zoom = String(percent / 100)
  document.documentElement.dataset.dshUiZoom = String(percent)
})()`,
    });
  }, { prepend: true });
}
