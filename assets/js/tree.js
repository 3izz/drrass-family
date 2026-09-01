/**
 * tree.js — interactive family tree engine (mobile-first rebuild).
 *
 * Renders the real ~395-member, 9-generation single-parent genealogy as an
 * absolutely-positioned node canvas inside a pinch / pan / zoom viewport.
 *
 * Features: collapse/expand with subtree counts, live keyboard-navigable
 * search, branch filter, a "focus mode" that isolates one person and their
 * immediate relatives, a breadcrumb trail, a person details sheet (bottom
 * sheet on phones, side panel on desktop), a relationship calculator
 * (exact — every member has at most one recorded parent, so LCA is
 * unambiguous), level-of-detail rendering, and a cached minimap.
 *
 * The genealogy is strictly patrilineal in the source data: no spouse,
 * birth/death year, photo, occupation or biography fields are populated,
 * so the UI shows what exists (father, sons, brothers, branch, life
 * status, historical notes) and degrades gracefully — it never invents.
 */
(function () {
  'use strict';

  // ---- geometry ----
  const NODE_W = 168;
  const COL_GAP = 28;
  const ROW_H = 150;
  const SLOT = NODE_W + COL_GAP;
  const NODE_H = 78;          // visual height used for link anchor points
  const MIN_SCALE = 0.12;
  const MAX_SCALE = 2.4;

  // ---- state ----
  let members = [];
  let meta = {};
  const byId = new Map();
  let rootId = null;
  const expanded = new Set();
  const subtreeCount = new Map();   // id -> total descendants
  let selectedId = null;
  let focusId = null;
  let compareMode = false;
  let compareA = null;
  let compareB = null;
  let branchFilter = 'all';
  let positions = new Map();
  let contentBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let lastPath = [];
  let miniCache = null;

  let scale = 1, tx = 0, ty = 0;

  // ---- dom ----
  const stage = document.getElementById('tree-stage');
  const viewport = document.getElementById('tree-viewport');
  const canvas = document.getElementById('tree-canvas');
  const linksSvg = document.getElementById('tree-links');
  const loadingEl = document.getElementById('tree-loading');
  const branchSelect = document.getElementById('branch-filter');
  const searchInput = document.getElementById('tree-search');
  const searchResults = document.getElementById('tree-search-results');
  const searchBox = document.getElementById('tree-search-box');
  const searchClear = document.getElementById('tree-search-clear');
  const trailHint = document.getElementById('tree-trail-hint');
  const trailCrumbs = document.getElementById('tree-trail-crumbs');
  const focusBanner = document.getElementById('tree-focus-banner');
  const focusLabel = document.getElementById('tree-focus-label');
  const recenterBtn = document.getElementById('zoom-recenter');
  const sheet = document.getElementById('person-sheet');
  const sheetBody = document.getElementById('person-sheet-body');
  const toolsSheet = document.getElementById('tree-tools-sheet');
  const treeStat = document.getElementById('tree-stat');

  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }
  function isAr() { return lang() === 'ar'; }
  function num(n) { return isAr() ? String(n).replace(/\d/g, (d) => AR_DIGITS[+d]) : String(n); }
  function T(ar, en) { return isAr() ? ar : en; }
  function nameOf(m) { return m && m.name ? (m.name[lang()] || m.name.ar || '؟') : '؟'; }
  function branchOf(m) { return m && m.branch ? (m.branch[lang()] || m.branch.ar || '') : ''; }

  // =====================================================================
  // Data
  // =====================================================================
  async function loadData() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) {
      loadingEl.innerHTML = '<p>' + T('تعذّر تحميل بيانات الشجرة.', 'Could not load the family data.') + '</p>';
      return;
    }
    members = data.members;
    meta = data.meta || {};
    members.forEach((m) => byId.set(m.id, m));
    rootId = meta.founderId || members[0].id;

    expanded.add(rootId);           // start collapsed to the two branches
    computeSubtreeCounts(rootId);
    populateBranchFilter();
    renderStat();
    applyUrlParams();

    loadingEl.style.display = 'none';
    render();
    if (!selectedId) initialView();
  }

  function initialView() {
    const r = stage.getBoundingClientRect();
    const off = OFF();
    const rp = positions.get(rootId);
    if (!rp) return;
    scale = Math.min(1.1, Math.max(0.72, r.width / 1120));
    tx = r.width / 2 - (rp.x + off.x + NODE_W / 2) * scale;
    ty = Math.max(24, r.height * 0.16);
    clampPan(); updateLOD(); applyTransform(false);
  }

  function computeSubtreeCounts(id) {
    const kids = (byId.get(id).children || []).filter((k) => byId.has(k));
    let c = kids.length;
    kids.forEach((k) => { c += computeSubtreeCounts(k); });
    subtreeCount.set(id, c);
    return c;
  }

  function populateBranchFilter() {
    const branches = new Map();
    members.forEach((m) => {
      if (m.branchId && m.branchId !== 'root' && !branches.has(m.branchId)) branches.set(m.branchId, m.branch);
    });
    const L = lang();
    branchSelect.innerHTML = '<option value="all">' + T('كل الفروع', 'All branches') + '</option>' +
      [...branches.entries()].map(([id, label]) => `<option value="${id}">${label[L] || label.ar}</option>`).join('');
    branchSelect.value = branchFilter;
  }

  function renderStat() {
    if (!treeStat) return;
    const alive = members.filter((m) => m.alive).length;
    const gens = Math.max(...members.map((m) => m.generation || 1));
    treeStat.textContent = T(
      `${num(members.length)} فردًا موثّقًا في ${num(gens)} أجيال، منهم ${num(alive)} على قيد الحياة`,
      `${members.length} people recorded across ${gens} generations — ${alive} living`
    );
  }

  function applyUrlParams() {
    const params = new URLSearchParams(location.search);
    const branch = params.get('branch');
    const focus = params.get('focus');
    if (branch) { branchFilter = branch; branchSelect.value = branch; }
    if (focus && byId.has(focus)) {
      setTimeout(() => selectPerson(focus, { openSheet: true }), 350);
    }
  }

  // =====================================================================
  // Ancestor helpers (single-parent => unambiguous chains)
  // =====================================================================
  function parentOf(id) {
    const m = byId.get(id);
    return m && m.parents && m.parents[0] && byId.has(m.parents[0]) ? m.parents[0] : null;
  }
  function ancestorChain(id) {
    const chain = [id];
    let cur = parentOf(id);
    while (cur) { chain.unshift(cur); cur = parentOf(cur); }
    return chain;
  }
  function siblingsOf(id) {
    const p = parentOf(id);
    if (!p) return [];
    return (byId.get(p).children || []).filter((c) => c !== id && byId.has(c));
  }
  function expandAncestors(id) { ancestorChain(id).forEach((a) => expanded.add(a)); }

  // neighbourhood shown in focus mode: father, self, siblings, sons
  function neighbourhood(id) {
    const set = new Set([id]);
    const p = parentOf(id);
    if (p) { set.add(p); (byId.get(p).children || []).forEach((c) => byId.has(c) && set.add(c)); }
    (byId.get(id).children || []).forEach((c) => byId.has(c) && set.add(c));
    return set;
  }

  // =====================================================================
  // Layout: recursive no-overlap slot assignment (tidy tree)
  // =====================================================================
  function computeLayout() {
    positions = new Map();
    let cursor = 0;
    const visibleIds = [];

    function place(id, depth) {
      const node = byId.get(id);
      visibleIds.push(id);
      const kids = (node.children || []).filter((k) => byId.has(k));
      const showKids = expanded.has(id) && kids.length > 0;
      if (!showKids) {
        const x = cursor; cursor += 1;
        positions.set(id, { slotX: x, depth, hasChildren: kids.length > 0, expanded: false });
        return x;
      }
      const childXs = kids.map((k) => place(k, depth + 1));
      const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
      positions.set(id, { slotX: x, depth, hasChildren: true, expanded: true });
      return x;
    }
    place(rootId, 0);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach((p) => {
      p.x = p.slotX * SLOT;
      p.y = p.depth * ROW_H;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    contentBounds = { minX, maxX: maxX + NODE_W, minY, maxY: maxY + NODE_H };
    return visibleIds;
  }

  const OFF = () => ({ x: -contentBounds.minX + 48, y: 48 });

  // =====================================================================
  // Render
  // =====================================================================
  function render() {
    const visibleIds = computeLayout();
    const off = OFF();
    const inFocus = focusId != null;
    const hood = inFocus ? neighbourhood(focusId) : null;

    canvas.style.width = (contentBounds.maxX - contentBounds.minX + 96) + 'px';
    canvas.style.height = (contentBounds.maxY - contentBounds.minY + 96) + 'px';
    linksSvg.setAttribute('width', canvas.style.width);
    linksSvg.setAttribute('height', canvas.style.height);

    const existing = new Map();
    canvas.querySelectorAll('.pnode').forEach((el) => existing.set(el.dataset.id, el));
    const keep = new Set();

    visibleIds.forEach((id) => {
      const m = byId.get(id);
      const pos = positions.get(id);
      keep.add(id);

      let el = existing.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'pnode';
        el.dataset.id = id;
        el.setAttribute('role', 'treeitem');
        el.tabIndex = 0;
        el.innerHTML =
          '<span class="pnode__av"><img alt="" loading="lazy"></span>' +
          '<span class="pnode__name"></span>' +
          '<span class="pnode__meta"></span>' +
          '<span class="pnode__dot" aria-hidden="true"></span>';
        el.addEventListener('click', (e) => {
          if (e.target.closest('.pnode__toggle')) return;
          activateNode(el.dataset.id);
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateNode(el.dataset.id); }
        });
        canvas.appendChild(el);
      }
      el.style.transform = `translate(${pos.x + off.x}px, ${pos.y + off.y}px)`;
      el.querySelector('.pnode__name').textContent = nameOf(m);

      const metaEl = el.querySelector('.pnode__meta');
      if (pos.hasChildren && !pos.expanded) {
        metaEl.textContent = T(`${num(subtreeCount.get(id) || 0)} من الذرية`, `${subtreeCount.get(id) || 0} descendants`);
      } else {
        metaEl.textContent = T('الجيل ', 'Gen ') + num(m.generation || 1);
      }

      const img = el.querySelector('img');
      img.dataset.name = nameOf(m);
      if (!img.dataset.avatarBound) FamilyAvatar.lazyMount(img);

      el.classList.toggle('is-root', id === rootId);
      el.classList.toggle('is-selected', id === selectedId);
      el.classList.toggle('is-deceased', m.alive === false);
      el.classList.toggle('is-documented', !!m.historicalNote);
      el.classList.toggle('is-compare-a', id === compareA);
      el.classList.toggle('is-compare-b', id === compareB);
      const dimBranch = branchFilter !== 'all' && m.branchId !== branchFilter && m.branchId !== 'root';
      const dimFocus = inFocus && !hood.has(id);
      el.classList.toggle('is-dim', dimBranch || dimFocus);
      el.classList.toggle('is-hood', inFocus && hood.has(id));
      el.setAttribute('aria-hidden', dimFocus ? 'true' : 'false');
      el.setAttribute('aria-label', ariaFor(m, pos));
      if (pos.hasChildren) el.setAttribute('aria-expanded', String(pos.expanded));
      else el.removeAttribute('aria-expanded');

      let toggle = el.querySelector('.pnode__toggle');
      if (pos.hasChildren) {
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.className = 'pnode__toggle';
          toggle.type = 'button';
          toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleNode(id); });
          el.appendChild(toggle);
        }
        toggle.textContent = pos.expanded ? '−' : '+' + num(subtreeCount.get(id) || 0);
        toggle.setAttribute('aria-label', pos.expanded
          ? T('طيّ ' + nameOf(m), 'Collapse ' + nameOf(m))
          : T('فتح ' + nameOf(m) + ' — ' + num(subtreeCount.get(id) || 0) + ' من الذرية', 'Expand ' + nameOf(m)));
      } else if (toggle) {
        toggle.remove();
      }
    });

    existing.forEach((el, id) => { if (!keep.has(id)) el.remove(); });

    renderLinks(visibleIds, off, hood);
    buildMiniCache(visibleIds, off);
    const mm = document.getElementById('tree-minimap');
    if (mm) mm.hidden = visibleIds.length < 26;
    updateLOD();
    applyTransform();
  }

  function ariaFor(m, pos) {
    let s = nameOf(m) + '، ' + T('الجيل ', 'generation ') + num(m.generation || 1);
    if (m.alive === false) s += '، ' + T('رحمه الله', 'deceased');
    if (pos.hasChildren) s += '، ' + T(num(subtreeCount.get(m.id) || 0) + ' من الذرية', (subtreeCount.get(m.id) || 0) + ' descendants');
    return s;
  }

  function renderLinks(visibleIds, off, hood) {
    const NS = 'http://www.w3.org/2000/svg';
    const frag = document.createDocumentFragment();
    const highlight = new Set(lastPath);
    visibleIds.forEach((id) => {
      const pos = positions.get(id);
      if (!pos.expanded) return;
      (byId.get(id).children || []).forEach((cid) => {
        const cpos = positions.get(cid);
        if (!cpos) return;
        const x1 = pos.x + off.x + NODE_W / 2;
        const y1 = pos.y + off.y + NODE_H;
        const x2 = cpos.x + off.x + NODE_W / 2;
        const y2 = cpos.y + off.y;
        const midY = (y1 + y2) / 2;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`);
        let cls = '';
        if (highlight.has(id) && highlight.has(cid)) cls = 'is-highlighted';
        else if (hood && hood.has(id) && hood.has(cid)) cls = 'is-hood';
        else if (hood) cls = 'is-faded';
        if (cls) path.setAttribute('class', cls);
        frag.appendChild(path);
      });
    });
    linksSvg.textContent = '';
    linksSvg.appendChild(frag);
  }

  // =====================================================================
  // Minimap (cached dots + live viewport rect)
  // =====================================================================
  function buildMiniCache(visibleIds, off) {
    const mm = document.getElementById('minimap-canvas');
    if (!mm) return;
    const cw = contentBounds.maxX - contentBounds.minX + 96;
    const ch = contentBounds.maxY - contentBounds.minY + 96;
    const s = Math.min(mm.width / cw, mm.height / ch);
    miniCache = { s, offImg: document.createElement('canvas') };
    miniCache.offImg.width = mm.width;
    miniCache.offImg.height = mm.height;
    const g = miniCache.offImg.getContext('2d');
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#888';
    visibleIds.forEach((id) => {
      const pos = positions.get(id);
      g.fillRect((pos.x + off.x) * s, (pos.y + off.y) * s, 2.4, 2.4);
    });
    drawMinimap();
  }

  function drawMinimap() {
    const mm = document.getElementById('minimap-canvas');
    if (!mm || !miniCache) return;
    const ctx = mm.getContext('2d');
    ctx.clearRect(0, 0, mm.width, mm.height);
    ctx.drawImage(miniCache.offImg, 0, 0);
    const s = miniCache.s;
    const r = stage.getBoundingClientRect();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#111';
    ctx.lineWidth = 1.25;
    ctx.strokeRect((-tx / scale) * s, (-ty / scale) * s, (r.width / scale) * s, (r.height / scale) * s);
  }

  // =====================================================================
  // Pan / zoom / transform
  // =====================================================================
  let rafPending = false;
  function applyTransform(animated) {
    viewport.style.transition = animated ? 'transform 0.5s var(--ease-luxury)' : 'none';
    viewport.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; drawMinimap(); });
    }
  }

  function updateLOD() {
    stage.dataset.lod = scale < 0.4 ? 'far' : scale < 0.75 ? 'mid' : 'near';
  }

  function clampPan() {
    // keep at least a sliver of content on screen
    const r = stage.getBoundingClientRect();
    const cw = (contentBounds.maxX - contentBounds.minX + 96) * scale;
    const ch = (contentBounds.maxY - contentBounds.minY + 96) * scale;
    const margin = 120;
    tx = Math.min(r.width - margin, Math.max(margin - cw, tx));
    ty = Math.min(r.height - margin, Math.max(margin - ch, ty));
  }

  function zoomBy(factor, cx, cy) {
    const r = stage.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const next = Math.min(Math.max(scale * factor, MIN_SCALE), MAX_SCALE);
    const wx = (cx - tx) / scale, wy = (cy - ty) / scale;
    tx = cx - wx * next; ty = cy - wy * next;
    scale = next;
    clampPan(); updateLOD(); applyTransform(false);
  }

  function fitTree(opts) {
    opts = opts || {};
    const r = stage.getBoundingClientRect();
    const cw = contentBounds.maxX - contentBounds.minX + 96;
    const ch = contentBounds.maxY - contentBounds.minY + 96;
    const pad = 0.86;
    scale = Math.min(Math.max(Math.min((r.width / cw) * pad, (r.height / ch) * pad), MIN_SCALE), 1.1);
    tx = (r.width - cw * scale) / 2;
    ty = Math.max(16, (r.height - ch * scale) / 2);
    updateLOD();
    applyTransform(opts.animate !== false);
  }

  function centerOn(id, opts) {
    opts = opts || {};
    const pos = positions.get(id);
    if (!pos) return;
    const off = OFF();
    const r = stage.getBoundingClientRect();
    const targetScale = opts.scale || Math.min(Math.max(scale, 0.85), 1.15);
    const px = pos.x + off.x + NODE_W / 2;
    const py = pos.y + off.y + NODE_H / 2;
    tx = r.width / 2 - px * targetScale;
    ty = Math.min(r.height * 0.42, r.height / 2) - py * targetScale + (opts.dy || 0);
    scale = targetScale;
    clampPan(); updateLOD(); applyTransform(true);
    flash(id);
  }

  function centerOnSet(ids, opts) {
    opts = opts || {};
    const pts = ids.map((i) => positions.get(i)).filter(Boolean);
    if (!pts.length) return;
    const off = OFF();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + NODE_W);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + NODE_H);
    });
    const r = stage.getBoundingClientRect();
    const bw = (maxX - minX) + 140, bh = (maxY - minY) + 140;
    const vp = viewportRegion(r);
    scale = Math.min(Math.max(Math.min(vp.w / bw, r.height / bh, 1.15), 0.45), 1.15);
    const cx = (minX + maxX) / 2 + off.x;
    const cy = (minY + maxY) / 2 + off.y;
    tx = vp.cx - cx * scale;
    ty = (sheetIsSide() ? r.height / 2 : r.height * 0.4) - cy * scale;
    clampPan(); updateLOD(); applyTransform(opts.animate !== false);
  }

  // usable region of the stage that isn't covered by the desktop side panel
  function viewportRegion(r) {
    if (!sheetIsSide()) return { w: r.width, cx: r.width / 2 };
    const w = r.width - 380;
    return document.dir === 'rtl' ? { w, cx: 380 + w / 2 } : { w, cx: w / 2 };
  }
  function sheetIsSide() { return window.matchMedia('(min-width: 900px)').matches && !sheet.hidden; }

  function flash(id) {
    const el = canvas.querySelector(`.pnode[data-id="${cssEsc(id)}"]`);
    if (!el) return;
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  }
  function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'); }

  // ---- wheel ----
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // ---- node activation (mouse click / touch tap / keyboard) ----
  function activateNode(id) {
    if (compareMode) pickForCompare(id);
    else selectPerson(id, { openSheet: true });
  }

  // ---- pointer: pan (1 finger) + pinch (2 fingers) on the empty canvas ----
  // A press that starts on a .pnode is left entirely to that node's native
  // click / keydown, so tap-to-open is 100% reliable on touch. Panning and
  // pinching are driven from empty-canvas presses only.
  const pointers = new Map();
  let panStart = null, pinchStart = null, emptyTapAt = 0, emptyTapPos = null;

  function isControl(t) {
    return t.closest('.pnode, .tree-fab, .tree-focus-banner, .tree-minimap, button, a, input, select');
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchStart = {
        dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1,
        mid: { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 },
        scale, tx, ty,
      };
      panStart = null;
      viewport.style.transition = 'none';
      return;
    }
    if (isControl(e.target)) { pointers.delete(e.pointerId); return; }

    panStart = { x: e.clientX, y: e.clientY, tx, ty, moved: false, t: Date.now() };
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    stage.classList.add('is-grabbing');
  }, { passive: true });

  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchStart && pointers.size >= 2) {
      const p = [...pointers.values()];
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
      const r = stage.getBoundingClientRect();
      const mx = pinchStart.mid.x - r.left, my = pinchStart.mid.y - r.top;
      const next = Math.min(Math.max(pinchStart.scale * (dist / pinchStart.dist), MIN_SCALE), MAX_SCALE);
      const wx = (mx - pinchStart.tx) / pinchStart.scale, wy = (my - pinchStart.ty) / pinchStart.scale;
      scale = next; tx = mx - wx * next; ty = my - wy * next;
      updateLOD(); applyTransform(false);
      return;
    }

    if (panStart) {
      const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
      if (Math.hypot(dx, dy) > 5) panStart.moved = true;
      tx = panStart.tx + dx; ty = panStart.ty + dy;
      applyTransform(false);
    }
  }, { passive: true });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size > 0) return;

    stage.classList.remove('is-grabbing');
    const ps = panStart; panStart = null;
    if (ps) { clampPan(); applyTransform(false); }

    if (ps && !ps.moved && Date.now() - ps.t < 400) {
      const r = stage.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const dbl = Date.now() - emptyTapAt < 320 && emptyTapPos &&
        Math.hypot(x - emptyTapPos.x, y - emptyTapPos.y) < 40;
      emptyTapAt = Date.now(); emptyTapPos = { x, y };
      if (dbl) zoomBy(1.8, x, y);
      else { clearFocus(); closeResults(); }
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // ---- minimap: click / drag to move the viewport ----
  const minimapEl = document.getElementById('tree-minimap');
  if (minimapEl) {
    const jump = (e) => {
      if (!miniCache) return;
      const b = minimapEl.getBoundingClientRect();
      const s = miniCache.s;
      const wx = (e.clientX - b.left) / s, wy = (e.clientY - b.top) / s;
      const r = stage.getBoundingClientRect();
      tx = r.width / 2 - wx * scale; ty = r.height / 2 - wy * scale;
      clampPan(); applyTransform(true);
    };
    minimapEl.addEventListener('pointerdown', (e) => { jump(e); minimapEl.setPointerCapture(e.pointerId); });
    minimapEl.addEventListener('pointermove', (e) => { if (e.buttons) jump(e); });
  }

  // ---- keyboard on stage ----
  stage.addEventListener('keydown', (e) => {
    const step = 90;
    if (e.key === 'ArrowLeft') { tx += step; applyTransform(false); }
    else if (e.key === 'ArrowRight') { tx -= step; applyTransform(false); }
    else if (e.key === 'ArrowUp') { ty += step; applyTransform(false); }
    else if (e.key === 'ArrowDown') { ty -= step; applyTransform(false); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.2);
    else if (e.key === '-') zoomBy(1 / 1.2);
    else if (e.key === '0') fitTree();
    else if (e.key === 'Escape') { clearFocus(); closeSheet(); }
    else return;
    e.preventDefault();
  });

  // =====================================================================
  // Selection / focus
  // =====================================================================
  function selectPerson(id, opts) {
    opts = opts || {};
    if (!byId.has(id)) return;
    selectedId = id;
    focusId = id;
    expandAncestors(id);
    expanded.add(id);
    const p = parentOf(id);
    if (p) expanded.add(p);
    render();
    renderTrail();
    updateFocusBanner();
    recenterBtn.disabled = false;
    if (opts.openSheet) openSheet(id);
    requestAnimationFrame(() => centerOnSet([...neighbourhood(id)], { animate: true }));
  }

  function clearFocus() {
    if (focusId == null && selectedId == null) return;
    focusId = null;
    selectedId = null;
    lastPath = compareMode ? lastPath : [];
    recenterBtn.disabled = true;
    render();
    renderTrail();
    updateFocusBanner();
  }

  function updateFocusBanner() {
    if (focusId == null) { focusBanner.hidden = true; return; }
    focusBanner.hidden = false;
    focusLabel.textContent = T('التركيز على: ', 'Focused on: ') + nameOf(byId.get(focusId));
  }
  document.getElementById('tree-focus-exit').addEventListener('click', () => { clearFocus(); closeSheet(); });

  function renderTrail() {
    if (!selectedId) {
      trailHint.hidden = false;
      trailCrumbs.hidden = true;
      trailCrumbs.textContent = '';
      return;
    }
    trailHint.hidden = true;
    trailCrumbs.hidden = false;
    const chain = ancestorChain(selectedId);
    trailCrumbs.textContent = '';
    chain.forEach((id, i) => {
      if (i) {
        const sep = document.createElement('span');
        sep.className = 'tree-trail__sep';
        sep.textContent = '‹';
        trailCrumbs.appendChild(sep);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tree-trail__crumb' + (id === selectedId ? ' is-current' : '');
      b.textContent = nameOf(byId.get(id));
      b.addEventListener('click', () => selectPerson(id, { openSheet: false }));
      trailCrumbs.appendChild(b);
    });
    trailCrumbs.scrollLeft = document.dir === 'rtl' ? 0 : trailCrumbs.scrollWidth;
  }

  function toggleNode(id) {
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    render();
  }

  // =====================================================================
  // Person sheet
  // =====================================================================
  let sheetOpen = false;
  function openSheet(id) {
    const m = byId.get(id);
    const L = lang();
    const father = parentOf(id);
    const sibs = siblingsOf(id);
    const kids = (m.children || []).filter((c) => byId.has(c));
    const gen = num(m.generation || 1);
    const status = m.alive === false
      ? `<span class="ps-pill ps-pill--memoriam">${T('رحمه الله', 'Deceased')}</span>`
      : `<span class="ps-pill">${T('على قيد الحياة', 'Living')}</span>`;

    const chip = (cid) => `<button type="button" class="ps-chip" data-goto="${cid}">
        <img src="${FamilyAvatar.makeAvatar(nameOf(byId.get(cid)), { size: 32 })}" alt="">${nameOf(byId.get(cid))}</button>`;
    const chips = (arr) => arr.length ? arr.map(chip).join('') : `<span class="ps-empty">${T('لا يوجد', 'None')}</span>`;

    sheetBody.innerHTML = `
      <div class="ps-head">
        <span class="ps-avatar${m.alive === false ? ' is-memoriam' : ''}">
          <img src="${FamilyAvatar.makeAvatar(nameOf(m), { size: 160 })}" alt="${nameOf(m)}"></span>
        <div class="ps-head__txt">
          <h2 class="ps-name" id="person-sheet-name">${nameOf(m)}</h2>
          <div class="ps-sub">${T('الجيل', 'Generation')} ${gen} — ${branchOf(m) || T('الجذر', 'Root')}</div>
          <div class="ps-tags">${status}${m.historicalNote ? `<span class="ps-pill ps-pill--doc">${T('موثّق تاريخيًا', 'Documented')}</span>` : ''}</div>
        </div>
        <button class="ps-close icon-btn" data-sheet-close aria-label="${T('إغلاق', 'Close')}">✕</button>
      </div>

      ${m.historicalNote ? `<div class="ps-note">
        <div class="ps-note__h">${T('ملاحظة تاريخية موثّقة', 'Documented historical note')}</div>
        <p>${m.historicalNote[L] || m.historicalNote.ar}</p></div>` : ''}

      <div class="ps-rel">
        <div class="ps-rel__row"><span class="ps-rel__k">${T('الأب', 'Father')}</span>
          <div class="ps-rel__v">${father ? chip(father) : `<span class="ps-empty">${T('غير معروف (الجذر)', 'Unknown (root)')}</span>`}</div></div>
        <div class="ps-rel__row"><span class="ps-rel__k">${T('الأم / الزوجة', 'Mother / spouse')}</span>
          <div class="ps-rel__v"><span class="ps-empty">${T('غير مسجّلة في الأرشيف', 'Not recorded in the archive')} · <a href="suggestions.html">${T('أضف معلومة', 'Add info')}</a></span></div></div>
        <div class="ps-rel__row"><span class="ps-rel__k">${T('الإخوة', 'Brothers')} ${sibs.length ? `(${num(sibs.length)})` : ''}</span>
          <div class="ps-rel__v ps-chips">${chips(sibs)}</div></div>
        <div class="ps-rel__row"><span class="ps-rel__k">${T('الأبناء', 'Sons')} ${kids.length ? `(${num(kids.length)})` : ''}</span>
          <div class="ps-rel__v ps-chips">${chips(kids)}</div></div>
      </div>

      <div class="ps-actions">
        <button class="btn btn--gold btn--sm" id="ps-center">${T('توسيط في الشجرة', 'Center in tree')}</button>
        <button class="btn btn--outline btn--sm" id="ps-compare">${T('حاسبة القرابة', 'Kinship calc')}</button>
        <button class="btn btn--outline btn--sm" id="ps-copy">${T('نسخ رابط الفرد', 'Copy link')}</button>
      </div>
      <div class="ps-qr"><canvas id="ps-qr-canvas" aria-hidden="true"></canvas>
        <span>${T('امسح الرمز لفتح صفحة هذا الفرد', 'Scan to open this person')}</span></div>
    `;

    sheetBody.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      selectPerson(b.dataset.goto, { openSheet: true });
    }));
    sheetBody.querySelector('#ps-center').addEventListener('click', () => {
      centerOn(id, { scale: 1 }); if (!sheetIsSide()) closeSheet();
    });
    sheetBody.querySelector('#ps-compare').addEventListener('click', () => {
      if (!compareMode) toggleCompare(true);
      pickForCompare(id);
      closeSheet();
    });
    sheetBody.querySelector('#ps-copy').addEventListener('click', () => {
      const url = location.origin + location.pathname + '?focus=' + id;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(() => window.showToast && showToast(T('تم نسخ الرابط', 'Link copied')))
        .catch(() => window.prompt(T('انسخ الرابط:', 'Copy link:'), url));
    });
    try {
      QRCode.renderToCanvas(sheetBody.querySelector('#ps-qr-canvas'),
        location.origin + location.pathname + '?focus=' + id, { scale: 3, quiet: 2 });
    } catch (e) { const q = sheetBody.querySelector('.ps-qr'); if (q) q.style.display = 'none'; }

    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('is-open'));
    document.body.classList.add('sheet-open');
    sheetOpen = true;
  }

  function closeSheet() {
    if (!sheetOpen) return;
    sheet.classList.remove('is-open');
    document.body.classList.remove('sheet-open');
    sheetOpen = false;
    setTimeout(() => { if (!sheetOpen) sheet.hidden = true; }, 320);
  }
  sheet.querySelectorAll('[data-sheet-close]').forEach((el) => el.addEventListener('click', closeSheet));

  // =====================================================================
  // Search (keyboard navigable)
  // =====================================================================
  let searchMatches = [], activeIdx = -1;

  function runSearch() {
    const q = searchInput.value.trim();
    searchClear.hidden = !q;
    if (!q) { closeResults(); return; }
    const L = lang();
    searchMatches = members.filter((m) =>
      (m.name[L] || '').includes(q) || (m.name.ar || '').includes(q) || (m.name.en || '').toLowerCase().includes(q.toLowerCase())
    ).slice(0, 12);
    activeIdx = -1;
    if (!searchMatches.length) {
      searchResults.innerHTML = `<div class="search-empty">${T('لا توجد نتائج', 'No results')}</div>`;
    } else {
      searchResults.innerHTML = searchMatches.map((m, i) => {
        const f = parentOf(m.id);
        return `<div class="search-result-item" role="option" id="sr-${i}" data-id="${m.id}">
          <img src="${FamilyAvatar.makeAvatar(nameOf(m), { size: 36 })}" alt="" style="width:30px;height:30px;border-radius:50%;">
          <span>${hl(nameOf(m), q)}</span>
          <span class="tag" style="margin-inline-start:auto;white-space:nowrap;">${T('جيل', 'gen')} ${num(m.generation || 1)}${f ? ' — ' + T('ابن', 'son of') + ' ' + nameOf(byId.get(f)) : ''}</span>
        </div>`;
      }).join('');
    }
    openResults();
  }
  function hl(text, q) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? text : text.slice(0, i) + '<mark>' + text.slice(i, i + q.length) + '</mark>' + text.slice(i + q.length);
  }
  function openResults() { searchResults.classList.add('is-open'); searchInput.setAttribute('aria-expanded', 'true'); }
  function closeResults() { searchResults.classList.remove('is-open'); searchInput.setAttribute('aria-expanded', 'false'); activeIdx = -1; }
  function setActive(i) {
    const items = searchResults.querySelectorAll('.search-result-item');
    if (!items.length) return;
    activeIdx = (i + items.length) % items.length;
    items.forEach((el, n) => el.classList.toggle('is-active', n === activeIdx));
    items[activeIdx].scrollIntoView({ block: 'nearest' });
    searchInput.setAttribute('aria-activedescendant', 'sr-' + activeIdx);
  }
  function chooseSearch(id) {
    searchInput.value = '';
    searchClear.hidden = true;
    closeResults();
    searchInput.blur();
    searchBox.classList.remove('is-expanded');
    selectPerson(id, { openSheet: true });
  }

  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = activeIdx >= 0 ? searchMatches[activeIdx] : searchMatches[0];
      if (pick) chooseSearch(pick.id);
    } else if (e.key === 'Escape') { closeResults(); searchInput.blur(); }
  });
  searchResults.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (item) chooseSearch(item.dataset.id);
  });
  searchClear.addEventListener('click', () => { searchInput.value = ''; searchInput.focus(); runSearch(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-box')) closeResults(); });

  // mobile: search toggle reveals the field
  document.getElementById('tree-search-toggle').addEventListener('click', () => {
    const on = searchBox.classList.toggle('is-expanded');
    document.getElementById('tree-search-toggle').setAttribute('aria-expanded', String(on));
    if (on) setTimeout(() => searchInput.focus(), 60); else closeResults();
  });

  branchSelect.addEventListener('change', () => { branchFilter = branchSelect.value; render(); });

  // =====================================================================
  // Controls
  // =====================================================================
  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.25));
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.25));
  document.getElementById('zoom-fit').addEventListener('click', () => { clearFocus(); fitTree(); });
  recenterBtn.addEventListener('click', () => { if (selectedId) centerOnSet([...neighbourhood(selectedId)]); });

  document.getElementById('expand-all-btn').addEventListener('click', () => {
    members.forEach((m) => expanded.add(m.id));
    closeTools(); render(); fitTree();
  });
  document.getElementById('collapse-all-btn').addEventListener('click', () => {
    expanded.clear();
    expanded.add(rootId);
    clearFocus(); closeTools(); render(); initialView();
  });

  // ---- tools sheet ----
  const toolsToggle = document.getElementById('tree-tools-toggle');
  function openTools() { toolsSheet.hidden = false; requestAnimationFrame(() => toolsSheet.classList.add('is-open')); toolsToggle.setAttribute('aria-expanded', 'true'); }
  function closeTools() { toolsSheet.classList.remove('is-open'); toolsToggle.setAttribute('aria-expanded', 'false'); setTimeout(() => toolsSheet.classList.contains('is-open') || (toolsSheet.hidden = true), 300); }
  toolsToggle.addEventListener('click', () => (toolsSheet.hidden || !toolsSheet.classList.contains('is-open')) ? openTools() : closeTools());
  toolsSheet.querySelectorAll('[data-tools-close]').forEach((el) => el.addEventListener('click', closeTools));

  // =====================================================================
  // Relationship calculator
  // =====================================================================
  const relationViewer = document.getElementById('relation-viewer');
  const compareBtn = document.getElementById('compare-toggle');
  const slotA = document.getElementById('slot-a');
  const slotB = document.getElementById('slot-b');
  const relationResult = document.getElementById('relation-result');
  const relationPath = document.getElementById('relation-path');

  function toggleCompare(force) {
    compareMode = force != null ? force : !compareMode;
    compareBtn.classList.toggle('is-active', compareMode);
    relationViewer.classList.toggle('is-open', compareMode);
    relationViewer.setAttribute('aria-hidden', String(!compareMode));
    document.body.classList.toggle('compare-on', compareMode);
    if (compareMode) {
      focusId = null; updateFocusBanner();
      closeSheet();
      render();
      window.showToast && showToast(T('اختر فردين من الشجرة لمعرفة صلة القرابة', 'Tap two people to see how they are related'));
    } else {
      compareA = compareB = null; lastPath = [];
      relationResult.textContent = ''; relationPath.textContent = '';
      updateSlots();
      render();
    }
  }
  compareBtn.addEventListener('click', () => { toggleCompare(); closeTools(); });
  document.getElementById('relation-close').addEventListener('click', () => toggleCompare(false));
  [slotA, slotB].forEach((s) => s.addEventListener('click', () => {
    if (s === slotA) compareA = null; else compareB = null;
    updateSlots(); render();
  }));

  function pickForCompare(id) {
    if (compareA === id) compareA = null;
    else if (compareB === id) compareB = null;
    else if (!compareA) compareA = id;
    else if (!compareB) compareB = id;
    else { compareA = id; compareB = null; }
    updateSlots();
    if (compareA && compareB) computeAndShowRelation(compareA, compareB);
    else { relationResult.textContent = ''; relationPath.textContent = ''; lastPath = []; render(); }
  }
  function updateSlots() {
    slotA.innerHTML = compareA ? slotHtml(compareA) : T('اختر الفرد الأول', 'First person');
    slotB.innerHTML = compareB ? slotHtml(compareB) : T('اختر الفرد الثاني', 'Second person');
    slotA.classList.toggle('is-set', !!compareA);
    slotB.classList.toggle('is-set', !!compareB);
  }
  function slotHtml(id) {
    return `<img src="${FamilyAvatar.makeAvatar(nameOf(byId.get(id)), { size: 32 })}" alt=""><span>${nameOf(byId.get(id))}</span>`;
  }

  const DESC_AR = ['', 'ابن', 'حفيد', 'ابن حفيد', 'حفيد حفيد', 'من ذريّة'];
  const DESC_EN = ['', 'son', 'grandson', 'great-grandson', '2×-great-grandson', 'descendant'];
  const ORD_AR = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];
  const ORD_EN = ['', '1st', '2nd', '3rd', '4th', '5th'];

  function computeRelationship(a, b) {
    if (a === b) return { key: 'same' };
    const ca = ancestorChain(a), cb = ancestorChain(b);
    let i = 0;
    while (i < ca.length && i < cb.length && ca[i] === cb[i]) i++;
    const lcaIdx = i - 1;
    const dA = ca.length - 1 - lcaIdx, dB = cb.length - 1 - lcaIdx;
    const path = ca.slice(lcaIdx).reverse().concat(cb.slice(lcaIdx + 1));
    return { key: 'related', dA, dB, path };
  }

  function computeAndShowRelation(a, b) {
    const rel = computeRelationship(a, b);
    let text = '';
    if (rel.key === 'same') { text = T('نفس الشخص', 'Same person'); lastPath = [a]; }
    else {
      const { dA, dB, path } = rel; lastPath = path;
      const nA = nameOf(byId.get(a)), nB = nameOf(byId.get(b));
      if (dA === 0) text = T(`${nB} ${DESC_AR[dB] || DESC_AR[5]} ${nA}`, `${nB} is the ${DESC_EN[dB] || DESC_EN[5]} of ${nA}`);
      else if (dB === 0) text = T(`${nA} ${DESC_AR[dA] || DESC_AR[5]} ${nB}`, `${nA} is the ${DESC_EN[dA] || DESC_EN[5]} of ${nB}`);
      else if (dA === 1 && dB === 1) text = T('أخوان', 'Brothers');
      else if ((dA === 1 && dB === 2) || (dA === 2 && dB === 1)) {
        const uncle = dA === 1 ? a : b, nep = dA === 1 ? b : a;
        text = T(`${nameOf(byId.get(uncle))} عمّ ${nameOf(byId.get(nep))}`, `${nameOf(byId.get(uncle))} is the uncle of ${nameOf(byId.get(nep))}`);
      } else {
        const deg = Math.min(dA, dB) - 1, removed = Math.abs(dA - dB);
        text = T(`أبناء عمّ من الدرجة ${ORD_AR[deg] || deg}${removed ? ` (بفارق ${num(removed)} جيل)` : ''}`,
                 `${ORD_EN[deg] || deg + 'th'} cousins${removed ? ` (${removed}× removed)` : ''}`);
      }
    }
    relationResult.textContent = text;
    relationPath.innerHTML = lastPath.map((id) => `<span>${nameOf(byId.get(id))}</span>`).join('');
    expandAncestors(a); expandAncestors(b);
    render();
    centerOnSet(lastPath);
  }

  // =====================================================================
  // Init
  // =====================================================================
  loadData();

  document.addEventListener('langchange', () => {
    if (!rootId) return;
    populateBranchFilter();
    renderStat();
    render();
    renderTrail();
    updateFocusBanner();
    if (compareA && compareB) computeAndShowRelation(compareA, compareB);
    else updateSlots();
    if (sheetOpen && selectedId) openSheet(selectedId);
  });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { clampPan(); drawMinimap(); }, 150); });
})();
