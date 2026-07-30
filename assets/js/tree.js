/**
 * tree.js — interactive family tree engine.
 * Renders a real 395-member, 9-generation single-parent genealogy as an
 * absolutely-positioned node canvas inside a pan/zoomable viewport, with
 * collapse/expand, live search, branch filtering, a relationship
 * calculator (exact, since every member has at most one recorded parent —
 * this is a proper tree, so lowest-common-ancestor is unambiguous), a
 * member profile modal with a generated QR code, and a print outline.
 */
(function () {
  'use strict';

  const NODE_W = 172;
  const COL_GAP = 36;
  const ROW_H = 168;
  const SLOT = NODE_W + COL_GAP;

  let members = [];
  let byId = new Map();
  let rootId = null;
  const expanded = new Set();
  let selectedId = null;
  let compareMode = false;
  let compareA = null;
  let compareB = null;
  let branchFilter = 'all';
  let positions = new Map(); // id -> {x, y} in px
  let contentBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  let scale = 1, tx = 0, ty = 0;

  const stage = document.getElementById('tree-stage');
  const viewport = document.getElementById('tree-viewport');
  const canvas = document.getElementById('tree-canvas');
  const linksSvg = document.getElementById('tree-links');
  const loadingEl = document.getElementById('tree-loading');
  const branchSelect = document.getElementById('branch-filter');
  const searchInput = document.getElementById('tree-search');
  const searchResults = document.getElementById('tree-search-results');

  function lang() { return (window.I18n && I18n.getLang()) || 'ar'; }

  // ---------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------
  async function loadData() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    members = data.members;
    members.forEach((m) => byId.set(m.id, m));
    rootId = data.meta.founderId;

    // default expanded state: everything up to generation 3 (small, real numbers)
    members.forEach((m) => { if ((m.generation || 1) <= 3) expanded.add(m.id); });

    populateBranchFilter();
    applyUrlParams();
    loadingEl.style.display = 'none';
    render();
    buildPrintOutline();
  }

  function populateBranchFilter() {
    const branches = new Map();
    members.forEach((m) => {
      if (m.branchId && m.branchId !== 'root' && !branches.has(m.branchId)) {
        branches.set(m.branchId, m.branch);
      }
    });
    const L = lang();
    branchSelect.innerHTML = `<option value="all">${L === 'ar' ? 'كل الفروع' : 'All Branches'}</option>` +
      [...branches.entries()].map(([id, label]) => `<option value="${id}">${label[L]}</option>`).join('');
  }

  function applyUrlParams() {
    const params = new URLSearchParams(location.search);
    const branch = params.get('branch');
    const focus = params.get('focus');
    if (branch) {
      branchFilter = branch;
      branchSelect.value = branch;
    }
    if (focus && byId.has(focus)) {
      expandAncestors(focus);
      selectedId = focus;
      setTimeout(() => centerOn(focus), 400);
    }
  }

  // ---------------------------------------------------------------------
  // Ancestor helpers (single-parent tree => unambiguous chains)
  // ---------------------------------------------------------------------
  function ancestorChain(id) {
    // returns [root, ..., parent, id]
    const chain = [id];
    let cur = byId.get(id);
    while (cur && cur.parents && cur.parents[0] && byId.has(cur.parents[0])) {
      chain.unshift(cur.parents[0]);
      cur = byId.get(cur.parents[0]);
    }
    return chain;
  }

  function expandAncestors(id) {
    const chain = ancestorChain(id);
    chain.forEach((aid) => expanded.add(aid));
  }

  // ---------------------------------------------------------------------
  // Layout: recursive slot assignment (no-overlap tidy tree)
  // ---------------------------------------------------------------------
  function computeLayout() {
    positions = new Map();
    let cursor = 0;
    const visibleIds = [];

    function place(id, depth) {
      const node = byId.get(id);
      visibleIds.push(id);
      const kids = node.children || [];
      const showKids = expanded.has(id) && kids.length > 0;
      if (!showKids) {
        const x = cursor;
        cursor += 1;
        positions.set(id, { slotX: x, depth, hasChildren: kids.length > 0, expanded: false });
        return x;
      }
      const childXs = kids.map((k) => place(k, depth + 1));
      const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
      positions.set(id, { slotX: x, depth, hasChildren: true, expanded: true });
      return x;
    }

    place(rootId, 0);

    // convert to px
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    positions.forEach((p) => {
      p.x = p.slotX * SLOT;
      p.y = p.depth * ROW_H;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    contentBounds = { minX, maxX: maxX + NODE_W, minY, maxY: maxY + 120 };
    return visibleIds;
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function memberLabel(m) {
    const L = lang();
    return m.name ? (m.name[L] || m.name.ar) : '?';
  }

  function render() {
    const visibleIds = computeLayout();
    const L = lang();

    // pad canvas so negative slotX (centered nodes) still show — offset all by -minX
    const offsetX = -contentBounds.minX + 40;
    const offsetY = 40;
    canvas.style.width = (contentBounds.maxX - contentBounds.minX + 80) + 'px';
    canvas.style.height = (contentBounds.maxY - contentBounds.minY + 80) + 'px';
    linksSvg.setAttribute('width', canvas.style.width);
    linksSvg.setAttribute('height', canvas.style.height);

    const existingNodes = new Map();
    canvas.querySelectorAll('.tree-node').forEach((el) => existingNodes.set(el.dataset.id, el));
    const keep = new Set();

    visibleIds.forEach((id) => {
      const m = byId.get(id);
      const pos = positions.get(id);
      const px = pos.x + offsetX;
      const py = pos.y + offsetY;
      keep.add(id);

      let el = existingNodes.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tree-node';
        el.dataset.id = id;
        el.innerHTML = `
          <div class="tree-node__avatar"><img alt=""></div>
          <div class="tree-node__name"></div>
          <div class="tree-node__branch"></div>
        `;
        el.addEventListener('click', (e) => {
          if (e.target.closest('.tree-node__toggle')) return;
          onNodeClick(id);
        });
        canvas.appendChild(el);
      }
      el.style.left = px + 'px';
      el.style.top = py + 'px';
      el.querySelector('.tree-node__name').textContent = memberLabel(m);
      const branchEl = el.querySelector('.tree-node__branch');
      branchEl.textContent = m.branch ? m.branch[L] : '';
      const img = el.querySelector('img');
      img.dataset.name = memberLabel(m);
      if (!img.dataset.avatarBound) FamilyAvatar.lazyMount(img);

      el.classList.toggle('is-root', id === rootId);
      el.classList.toggle('is-selected', id === selectedId && !compareMode);
      el.classList.toggle('is-compare-a', id === compareA);
      el.classList.toggle('is-compare-b', id === compareB);
      el.classList.toggle('is-dimmed', branchFilter !== 'all' && m.branchId !== branchFilter && m.branchId !== 'root' && !isDescendantOfBranch(id));

      // toggle button
      let toggleBtn = el.querySelector('.tree-node__toggle');
      if (pos.hasChildren) {
        if (!toggleBtn) {
          toggleBtn = document.createElement('button');
          toggleBtn.className = 'tree-node__toggle';
          toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleNode(id); });
          el.appendChild(toggleBtn);
        }
        toggleBtn.textContent = pos.expanded ? '−' : '+';
      } else if (toggleBtn) {
        toggleBtn.remove();
      }
    });

    // remove nodes no longer visible
    existingNodes.forEach((el, id) => { if (!keep.has(id)) el.remove(); });

    renderLinks(visibleIds, offsetX, offsetY);
    renderMinimap(visibleIds, offsetX, offsetY);
    applyTransform();
  }

  function isDescendantOfBranch(id) {
    return false; // branchId already inherited to all descendants at data build time
  }

  function renderLinks(visibleIds, offsetX, offsetY) {
    linksSvg.innerHTML = '';
    const highlightSet = currentPathSet();
    visibleIds.forEach((id) => {
      const m = byId.get(id);
      const pos = positions.get(id);
      if (!pos.expanded) return;
      (m.children || []).forEach((childId) => {
        const cpos = positions.get(childId);
        if (!cpos) return;
        const x1 = pos.x + offsetX + NODE_W / 2;
        const y1 = pos.y + offsetY + 96;
        const x2 = cpos.x + offsetX + NODE_W / 2;
        const y2 = cpos.y + offsetY + 6;
        const midY = (y1 + y2) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`);
        if (highlightSet.has(id) && highlightSet.has(childId)) path.classList.add('is-highlighted');
        linksSvg.appendChild(path);
      });
    });
  }

  let lastPath = [];
  function currentPathSet() { return new Set(lastPath); }

  // ---------------------------------------------------------------------
  // Minimap
  // ---------------------------------------------------------------------
  function renderMinimap(visibleIds, offsetX, offsetY) {
    const mm = document.getElementById('minimap-canvas');
    if (!mm) return;
    const ctx = mm.getContext('2d');
    ctx.clearRect(0, 0, mm.width, mm.height);
    const contentW = contentBounds.maxX - contentBounds.minX + 80;
    const contentH = contentBounds.maxY - contentBounds.minY + 80;
    const sx = mm.width / contentW, sy = mm.height / contentH;
    const s = Math.min(sx, sy);

    ctx.fillStyle = 'rgba(200,162,77,0.7)';
    visibleIds.forEach((id) => {
      const pos = positions.get(id);
      const x = (pos.x + offsetX) * s;
      const y = (pos.y + offsetY) * s;
      ctx.fillRect(x, y, 3, 3);
    });

    // viewport rect
    const stageRect = stage.getBoundingClientRect();
    const viewX = (-tx / scale) * s;
    const viewY = (-ty / scale) * s;
    const viewW = (stageRect.width / scale) * s;
    const viewH = (stageRect.height / scale) * s;
    ctx.strokeStyle = '#e6c477';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(viewX, viewY, viewW, viewH);
  }

  // ---------------------------------------------------------------------
  // Pan / zoom
  // ---------------------------------------------------------------------
  function applyTransform(animated) {
    viewport.style.transition = animated ? 'transform 0.6s var(--ease-luxury)' : 'none';
    viewport.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    requestAnimationFrame(() => { renderMinimapViewportOnly(); });
  }

  function renderMinimapViewportOnly() {
    const mm = document.getElementById('minimap-canvas');
    if (!mm) return;
    // cheap: re-run full minimap render only for the viewport rect by re-invoking full render is wasteful;
    // acceptable at this scale (a few hundred px rects), so just re-render fully.
    const visibleIds = [...positions.keys()];
    const offsetX = -contentBounds.minX + 40, offsetY = 40;
    renderMinimap(visibleIds, offsetX, offsetY);
  }

  function centerOn(id, opts) {
    opts = opts || {};
    render();
    const pos = positions.get(id);
    if (!pos) return;
    const offsetX = -contentBounds.minX + 40, offsetY = 40;
    const px = pos.x + offsetX + NODE_W / 2;
    const py = pos.y + offsetY + 60;
    const stageRect = stage.getBoundingClientRect();
    const targetScale = opts.scale || Math.min(Math.max(scale, 0.8), 1.1);
    tx = stageRect.width / 2 - px * targetScale;
    ty = stageRect.height / 2 - py * targetScale;
    scale = targetScale;
    applyTransform(true);
    flashNode(id);
  }

  function flashNode(id) {
    const el = canvas.querySelector(`.tree-node[data-id="${id}"]`);
    if (!el) return;
    el.classList.add('is-selected');
    el.animate([
      { boxShadow: '0 0 0 8px rgba(230,196,119,0.5)' },
      { boxShadow: '0 0 0 0 rgba(230,196,119,0)' },
    ], { duration: 900, easing: 'ease-out' });
  }

  function zoomBy(factor, center) {
    const stageRect = stage.getBoundingClientRect();
    const cx = center ? center.x : stageRect.width / 2;
    const cy = center ? center.y : stageRect.height / 2;
    const newScale = Math.min(Math.max(scale * factor, 0.25), 2.4);
    const worldX = (cx - tx) / scale;
    const worldY = (cy - ty) / scale;
    tx = cx - worldX * newScale;
    ty = cy - worldY * newScale;
    scale = newScale;
    applyTransform(false);
  }

  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.25));
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(0.8));
  document.getElementById('zoom-reset').addEventListener('click', () => centerOn(rootId, { scale: 1 }));

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.12 : 0.9, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, { passive: false });

  let isPanning = false, panStart = { x: 0, y: 0 }, panOrigin = { x: 0, y: 0 };
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tree-node') || e.target.closest('button')) return;
    isPanning = true;
    stage.classList.add('is-grabbing');
    viewport.classList.add('is-panning');
    panStart = { x: e.clientX, y: e.clientY };
    panOrigin = { x: tx, y: ty };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    tx = panOrigin.x + (e.clientX - panStart.x);
    ty = panOrigin.y + (e.clientY - panStart.y);
    applyTransform(false);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
    stage.addEventListener(evt, () => {
      isPanning = false;
      stage.classList.remove('is-grabbing');
      viewport.classList.remove('is-panning');
    });
  });

  // node dragging (individual node reposition — visual only, snaps back on next render)
  // Intentionally omitted: with an auto-computed tidy layout, free-dragging a single
  // node would immediately be overwritten by re-layout; pan handles repositioning the view instead.

  // ---------------------------------------------------------------------
  // Interaction: node click / toggle / modal / compare
  // ---------------------------------------------------------------------
  function toggleNode(id) {
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    render();
  }

  function onNodeClick(id) {
    if (compareMode) {
      pickForCompare(id);
    } else {
      selectedId = id;
      render();
      openProfileModal(id);
    }
  }

  document.getElementById('expand-all-btn').addEventListener('click', () => {
    members.forEach((m) => expanded.add(m.id));
    render();
  });
  document.getElementById('collapse-all-btn').addEventListener('click', () => {
    expanded.clear();
    members.forEach((m) => { if ((m.generation || 1) <= 3) expanded.add(m.id); });
    render();
    centerOn(rootId, { scale: 1 });
  });

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------
  function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (!q) { searchResults.classList.remove('is-open'); return; }
    const L = lang();
    const matches = members.filter((m) => (m.name[L] || m.name.ar || '').includes(q) || (m.name.ar || '').includes(q)).slice(0, 8);
    if (!matches.length) {
      searchResults.innerHTML = `<div class="search-empty">${L === 'ar' ? 'لا توجد نتائج' : 'No results found'}</div>`;
    } else {
      searchResults.innerHTML = matches.map((m) => `
        <div class="search-result-item" data-id="${m.id}">
          <img src="${FamilyAvatar.makeAvatar(memberLabel(m), { size: 40 })}" alt="" style="width:32px;height:32px;border-radius:50%;">
          <span>${highlightMatch(memberLabel(m), q)}</span>
          <span class="tag" style="margin-inline-start:auto;">${m.branch ? m.branch[L] : ''}</span>
        </div>`).join('');
    }
    searchResults.classList.add('is-open');
  });

  searchResults.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (!item) return;
    const id = item.dataset.id;
    expandAncestors(id);
    selectedId = id;
    searchResults.classList.remove('is-open');
    searchInput.value = '';
    centerOn(id);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) searchResults.classList.remove('is-open');
  });

  branchSelect.addEventListener('change', () => {
    branchFilter = branchSelect.value;
    render();
  });

  // ---------------------------------------------------------------------
  // Relationship viewer (comparison mode)
  // ---------------------------------------------------------------------
  const relationViewer = document.getElementById('relation-viewer');
  const compareToggleBtn = document.getElementById('compare-toggle');
  const slotA = document.getElementById('slot-a');
  const slotB = document.getElementById('slot-b');
  const relationResult = document.getElementById('relation-result');
  const relationPath = document.getElementById('relation-path');

  compareToggleBtn.addEventListener('click', () => {
    compareMode = !compareMode;
    compareToggleBtn.classList.toggle('is-active', compareMode);
    if (compareMode) {
      relationViewer.classList.add('is-open');
    } else {
      compareA = compareB = null;
      lastPath = [];
      relationViewer.classList.remove('is-open');
      render();
    }
  });
  document.getElementById('relation-close').addEventListener('click', () => compareToggleBtn.click());

  function pickForCompare(id) {
    if (compareA === id) { compareA = null; }
    else if (compareB === id) { compareB = null; }
    else if (!compareA) { compareA = id; }
    else if (!compareB) { compareB = id; }
    else { compareA = id; compareB = null; }

    const L = lang();
    slotA.innerHTML = compareA ? memberChip(compareA, L) : (L === 'ar' ? 'اختر الفرد الأول' : 'Select the first person');
    slotB.innerHTML = compareB ? memberChip(compareB, L) : (L === 'ar' ? 'اختر الفرد الثاني' : 'Select the second person');

    if (compareA && compareB) {
      computeAndShowRelation(compareA, compareB);
    } else {
      relationResult.textContent = '';
      relationPath.innerHTML = '';
      lastPath = [];
    }
    render();
  }

  function memberChip(id, L) {
    const m = byId.get(id);
    return `<img src="${FamilyAvatar.makeAvatar(memberLabel(m), { size: 40 })}" alt=""><span>${memberLabel(m)}</span>`;
  }

  const DESCENDANT_AR = ['', 'ابنه', 'حفيده', 'ابن حفيده', 'حفيد حفيده', 'حفيد حفيد حفيده'];
  const DESCENDANT_EN = ['', 'son', 'grandson', 'great-grandson', '2nd great-grandson', '3rd great-grandson'];
  const COUSIN_ORDINAL_AR = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'];
  const COUSIN_ORDINAL_EN = ['', '1st', '2nd', '3rd', '4th', '5th'];

  function computeRelationship(idA, idB) {
    if (idA === idB) return { key: 'same' };
    const chainA = ancestorChain(idA);
    const chainB = ancestorChain(idB);
    let i = 0;
    while (i < chainA.length && i < chainB.length && chainA[i] === chainB[i]) i++;
    const lcaIndex = i - 1;
    const lca = chainA[lcaIndex];
    const dA = chainA.length - 1 - lcaIndex;
    const dB = chainB.length - 1 - lcaIndex;
    const path = chainA.slice(lcaIndex).reverse().concat(chainB.slice(lcaIndex + 1));
    return { key: 'related', dA, dB, lca, path };
  }

  function computeAndShowRelation(idA, idB) {
    const L = lang();
    const rel = computeRelationship(idA, idB);
    let text = '';
    if (rel.key === 'same') {
      text = L === 'ar' ? 'نفس الشخص' : 'Same person';
      lastPath = [idA];
    } else {
      const { dA, dB, path } = rel;
      lastPath = path;
      if (dA === 0) {
        text = L === 'ar'
          ? `${memberLabel(byId.get(idB))} هو ${DESCENDANT_AR[dB] || 'أحد ذريته'} لـ ${memberLabel(byId.get(idA))}`
          : `${memberLabel(byId.get(idB))} is the ${DESCENDANT_EN[dB] || 'descendant'} of ${memberLabel(byId.get(idA))}`;
      } else if (dB === 0) {
        text = L === 'ar'
          ? `${memberLabel(byId.get(idA))} هو ${DESCENDANT_AR[dA] || 'أحد ذريته'} لـ ${memberLabel(byId.get(idB))}`
          : `${memberLabel(byId.get(idA))} is the ${DESCENDANT_EN[dA] || 'descendant'} of ${memberLabel(byId.get(idB))}`;
      } else if (dA === 1 && dB === 1) {
        text = L === 'ar' ? 'أخوان (إخوة)' : 'Siblings';
      } else if ((dA === 1 && dB === 2) || (dA === 2 && dB === 1)) {
        const uncle = dA === 1 ? idA : idB;
        const nephew = dA === 1 ? idB : idA;
        text = L === 'ar'
          ? `${memberLabel(byId.get(uncle))} هو عمّ ${memberLabel(byId.get(nephew))}`
          : `${memberLabel(byId.get(uncle))} is the uncle of ${memberLabel(byId.get(nephew))}`;
      } else {
        const degree = Math.min(dA, dB) - 1;
        const removed = Math.abs(dA - dB);
        const ord = L === 'ar' ? (COUSIN_ORDINAL_AR[degree] || `من الدرجة ${degree}`) : (COUSIN_ORDINAL_EN[degree] || `${degree}th`);
        text = L === 'ar'
          ? `ابنا عمّ ${ord}${removed ? ` (بفارق ${removed} جيل)` : ''}`
          : `${ord} cousins${removed ? ` (${removed}x removed)` : ''}`;
      }
    }
    relationResult.textContent = text;
    relationPath.innerHTML = lastPath.map((id) => `<span>${memberLabel(byId.get(id))}</span>`).join('');
    expandAncestors(idA);
    expandAncestors(idB);
    render();
  }

  // ---------------------------------------------------------------------
  // Member profile modal
  // ---------------------------------------------------------------------
  const modalOverlay = document.getElementById('member-modal');
  const modalContent = document.getElementById('member-modal-content');

  function openProfileModal(id) {
    const m = byId.get(id);
    const L = lang();
    const avatarSrc = FamilyAvatar.makeAvatar(memberLabel(m), { size: 220 });

    const parentsChips = (m.parents || []).map((pid) => byId.has(pid) ? `<span class="relation-chip" data-goto="${pid}">${memberLabel(byId.get(pid))}</span>` : '').join('') || emptyChip(L, 'parents');
    const childrenChips = (m.children || []).map((cid) => `<span class="relation-chip" data-goto="${cid}">${memberLabel(byId.get(cid))}</span>`).join('') || emptyChip(L, 'children');

    const bio = m.bio && m.bio[L] ? m.bio[L] : '';
    const birthPlace = m.birthPlace ? m.birthPlace[L] : null;
    const years = (m.birthYear || m.deathYear) ? `${m.birthYear || '?'}${m.deathYear ? ' – ' + m.deathYear : ''}` : null;

    modalContent.innerHTML = `
      <div class="member-profile__header">
        <div class="member-profile__avatar"><img src="${avatarSrc}" alt="${memberLabel(m)}"></div>
        <div>
          <h2 class="member-profile__name">${memberLabel(m)}</h2>
          <div class="member-profile__meta">
            ${years ? `<span class="ltr-nums">${years}</span> · ` : ''}
            ${birthPlace || (L === 'ar' ? 'مكان الميلاد غير موثّق' : 'Birthplace not documented')}
            ${m.alive === false ? ` · ${L === 'ar' ? 'متوفى' : 'Deceased'}` : ''}
          </div>
          ${m.branch ? `<span class="member-profile__branch">${m.branch[L]}</span>` : ''}
        </div>
      </div>
      <div class="member-profile__body">
        <div>
          <h3 class="heading-sm" style="font-size:1rem;margin-block-end:0.5rem;">${L === 'ar' ? 'نبذة' : 'Biography'}</h3>
          ${bio
            ? `<p class="member-profile__bio">${bio}</p>`
            : `<p class="member-profile__bio">${L === 'ar' ? 'لم تتم إضافة نبذة لهذا الفرد بعد.' : 'No biography has been added for this member yet.'}
               <a href="suggestions.html" class="text-gold">${L === 'ar' ? 'أضف معلومة' : 'Add information'}</a></p>`}
        </div>
        <div>
          <h3 class="heading-sm" style="font-size:1rem;margin-block-end:0.5rem;">${L === 'ar' ? 'الوالد' : 'Parent'}</h3>
          <div class="relation-list">${parentsChips}</div>
        </div>
        <div>
          <h3 class="heading-sm" style="font-size:1rem;margin-block-end:0.5rem;">${L === 'ar' ? 'الأبناء' : 'Children'} (${(m.children || []).length})</h3>
          <div class="relation-list">${childrenChips}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
          <div class="qr-block">
            <canvas id="member-qr"></canvas>
            <div>
              <div style="font-size:0.85rem;color:var(--text-on-dark-soft);">${L === 'ar' ? 'رمز سريع لهذا الفرد' : 'Quick code for this member'}</div>
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button class="btn btn--outline btn--sm" id="modal-center-btn">${L === 'ar' ? 'توسيط في الشجرة' : 'Center in Tree'}</button>
            <button class="btn btn--gold btn--sm" id="modal-compare-btn">${L === 'ar' ? 'استخدم في المقارنة' : 'Use in Comparison'}</button>
          </div>
        </div>
      </div>
    `;

    modalContent.querySelectorAll('[data-goto]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const gid = chip.dataset.goto;
        closeModal();
        expandAncestors(gid);
        selectedId = gid;
        centerOn(gid);
      });
    });
    modalContent.querySelector('#modal-center-btn').addEventListener('click', () => { closeModal(); centerOn(id); });
    modalContent.querySelector('#modal-compare-btn').addEventListener('click', () => {
      closeModal();
      if (!compareMode) compareToggleBtn.click();
      pickForCompare(id);
    });

    try {
      const qrCanvas = modalContent.querySelector('#member-qr');
      const url = `${location.origin}${location.pathname}?focus=${id}`;
      QRCode.renderToCanvas(qrCanvas, url, { scale: 3, quiet: 2 });
    } catch (e) { /* text too long or unsupported — silently skip */ }

    modalOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function emptyChip(L, kind) {
    const msg = kind === 'parents'
      ? (L === 'ar' ? 'غير معروف' : 'Unknown')
      : (L === 'ar' ? 'لا يوجد أبناء مسجّلون' : 'No children recorded');
    return `<span class="relation-chip" style="cursor:default;">${msg}</span>`;
  }

  function closeModal() {
    modalOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // ---------------------------------------------------------------------
  // Print outline (nested list — the interactive canvas prints poorly)
  // ---------------------------------------------------------------------
  function buildPrintOutline() {
    const container = document.getElementById('print-outline-content');
    const L = lang();
    function renderNode(id) {
      const m = byId.get(id);
      const kids = m.children || [];
      return `<li>${memberLabel(m)}${kids.length ? `<ul>${kids.map(renderNode).join('')}</ul>` : ''}</li>`;
    }
    container.innerHTML = `<ul>${renderNode(rootId)}</ul>`;
  }

  document.getElementById('print-btn').addEventListener('click', () => window.print());

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  loadData();
  document.addEventListener('langchange', () => {
    if (!rootId) return; // data still loading — initial loadData() will render once ready
    populateBranchFilter();
    render();
    buildPrintOutline();
    // the i18n sweep just reset slot-a/slot-b to placeholder text; restore any active selection
    const L = lang();
    if (compareA) slotA.innerHTML = memberChip(compareA, L);
    if (compareB) slotB.innerHTML = memberChip(compareB, L);
    if (compareA && compareB) computeAndShowRelation(compareA, compareB);
  });
  window.addEventListener('resize', () => renderMinimapViewportOnly());
})();
