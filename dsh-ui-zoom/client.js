/**
 * Browser half of the interface-zoom bundle.
 *
 * Adds an "界面缩放 / Interface zoom" row to Settings → General, right after the
 * font-size row, and applies the chosen percentage to the application root
 * (`#root`) with the CSS `zoom` property. Menus and dialogs are portaled to
 * `<body>`, outside that root, so `installOverlayZoom` scales web menus
 * separately and re-anchors them; dialogs intentionally stay at 100%.
 *
 * The choice is a per-browser display preference: it is stored in
 * localStorage, so it survives restarts and is not shared between browsers
 * (the same scope a browser's own page zoom has).
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ui-zoom',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Settings row id. */
    const ROW_ID = 'ui-zoom';
    /** localStorage key holding the chosen percentage. */
    const STORAGE_KEY = 'dsh-ui-zoom';
    /** Zoom percentages offered by the control, in ascending order. */
    const LEVELS = [50, 60, 70, 80, 90, 100, 110, 125, 150, 200, 400];
    /** Zoom used when neither the profile nor the user picked one. */
    const DEFAULT_ZOOM = 100;
    /** Smallest accepted percentage. */
    const MIN_ZOOM = LEVELS[0];
    /** Largest accepted percentage. */
    const MAX_ZOOM = LEVELS[LEVELS.length - 1];
    /** Client locale namespace owning this row's copy. */
    const LOCALE_NS = 'settings.ui-zoom';
    /** Wheel travel that advances one zoom level. */
    const WHEEL_STEP_PX = 40;
    /** Minimum gap between two wheel-driven steps. */
    const WHEEL_COOLDOWN_MS = 90;

    /** Chinese copy for the settings row. */
    const zh = {
      'zoom.title': '界面缩放',
      'zoom.description': '缩放主界面与网页菜单；原生菜单栏、弹窗保持原尺寸。快捷键 Ctrl +/−、Ctrl + 滚轮、Ctrl+0 重置',
      'zoom.menu': '选择缩放比例',
      'zoom.increase': '放大界面',
      'zoom.decrease': '缩小界面',
      'zoom.reset': '重置',
      'zoom.resetHint': '重置为 100%',
    };

    /** English copy, complete against the Chinese key set. */
    const en = {
      'zoom.title': 'Interface zoom',
      'zoom.description': 'Scales the main interface and web menus; native menus and dialogs keep their size. Shortcuts: Ctrl +/−, Ctrl + wheel, Ctrl+0 to reset',
      'zoom.menu': 'Choose a zoom level',
      'zoom.increase': 'Zoom in',
      'zoom.decrease': 'Zoom out',
      'zoom.reset': 'Reset',
      'zoom.resetHint': 'Reset to 100%',
    };

    /** Row, control and menu styles; every color is a host theme token. */
    const CSS = `
.dshz-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.dshz-row:last-child{border-bottom:0}
.dshz-text{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:24px}
.dshz-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.dshz-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.dshz-control{display:inline-flex;align-items:center;gap:8px}
.dshz-step{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:16px;line-height:1;cursor:pointer}
.dshz-step:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshz-step:disabled{color:var(--dsw-alias-label-caption);cursor:default}
.dshz-picker{position:relative;display:inline-flex}
.dshz-stepper{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:88px;height:32px;padding:0 10px;border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.dshz-stepper:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshz-stepper[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.dshz-value{font-size:14px;line-height:22px;font-variant-numeric:tabular-nums}
.dshz-caret{display:inline-flex;color:var(--dsw-alias-label-tertiary)}
.dshz-reset{padding:0 4px;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dshz-reset:hover{color:var(--dsw-alias-label-primary)}
.dshz-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:40;display:flex;flex-direction:column;gap:2px;min-width:136px;max-height:288px;overflow:auto;padding:4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-panel)}
.dshz-menu-up{top:auto;bottom:calc(100% + 6px)}
.dshz-option{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:6px 10px;border:0;border-radius:var(--dsw-radius-xs);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}
.dshz-option:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshz-option[aria-selected="true"]{color:var(--dsw-alias-state-business-primary);font-weight:500}
.dshz-check{display:inline-flex;font-size:12px;line-height:20px}
`;

    /**
     * Inject this plugin's stylesheet; removal follows the plugin's own effect.
     * @param ctx - client plugin context.
     */
    function installStyles(ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = '@local/dsh-ui-zoom';
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => {
          tag.remove();
        };
      }, 'ui-zoom: styles');
    }

    /**
     * Clamp a candidate percentage into the supported range.
     * @param value - any stored or requested value.
     * @returns an integer percentage between 50 and 400.
     */
    function normalizeZoom(value) {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) return DEFAULT_ZOOM;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(numeric)));
    }

    /**
     * Read the zoom the Host boot script wrote before the client loaded, so the
     * profile default in `cordis.patch.yml` survives the first render.
     * @returns the boot percentage, or 100 when the script did not run.
     */
    function bootZoom() {
      if (typeof document === 'undefined') return DEFAULT_ZOOM;
      const raw = document.documentElement?.dataset.dshUiZoom;
      return raw === undefined ? DEFAULT_ZOOM : normalizeZoom(raw);
    }

    /**
     * Read the stored percentage.
     * @returns the stored value, or `undefined` when this browser has none.
     */
    function storedZoom() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null || raw === '') return undefined;
        const numeric = Number(raw);
        // A corrupted value must not override the boot/profile default.
        if (!Number.isFinite(numeric)) return undefined;
        return normalizeZoom(numeric);
      } catch {
        return undefined;
      }
    }

    /**
     * Persist the percentage; storage failures leave the session usable.
     * @param percent - normalized percentage, or `undefined` to clear the key.
     */
    function persistZoom(percent) {
      try {
        if (percent === undefined) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, String(percent));
      } catch {
        /* a browser with storage disabled keeps the in-memory value only */
      }
    }

    /**
     * Apply a percentage to the application root.
     *
     * Zooming `#root` instead of `<body>` is deliberate: menus and dialogs are
     * portaled to `document.body` and positioned with JS-computed viewport
     * coordinates. A body zoom scales those coordinates a second time, which
     * pushes bottom-anchored menus off-screen (the account menu at 125%). The
     * root host keeps overlays at 100% with their coordinates intact.
     * @param percent - normalized percentage; 100 restores the untouched root.
     */
    function applyDocumentZoom(percent) {
      if (typeof document === 'undefined') return;
      const host = document.getElementById('root');
      // The boot stylesheet already targets #root and survives until the app
      // mounts; removing it before the host exists would drop the first paint.
      if (host === null) return;
      document.querySelector?.('style[data-dsh-ui-zoom-boot]')?.remove();
      // Clear a legacy body zoom left by an earlier build or boot script.
      document.body?.style.removeProperty('zoom');
      if (percent === DEFAULT_ZOOM) {
        host.style.removeProperty('zoom');
        delete document.documentElement.dataset.dshUiZoom;
        return;
      }
      host.style.setProperty('zoom', String(percent / 100));
      document.documentElement.dataset.dshUiZoom = String(percent);
    }

    /**
     * Zoom state shared by the settings row and the document.
     * @param ctx - client plugin context owning the effects.
     * @returns the runtime read by the row component.
     */
    function createZoomRuntime(ctx) {
      const stored = storedZoom();
      let zoom = stored === undefined ? bootZoom() : stored;
      // The boot script applies the profile default before first paint, but the
      // per-browser choice wins over it. Mirror the resolved value into the
      // document now, otherwise a reload shows 100% (or the profile default)
      // while the row already reports the stored percentage.
      applyDocumentZoom(zoom);
      const listeners = new Set();

      const emit = () => {
        for (const listener of [...listeners]) listener();
      };

      /**
       * Commit one percentage: apply it immediately and remember it.
       * @param next - requested percentage; `undefined` resets to 100%.
       */
      const set = (next) => {
        const value = next === undefined ? DEFAULT_ZOOM : normalizeZoom(next);
        if (value === zoom) return;
        zoom = value;
        applyDocumentZoom(zoom);
        // Persist 100 too: with a non-default profile zoom, clearing the key
        // would bring the profile default back on the next reload, so an
        // explicit reset would not survive a restart.
        persistZoom(zoom);
        emit();
      };

      /**
       * Move one step through `LEVELS`.
       * @param direction - +1 for zoom in, -1 for zoom out.
       */
      const step = (direction) => {
        let index = LEVELS.indexOf(zoom);
        if (index < 0) {
          index = LEVELS.findIndex((level) => level > zoom);
          if (index < 0) index = LEVELS.length - 1;
          else if (direction < 0) index -= 1;
          if (index < 0) index = 0;
        } else {
          index = Math.min(LEVELS.length - 1, Math.max(0, index + direction));
        }
        set(LEVELS[index]);
      };

      // Another window of the same profile writes the same key.
      ctx.effect(() => {
        const onStorage = (event) => {
          if (event.key !== STORAGE_KEY) return;
          const next = storedZoom();
          const value = next === undefined ? DEFAULT_ZOOM : next;
          if (value === zoom) return;
          zoom = value;
          applyDocumentZoom(zoom);
          emit();
        };
        window.addEventListener('storage', onStorage);
        return () => {
          window.removeEventListener('storage', onStorage);
        };
      }, 'ui-zoom: cross-window adoption');

      ctx.effect(() => () => {
        applyDocumentZoom(DEFAULT_ZOOM);
      }, 'ui-zoom: restore document zoom');

      return {
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        getSnapshot: () => zoom,
        set,
        step,
        reset: () => set(undefined),
        levels: LEVELS,
      };
    }

    /**
     * Bind interface zoom to the desktop zoom gestures.
     *
     * The official theme plugin owns Ctrl/Cmd +/- for font size and reads the
     * gesture in the window bubble phase after checking `defaultPrevented`.
     * Intercepting in the capture phase and stopping immediate propagation
     * supersedes that action without touching the official plugin; the same
     * path also stops the browser's own Ctrl+wheel zoom from firing twice.
     * @param ctx - client plugin context owning the listeners.
     * @param zoom - runtime whose step/reset actions run.
     */
    function installZoomShortcuts(ctx, zoom) {
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      const isMac = /Mac|iPhone|iPad/i.test(`${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`);
      const primary = (event) => (isMac ? event.metaKey : event.ctrlKey);
      let accumulated = 0;
      let lastStep = 0;

      const onKeyDown = (event) => {
        if (!primary(event) || event.altKey || event.isComposing) return;
        let action;
        if (event.code === 'Equal' || event.code === 'NumpadAdd') action = 1;
        else if (event.code === 'Minus' || event.code === 'NumpadSubtract') action = -1;
        else if (event.code === 'Digit0' || event.code === 'Numpad0') action = 0;
        else return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (action === 0) zoom.reset();
        else zoom.step(action);
      };

      const onWheel = (event) => {
        if (!primary(event) || event.altKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
        accumulated += event.deltaY * unit;
        const now = Date.now();
        if (Math.abs(accumulated) < WHEEL_STEP_PX || now - lastStep < WHEEL_COOLDOWN_MS) return;
        zoom.step(accumulated < 0 ? 1 : -1);
        accumulated = 0;
        lastStep = now;
      };

      ctx.effect(() => {
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('wheel', onWheel, { capture: true, passive: false });
        return () => {
          window.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('wheel', onWheel, { capture: true });
        };
      }, 'ui-zoom: zoom gestures');
    }

    /**
     * Scale anchored web popovers with the app and keep them on screen.
     *
     * Menus and listboxes are portaled to `document.body`, outside the zoomed
     * root. They are positioned from the anchor's visual rect, so leaving them
     * at 100% makes them look detached; zooming them without correction would
     * push bottom-anchored panels off-screen. This scaler re-derives top/left
     * from the trigger recorded on pointerdown, converts the result back into
     * the panel's zoomed coordinate space, and clamps it to the viewport.
     * @param ctx - client plugin context owning the observer and listeners.
     * @param zoom - runtime providing the current percentage.
     */
    function installOverlayZoom(ctx, zoom) {
      if (typeof MutationObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
      const records = new Map();
      let pointer = null;
      let trigger = null;

      const triggerOf = (target) => (target instanceof Element
        ? target.closest('button,[role="button"],[role="menuitem"],[aria-haspopup="true"]') ?? target
        : null);

      const onPointerDown = (event) => {
        trigger = triggerOf(event.target);
        pointer = { x: event.clientX, y: event.clientY, at: Date.now() };
      };

      // Hover submenus open without a pointerdown on the item; remember the
      // hovered item so the child panel is anchored to it.
      const onPointerOver = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('[role="menuitem"],[aria-haspopup="true"]') === null) return;
        trigger = triggerOf(target);
        pointer = { x: event.clientX, y: event.clientY, at: Date.now() };
      };

      /** A body-level menu/listbox that the app positions with inline top/left. */
      const panelOf = (node) => {
        if (!(node instanceof HTMLElement) || node.parentElement !== document.body) return null;
        const role = node.getAttribute('role');
        if (role !== 'menu' && role !== 'listbox') return null;
        if (node.style.top === '' || node.style.left === '') return null;
        return node;
      };

      /**
       * Resolve the visual top/left for one panel at zoom `z`.
       *
       * Anchored panels follow their trigger (top/bottom/left/right, start/end).
       * Pointer-positioned panels (context menus) keep the app's pointer
       * coordinates. Panels without a usable trigger are clamped in place.
       */
      const place = (panel, record, z) => {
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        if (width === 0 || height === 0) return null;
        const margin = 12 * z;
        const maxLeft = window.innerWidth - width * z - margin;
        const maxTop = window.innerHeight - height * z - margin;
        const clampX = (value) => Math.min(Math.max(value, margin), Math.max(margin, maxLeft));
        const clampY = (value) => Math.min(Math.max(value, margin), Math.max(margin, maxTop));
        const origin = record.origin;
        const originPointer = record.pointer;
        if (originPointer !== null
          && Math.abs(origin.top - originPointer.y) <= 16
          && Math.abs(origin.left - originPointer.x) <= 16) {
          return { left: clampX(origin.left), top: clampY(origin.top) };
        }
        const anchor = record.anchor instanceof Element && record.anchor.isConnected ? record.anchor : null;
        if (anchor === null) return { left: clampX(origin.left), top: clampY(origin.top) };
        const box = anchor.getBoundingClientRect();
        const gap = 4 * z;
        const withinY = origin.top >= box.top - 2 && origin.top <= box.bottom + 2;
        const side = withinY && origin.left >= box.right - 2
          ? 'right'
          : origin.left + width <= box.left + 2
            ? 'left'
            : origin.top < box.top
              ? 'top'
              : 'bottom';
        let left;
        let top;
        if (side === 'right' || side === 'left') {
          const alignEnd = Math.abs(origin.top - box.top) >= Math.abs(origin.top + height - box.bottom);
          left = side === 'right' ? box.right + gap : box.left - gap - width * z;
          top = alignEnd ? box.bottom - height * z : box.top;
        } else {
          const alignEnd = Math.abs(origin.left - box.left) >= Math.abs(origin.left + width - box.right);
          left = alignEnd ? box.right - width * z : box.left;
          top = side === 'top' ? box.top - gap - height * z : box.bottom + gap;
        }
        return { left: clampX(left), top: clampY(top) };
      };

      /**
       * Re-apply one panel.
       * @param panel - body-level menu/listbox.
       * @param refreshOrigin - read the current inline top/left as the app's
       *   new position (style mutation) instead of keeping the first one.
       */
      const correct = (panel, refreshOrigin) => {
        const record = records.get(panel);
        if (record === undefined || record.origin === null) return;
        const z = zoom.getSnapshot() / 100;
        if (refreshOrigin) {
          const top = Number.parseFloat(panel.style.top);
          const left = Number.parseFloat(panel.style.left);
          if (Number.isFinite(top) && Number.isFinite(left)) {
            const applied = record.applied;
            if (applied === undefined
              || Math.abs(applied.top - top) > 0.5
              || Math.abs(applied.left - left) > 0.5) {
              record.origin = { top, left };
            }
          }
        }
        if (z === 1) {
          if (record.applied === undefined) return;
          const placed = place(panel, record, 1);
          panel.style.removeProperty('zoom');
          if (placed !== null) {
            panel.style.left = `${placed.left}px`;
            panel.style.top = `${placed.top}px`;
          } else {
            panel.style.left = `${record.origin.left}px`;
            panel.style.top = `${record.origin.top}px`;
          }
          record.applied = undefined;
          return;
        }
        const placed = place(panel, record, z);
        if (placed === null) return;
        const left = placed.left / z;
        const top = placed.top / z;
        const applied = record.applied;
        if (applied !== undefined
          && Math.abs(applied.left - left) < 0.5
          && Math.abs(applied.top - top) < 0.5
          && applied.zoom === z
          && Math.abs(Number.parseFloat(panel.style.left) - applied.left) < 0.5
          && Math.abs(Number.parseFloat(panel.style.top) - applied.top) < 0.5) return;
        panel.style.zoom = String(z);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        record.applied = { left, top, zoom: z };
      };

      const removePanel = (panel) => {
        const record = records.get(panel);
        if (record === undefined) return;
        record.observer?.disconnect();
        records.delete(panel);
      };

      const schedule = (panel, refreshOrigin) => {
        requestAnimationFrame(() => {
          if (!panel.isConnected) {
            removePanel(panel);
            return;
          }
          correct(panel, refreshOrigin);
        });
      };

      const addPanel = (panel) => {
        if (records.has(panel)) return;
        const top = Number.parseFloat(panel.style.top);
        const left = Number.parseFloat(panel.style.left);
        const focused = document.activeElement;
        const anchor = trigger instanceof Element && trigger.isConnected
          ? trigger
          : focused instanceof Element && focused !== document.body
            ? focused
            : null;
        const record = {
          anchor,
          pointer: pointer === null ? null : { x: pointer.x, y: pointer.y },
          origin: Number.isFinite(top) && Number.isFinite(left) ? { top, left } : null,
          applied: undefined,
          observer: null,
        };
        record.observer = new MutationObserver(() => {
          if (record.origin === null) {
            const nextTop = Number.parseFloat(panel.style.top);
            const nextLeft = Number.parseFloat(panel.style.left);
            if (!Number.isFinite(nextTop) || !Number.isFinite(nextLeft)) return;
            record.origin = { top: nextTop, left: nextLeft };
            schedule(panel, false);
            return;
          }
          schedule(panel, true);
        });
        record.observer.observe(panel, { attributes: true, attributeFilter: ['style'] });
        records.set(panel, record);
        if (record.origin !== null) schedule(panel, false);
      };

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            const panel = panelOf(node);
            if (panel !== null) addPanel(panel);
          }
        }
        // React can move a portal (remove + insert in one batch) while keeping
        // the same element; only drop records whose element stayed detached.
        for (const [panel] of records) if (!panel.isConnected) removePanel(panel);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      ctx.effect(() => {
        window.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('pointerover', onPointerOver, true);
        return () => {
          window.removeEventListener('pointerdown', onPointerDown, true);
          window.removeEventListener('pointerover', onPointerOver, true);
        };
      }, 'ui-zoom: popover anchor');

      ctx.effect(() => zoom.subscribe(() => {
        for (const [panel] of records) if (panel.isConnected) schedule(panel, false);
      }), 'ui-zoom: rescale open popovers');

      ctx.effect(() => () => {
        observer.disconnect();
        for (const [panel, record] of records) {
          record.observer?.disconnect();
          if (panel.isConnected && record.applied !== undefined) {
            panel.style.removeProperty('zoom');
            panel.style.left = `${record.origin.left}px`;
            panel.style.top = `${record.origin.top}px`;
          }
        }
        records.clear();
      }, 'ui-zoom: popover scaler');
    }

    /** Chevron used by the picker button. */
    function Caret() {
      return h('svg', {
        viewBox: '0 0 12 12', width: 10, height: 10, 'aria-hidden': true, focusable: 'false',
      }, h('path', {
        d: 'M2.5 4.5 6 8l3.5-3.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }));
    }

    /**
     * Settings row: title, description, out/in buttons, and a picker listing
     * every supported percentage.
     * @param props - composed slot props plus the injected runtime.
     * @returns the row element tree.
     */
    function ZoomRow({ t, zoom }) {
      const useLayoutEffect = React.useLayoutEffect ?? React.useEffect;
      const value = React.useSyncExternalStore(zoom.subscribe, zoom.getSnapshot);
      const [open, setOpen] = React.useState(false);
      const [dropUp, setDropUp] = React.useState(false);
      const rootRef = React.useRef(null);
      const menuRef = React.useRef(null);
      const menuId = React.useId();

      useLayoutEffect(() => {
        if (!open) {
          setDropUp(false);
          return;
        }
        const menu = menuRef.current;
        const stepper = menu?.parentElement?.querySelector('.dshz-stepper');
        if (stepper === null || stepper === undefined) return;
        const rect = stepper.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom;
        const above = rect.top;
        setDropUp(below < 310 && above > below);
      }, [open]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          const root = rootRef.current;
          if (root !== null && !root.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          }
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
        };
      }, [open]);

      React.useEffect(() => {
        if (!open || menuRef.current === null) return;
        const current = menuRef.current.querySelector('[aria-selected="true"]');
        (current === null ? menuRef.current.querySelector('[role="option"]') : current)?.focus({ preventScroll: true });
      }, [open]);

      const moveFocus = (event) => {
        const options = [...event.currentTarget.querySelectorAll('[role="option"]')];
        if (options.length === 0) return;
        const index = options.indexOf(document.activeElement);
        const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const next = (index + delta + options.length) % options.length;
        options[next].focus();
      };

      const levels = zoom.levels.includes(value)
        ? zoom.levels
        : [...zoom.levels, value].sort((left, right) => left - right);

      return h('div', { className: 'dshz-row' },
        h('div', { className: 'dshz-text' },
          h('div', { className: 'dshz-title' }, t('zoom.title')),
          h('div', { className: 'dshz-desc' }, t('zoom.description')),
        ),
        h('div', { className: 'dshz-control', ref: rootRef },
          h('button', {
            type: 'button',
            className: 'dshz-step',
            'aria-label': t('zoom.decrease'),
            title: t('zoom.decrease'),
            disabled: value <= MIN_ZOOM,
            onClick: () => zoom.step(-1),
          }, '\u2212'),
          h('div', { className: 'dshz-picker' },
            h('button', {
              type: 'button',
              className: 'dshz-stepper',
              'aria-haspopup': 'listbox',
              'aria-expanded': open,
              'aria-controls': open ? menuId : undefined,
              'aria-label': t('zoom.menu'),
              title: t('zoom.menu'),
              onClick: () => setOpen((previous) => !previous),
            },
              h('span', { className: 'dshz-value' }, `${value}%`),
              h('span', { className: 'dshz-caret' }, h(Caret)),
            ),
            open && h('div', {
              id: menuId,
              ref: menuRef,
              className: `dshz-menu${dropUp ? ' dshz-menu-up' : ''}`,
              role: 'listbox',
              tabIndex: -1,
              'aria-label': t('zoom.menu'),
              onKeyDown: moveFocus,
            }, levels.map((level) => h('button', {
              key: level,
              type: 'button',
              role: 'option',
              className: 'dshz-option',
              'aria-selected': level === value,
              tabIndex: level === value ? 0 : -1,
              onClick: () => {
                zoom.set(level);
                setOpen(false);
              },
            },
              h('span', null, `${level}%`),
              level === value ? h('span', { className: 'dshz-check', 'aria-hidden': true }, '\u2713') : null,
            ))),
          ),
          h('button', {
            type: 'button',
            className: 'dshz-step',
            'aria-label': t('zoom.increase'),
            title: t('zoom.increase'),
            disabled: value >= MAX_ZOOM,
            onClick: () => zoom.step(1),
          }, '+'),
          value === DEFAULT_ZOOM ? null : h('button', {
            type: 'button',
            className: 'dshz-reset',
            'aria-label': t('zoom.resetHint'),
            title: t('zoom.resetHint'),
            onClick: () => zoom.reset(),
          }, t('zoom.reset')),
        ),
      );
    }

    /** Required services: slot registry and localized copy. */
    const inject = ['slots', 'locale'];

    /**
     * Client plugin body: own the zoom runtime, mirror it into the document, and
     * register the settings row.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      installStyles(ctx);
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'ui-zoom: row dictionary');
      const zoom = createZoomRuntime(ctx);
      installZoomShortcuts(ctx, zoom);
      installOverlayZoom(ctx, zoom);
      ctx.slots.inject('settings.general.item', () => ctx.slots.register({
        name: 'settings.general.item',
        id: ROW_ID,
        order: 12,
        locale: LOCALE_NS,
        inject: () => ({ zoom }),
      }, ZoomRow));
    }

    return { inject, apply };
  },
});
