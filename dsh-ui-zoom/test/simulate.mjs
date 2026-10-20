// Offline harness for dsh-ui-zoom/client.js: no browser, no Harness.
// Stubs window/document/React/localStorage, then exercises the runtime + row render.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function makeStorage(initial) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

function makeWindow(storage) {
  const listeners = new Map();
  const window = {
    __ModuleLoader__: {
      load(definition) { window.__definition = definition; },
    },
    localStorage: storage,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
    listenerCount(type) { return listeners.get(type)?.size ?? 0; },
  };
  return window;
}

function makeDocument(bootZoom) {
  const styles = [];
  const body = {
    style: {
      props: {},
      setProperty(name, value) { this.props[name] = value; },
      removeProperty(name) { delete this.props[name]; },
      get zoom() { return this.props.zoom; },
    },
    dataset: {},
  };
  const root = {
    style: {
      props: {},
      setProperty(name, value) { this.props[name] = value; },
      removeProperty(name) { delete this.props[name]; },
      get zoom() { return this.props.zoom; },
    },
    dataset: {},
  };
  const document = {
    body,
    root,
    documentElement: { dataset: bootZoom === undefined ? {} : { dshUiZoom: String(bootZoom) } },
    styles,
    activeElement: null,
    getElementById(id) { return id === 'root' ? root : null; },
    createElement(tagName) {
      return { tagName, dataset: {}, textContent: '', removed: false, remove() { this.removed = true; } };
    },
    head: { appendChild(tag) { styles.push(tag); } },
    addEventListener() {},
    removeEventListener() {},
  };
  return document;
}

function makeReact() {
  return {
    createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
    useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; },
    useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot(); },
    useEffect() {},
    useRef(value) { return { current: value ?? null }; },
    useId() { return 'test-id'; },
  };
}

function loadClient({ bootZoom, stored } = {}) {
  const storage = makeStorage(stored);
  const window = makeWindow(storage);
  const document = makeDocument(bootZoom);
  new Function('window', 'document', code)(window, document);

  const definition = window.__definition;
  assert.equal(definition.id, '@local/dsh-ui-zoom', 'bundle id');

  const disposers = [];
  const ctx = {
    effect(fn) {
      const dispose = fn();
      if (typeof dispose === 'function') disposers.push(dispose);
      return dispose;
    },
    locale: {
      dictionaries: {},
      register(namespace, dictionaries) { this.dictionaries[namespace] = dictionaries; },
    },
    slots: {
      injected: [],
      registered: undefined,
      inject(name, callback) { this.injected.push(name); callback(); },
      register(options, component) { this.registered = { options, component }; return () => {}; },
    },
  };

  const client = definition.factory((id) => {
    assert.equal(id, 'react', 'only react is required');
    return makeReact();
  });
  assert.deepEqual(client.inject, ['slots', 'locale'], 'declared services');
  client.apply(ctx);

  const zoom = ctx.slots.registered.options.inject().zoom;
  return { window, document, storage, ctx, disposers, zoom };
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children);
}

// --- scenario 1: fresh browser -------------------------------------------------
{
  const { window, document, storage, ctx, disposers, zoom } = loadClient();

  assert.deepEqual(ctx.slots.injected, ['settings.general.item'], 'row injected into General');
  assert.equal(ctx.slots.registered.options.id, 'ui-zoom', 'row id');
  assert.equal(ctx.slots.registered.options.order, 12, 'row order after font size');
  assert.equal(ctx.slots.registered.options.locale, 'settings.ui-zoom', 'row locale namespace');
  assert.ok(ctx.locale.dictionaries['settings.ui-zoom'].zh['zoom.title'], 'zh copy registered');
  assert.ok(ctx.locale.dictionaries['settings.ui-zoom'].en['zoom.title'], 'en copy registered');
  assert.equal(document.styles.length, 1, 'stylesheet injected');
  assert.equal(document.root.style.zoom, undefined, 'body untouched at startup');
  assert.equal(window.listenerCount('keydown'), 1, 'keyboard gesture listener installed');
  assert.equal(window.listenerCount('wheel'), 1, 'wheel gesture listener installed');

  assert.equal(zoom.getSnapshot(), 100, 'default zoom');
  assert.deepEqual(zoom.levels, [50, 60, 70, 80, 90, 100, 110, 125, 150, 200, 400], 'levels');

  zoom.set(125);
  assert.equal(document.root.style.zoom, '1.25', 'zoom applied');
  assert.equal(document.documentElement.dataset.dshUiZoom, '125', 'dataset mirrors zoom');
  assert.equal(storage.getItem('dsh-ui-zoom'), '125', 'choice persisted');

  zoom.step(1);
  assert.equal(zoom.getSnapshot(), 150, 'step up');
  assert.equal(document.root.style.zoom, '1.5', 'step applied');
  zoom.step(-1);
  assert.equal(zoom.getSnapshot(), 125, 'step down');

  const tree = ctx.slots.registered.component({ t: (key) => key, zoom });
  const text = textOf(tree);
  assert.ok(text.includes('zoom.title'), 'renders the title through t');
  assert.ok(text.includes('125%'), 'renders the current percentage');

  zoom.reset();
  assert.equal(zoom.getSnapshot(), 100, 'reset value');
  assert.equal(document.root.style.zoom, undefined, 'reset restores the document');
  assert.equal(storage.getItem('dsh-ui-zoom'), '100', 'reset persists the explicit 100% choice');

  for (const dispose of disposers.reverse()) dispose();
  assert.equal(document.styles[0].removed, true, 'dispose removes the stylesheet');
  assert.equal(window.listenerCount('storage'), 0, 'dispose removes the storage listener');
  assert.equal(window.listenerCount('keydown'), 0, 'dispose removes the keyboard listener');
  assert.equal(window.listenerCount('wheel'), 0, 'dispose removes the wheel listener');
}

// --- scenario 2: profile default from the boot script ---------------------------
{
  const { document, zoom, storage } = loadClient({ bootZoom: 110 });
  assert.equal(zoom.getSnapshot(), 110, 'boot value adopted');
  assert.equal(document.root.style.zoom, '1.1', 'boot value mirrored into the document');
  zoom.set(90);
  assert.equal(storage.getItem('dsh-ui-zoom'), '90', 'user change stored');
  assert.equal(document.root.style.zoom, '0.9', 'user change applied');
}

// --- scenario 3: stored value wins over the profile default --------------------
{
  const { zoom, document } = loadClient({ bootZoom: 200, stored: { 'dsh-ui-zoom': '75' } });
  assert.equal(zoom.getSnapshot(), 75, 'stored value wins');
  assert.equal(document.root.style.zoom, '0.75', 'stored value replaces the profile default on load');
  zoom.step(1);
  assert.equal(zoom.getSnapshot(), 80, 'step continues from the stored value');
}

// --- scenario 4: cross-window adoption -----------------------------------------
{
  const { window, document, storage, zoom } = loadClient();
  storage.setItem('dsh-ui-zoom', '150');
  window.dispatch('storage', { key: 'dsh-ui-zoom' });
  assert.equal(zoom.getSnapshot(), 150, 'other window change adopted');
  assert.equal(document.root.style.zoom, '1.5', 'other window change applied');

  storage.removeItem('dsh-ui-zoom');
  window.dispatch('storage', { key: 'dsh-ui-zoom' });
  assert.equal(zoom.getSnapshot(), 100, 'cleared key falls back to 100');
}

// --- scenario 5: clamping and off-level values --------------------------------
{
  const { zoom } = loadClient({ stored: { 'dsh-ui-zoom': '115' } });
  assert.equal(zoom.getSnapshot(), 115, 'custom stored value kept');
  zoom.step(1);
  assert.equal(zoom.getSnapshot(), 125, 'step goes to the next supported level');
  zoom.step(-1);
  assert.equal(zoom.getSnapshot(), 110, 'step goes to the previous supported level');

  zoom.set(9999);
  assert.equal(zoom.getSnapshot(), 400, 'clamped to the maximum');
  zoom.set(1);
  assert.equal(zoom.getSnapshot(), 50, 'clamped to the minimum');
}

// --- scenario 6: reload without a profile default ------------------------------
{
  const { document, zoom } = loadClient({ stored: { 'dsh-ui-zoom': '125' } });
  assert.equal(zoom.getSnapshot(), 125, 'stored value adopted');
  assert.equal(document.root.style.zoom, '1.25', 'stored value applied before the row renders');
}

// --- scenario 7: keyboard and wheel gestures ---------------------------------
{
  const { window, document, zoom } = loadClient();
  const gesture = (code, extra = {}) => ({
    code,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...extra,
  });

  const increase = gesture('Equal');
  window.dispatch('keydown', increase);
  assert.equal(zoom.getSnapshot(), 110, 'Ctrl+= zooms in one level');
  assert.equal(document.root.style.zoom, '1.1', 'keyboard zoom applied');
  assert.ok(increase.defaultPrevented && increase.stopped, 'Ctrl+= is consumed before the font-size handler');

  window.dispatch('keydown', gesture('Equal', { shiftKey: true }));
  assert.equal(zoom.getSnapshot(), 125, 'Ctrl+Shift+= also zooms in');
  window.dispatch('keydown', gesture('Minus'));
  assert.equal(zoom.getSnapshot(), 110, 'Ctrl+- zooms out');
  window.dispatch('keydown', gesture('Digit0'));
  assert.equal(zoom.getSnapshot(), 100, 'Ctrl+0 resets');

  const plain = gesture('Equal', { ctrlKey: false });
  window.dispatch('keydown', plain);
  assert.equal(zoom.getSnapshot(), 100, 'plain = is left alone');
  assert.equal(plain.defaultPrevented, undefined, 'plain = is not consumed');
}

{
  const { window, zoom } = loadClient();
  const wheel = (deltaY, extra = {}) => ({
    deltaY,
    deltaMode: 0,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...extra,
  });

  const up = wheel(-120);
  window.dispatch('wheel', up);
  assert.equal(zoom.getSnapshot(), 110, 'Ctrl+wheel up zooms in');
  assert.ok(up.defaultPrevented && up.stopped, 'Ctrl+wheel is consumed');

  const plain = wheel(-120, { ctrlKey: false });
  window.dispatch('wheel', plain);
  assert.equal(zoom.getSnapshot(), 110, 'plain wheel does not zoom');
  assert.equal(plain.defaultPrevented, undefined, 'plain wheel is not consumed');
}

{
  const { window, zoom } = loadClient();
  window.dispatch('wheel', {
    deltaY: 120,
    deltaMode: 0,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.equal(zoom.getSnapshot(), 90, 'Ctrl+wheel down zooms out');
}

console.log('client.js harness: all assertions passed');
