/**
 * Design runtime — a vanilla-JS IIFE injected into previewed apps when the
 * preview URL carries `?design=1`.
 *
 * Responsibilities (Phase 2):
 *   - Walk the DOM collecting every element tagged with `data-oid`.
 *   - Post the tree to `window.parent` with the marker `__birdcode_design: 1`
 *     on load and on subsequent DOM mutations (debounced).
 *   - Accept `design.select` / `design.hover` commands from the parent and draw
 *     absolute-positioned overlay rectangles so the user sees the element that
 *     will be edited.
 *   - Intercept clicks and postMessage `design.click` with the clicked OID so
 *     the panel can select it and later jump-to-source.
 *
 * The iframe sandbox omits `allow-same-origin`; postMessage still crosses the
 * null-origin boundary, and we do not need any privileged DOM access here.
 *
 * Kept intentionally dependency-free and small — it ships as a template
 * literal inlined by `previewProxyRoute.ts`.
 */

/**
 * The runtime script, as a string ready to be inlined into `<script>…</script>`.
 * ES5-compatible syntax only (no arrow functions, classes, or Object.assign) so
 * older dev-server browsers still run it.
 */
export const DESIGN_RUNTIME_SCRIPT = `(function(){
if (window.__birdcodeDesignRuntimeInstalled) return;
window.__birdcodeDesignRuntimeInstalled = true;

var MARKER = '__birdcode_design';
var DEBOUNCE_MS = 150;
var parentWin = window.parent;

function post(type, payload){
  try {
    var msg = { __birdcode_design: 1, type: type };
    if (payload) {
      for (var k in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, k)) msg[k] = payload[k];
      }
    }
    parentWin.postMessage(msg, '*');
  } catch(e){}
}

function escapeOidForSelector(oid){
  if (oid == null || oid === '') return '';
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(oid);
  var s = String(oid);
  var out = '';
  for (var i = 0; i < s.length; i++){
    var c = s.charAt(i);
    if (c === '\\\\') out += '\\\\\\\\';
    else if (c === '"') out += '\\\\"';
    else if (c === '\\r') out += '\\\\r';
    else if (c === '\\n') out += '\\\\n';
    else if (c === '\\f') out += '\\\\f';
    else if (c === '\\0') out += '\\\\0';
    else out += c;
  }
  return out;
}

function nodesFromDocument(){
  var list = document.querySelectorAll('[data-oid]');
  var out = [];
  for (var i = 0; i < list.length; i++){
    var el = list[i];
    var oid = el.getAttribute('data-oid');
    if (!oid) continue;
    var parent = el.parentElement;
    var parentOid = null;
    while (parent){
      if (parent.hasAttribute && parent.hasAttribute('data-oid')){
        parentOid = parent.getAttribute('data-oid');
        break;
      }
      parent = parent.parentElement;
    }
    var cls = el.getAttribute('class');
    out.push({
      oid: oid,
      parentOid: parentOid,
      tag: (el.tagName || '').toLowerCase(),
      textPreview: (el.textContent || '').trim().slice(0, 80),
      className: cls === null ? null : cls
    });
  }
  return out;
}

var scheduled = null;
function scheduleReport(){
  if (scheduled) return;
  scheduled = setTimeout(function(){
    scheduled = null;
    post('design.tree', { nodes: nodesFromDocument() });
  }, DEBOUNCE_MS);
}

// Overlays ------------------------------------------------------------------
var overlayRoot = null;
function ensureOverlayRoot(){
  if (overlayRoot && overlayRoot.isConnected) return overlayRoot;
  overlayRoot = document.createElement('div');
  overlayRoot.setAttribute('data-birdcode-design-overlay', '1');
  overlayRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
  document.documentElement.appendChild(overlayRoot);
  return overlayRoot;
}

function makeBox(kind){
  var box = document.createElement('div');
  box.setAttribute('data-birdcode-design-box', kind);
  var color = kind === 'select' ? '#3b82f6' : '#60a5fa';
  var bg = kind === 'select' ? 'rgba(59,130,246,0.12)' : 'rgba(96,165,250,0.08)';
  box.style.cssText = 'position:absolute;border:2px solid ' + color + ';background:' + bg + ';border-radius:2px;pointer-events:none;transition:all 60ms linear;';
  return box;
}

var boxes = { select: null, hover: null };
function drawBox(kind, oid){
  var root = ensureOverlayRoot();
  if (!oid){
    if (boxes[kind]){ boxes[kind].remove(); boxes[kind] = null; }
    return;
  }
  var el = document.querySelector('[data-oid="' + escapeOidForSelector(oid) + '"]');
  if (!el){
    if (boxes[kind]){ boxes[kind].remove(); boxes[kind] = null; }
    return;
  }
  var rect = el.getBoundingClientRect();
  var box = boxes[kind];
  if (!box){ box = makeBox(kind); root.appendChild(box); boxes[kind] = box; }
  box.style.left = rect.left + 'px';
  box.style.top = rect.top + 'px';
  box.style.width = rect.width + 'px';
  box.style.height = rect.height + 'px';
}

var trackedOids = { select: null, hover: null };
function redrawTracked(){
  drawBox('select', trackedOids.select);
  drawBox('hover', trackedOids.hover);
}

// Click interception --------------------------------------------------------
function oidFromEvent(e){
  var t = e.target;
  while (t && t.nodeType === 1){
    if (t.hasAttribute && t.hasAttribute('data-oid')) return t.getAttribute('data-oid');
    t = t.parentElement;
  }
  return null;
}

document.addEventListener('click', function(e){
  var oid = oidFromEvent(e);
  if (!oid) return;
  e.preventDefault();
  e.stopPropagation();
  trackedOids.select = oid;
  redrawTracked();
  post('design.click', { oid: oid });
}, true);

document.addEventListener('mousemove', function(e){
  var oid = oidFromEvent(e);
  if (oid === trackedOids.hover) return;
  trackedOids.hover = oid;
  drawBox('hover', oid);
}, true);

document.addEventListener('mouseleave', function(){
  trackedOids.hover = null;
  drawBox('hover', null);
}, true);

// Parent → runtime messages -------------------------------------------------
window.addEventListener('message', function(e){
  var data = e.data;
  if (!data || data.__birdcode_design !== 1) return;
  if (data.type === 'design.select'){
    trackedOids.select = data.oid || null;
    drawBox('select', trackedOids.select);
  } else if (data.type === 'design.hover'){
    trackedOids.hover = data.oid || null;
    drawBox('hover', trackedOids.hover);
  } else if (data.type === 'design.requestTree'){
    post('design.tree', { nodes: nodesFromDocument() });
  }
});

// Keep overlays aligned on scroll/resize ------------------------------------
window.addEventListener('scroll', redrawTracked, true);
window.addEventListener('resize', redrawTracked);

// DOM mutations → re-report tree & redraw -----------------------------------
var mo = new MutationObserver(function(){
  scheduleReport();
  redrawTracked();
});
function startObserving(){
  if (!document.body) return false;
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-oid'] });
  return true;
}

function ready(){
  if (!startObserving()){
    setTimeout(ready, 50);
    return;
  }
  post('design.ready', { href: location.href });
  scheduleReport();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ready);
} else {
  ready();
}
})();`;
