/**
 * tree-print.js — lays out the ENTIRE family tree (all 395 members, every
 * generation, nothing collapsed) onto one poster sized in real physical
 * `cm` units — 200×100cm exactly — so a print shop can output it at that
 * literal size with no scaling guesswork. On screen the poster is shown
 * at true size (huge) inside a scrollable frame; @media print in
 * tree-print.html locks the page size to match via `@page { size: 200cm
 * 100cm }`. Layout reuses the same no-overlap slot-assignment idea as the
 * interactive tree (tree.js computeLayout): each leaf claims the next
 * slot, each parent sits at the average slot of its children — except
 * here every node is always "expanded" since the whole point is to show
 * everyone.
 */
(function () {
  'use strict';

  const POSTER_W = 200; // cm
  const POSTER_H = 100; // cm
  const HEADER_H = 9;   // cm
  const FOOTER_H = 6.5; // cm
  const MARGIN_X = 4;   // cm, left/right breathing room

  const BRANCH_COLORS = { root: '#c8a24d' };
  const PALETTE = ['#235f45', '#1e3a52', '#8f6d24', '#6b3f2a'];

  function colorForBranch(branchId) {
    if (!branchId || branchId === 'root') return BRANCH_COLORS.root;
    if (!BRANCH_COLORS[branchId]) {
      BRANCH_COLORS[branchId] = PALETTE[Object.keys(BRANCH_COLORS).length % PALETTE.length];
    }
    return BRANCH_COLORS[branchId];
  }

  async function build() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    const members = data.members;
    const byId = new Map(members.map((m) => [m.id, m]));
    const rootId = data.meta.founderId;

    // ---- slot layout (same recursive idea as the interactive tree) ----
    const slotX = new Map();
    let cursor = 0;
    let maxGen = 1;
    function place(id) {
      const node = byId.get(id);
      maxGen = Math.max(maxGen, node.generation || 1);
      const kids = node.children || [];
      if (kids.length === 0) {
        slotX.set(id, cursor);
        cursor += 1;
        return cursor - 1;
      }
      const xs = kids.map(place);
      const x = (xs[0] + xs[xs.length - 1]) / 2;
      slotX.set(id, x);
      return x;
    }
    place(rootId);
    const totalSlots = cursor;

    const usableW = POSTER_W - MARGIN_X * 2;
    const rowH = (POSTER_H - HEADER_H - FOOTER_H) / maxGen;
    const posOf = (id) => {
      const m = byId.get(id);
      return {
        x: MARGIN_X + (slotX.get(id) + 0.5) * (usableW / totalSlots),
        y: HEADER_H + ((m.generation || 1) - 0.5) * rowH,
      };
    };

    // ---- links ----
    const svg = document.getElementById('poster-links');
    const linkFrag = document.createDocumentFragment();
    members.forEach((m) => {
      (m.children || []).forEach((cid) => {
        const p1 = posOf(m.id), p2 = posOf(cid);
        const midY = (p1.y + p2.y) / 2;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${p1.x},${p1.y} C${p1.x},${midY} ${p2.x},${midY} ${p2.x},${p2.y}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(43,32,19,0.35)');
        path.setAttribute('stroke-width', '0.035cm');
        linkFrag.appendChild(path);
      });
    });
    svg.setAttribute('viewBox', `0 0 ${POSTER_W} ${POSTER_H}`);
    svg.appendChild(linkFrag);

    // ---- nodes ----
    const nodesEl = document.getElementById('poster-nodes');
    const nodeFrag = document.createDocumentFragment();
    members.forEach((m) => {
      const p = posOf(m.id);
      const el = document.createElement('div');
      el.className = 'p-node' + (m.id === rootId ? ' p-node--root' : '');
      el.style.left = p.x + 'cm';
      el.style.top = p.y + 'cm';
      const dot = document.createElement('div');
      dot.className = 'p-node__dot';
      dot.style.background = colorForBranch(m.branchId);
      const label = document.createElement('div');
      label.className = 'p-node__label';
      label.textContent = m.name.ar;
      el.appendChild(dot);
      el.appendChild(label);
      nodeFrag.appendChild(el);
    });
    nodesEl.appendChild(nodeFrag);

    // ---- header / legend / footer ----
    const alive = members.filter((m) => m.alive).length;
    document.getElementById('poster-subtitle').textContent =
      `${members.length} فردًا عبر ${maxGen} أجيال — ${alive} على قيد الحياة`;

    const branches = new Map();
    members.forEach((m) => {
      if (m.branchId && m.branchId !== 'root' && !branches.has(m.branchId)) branches.set(m.branchId, m.branch.ar);
    });
    const legend = document.getElementById('poster-legend');
    legend.innerHTML = [`<span class="p-legend__item"><span class="p-legend__dot" style="background:${BRANCH_COLORS.root}"></span> الجذر الأول</span>`]
      .concat([...branches.entries()].map(([id, label]) => `<span class="p-legend__item"><span class="p-legend__dot" style="background:${colorForBranch(id)}"></span> ${label}</span>`))
      .join('');

    document.getElementById('poster-date').textContent = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    const qrCanvas = document.getElementById('poster-qr');
    if (window.QRCode && qrCanvas) {
      QRCode.renderToCanvas(qrCanvas, location.origin + location.pathname.replace('tree-print.html', 'tree.html'), { scale: 3, quiet: 2 });
    }

    // ---- fit-to-screen preview scale ----
    // `zoom` (unlike transform: scale) actually shrinks the element's
    // layout footprint, so the scroll container sizes itself to the
    // shrunk poster instead of the full unscaled 200cm canvas.
    function fitScale() {
      const CM_PX = 37.795; // px per cm at 96dpi — preview only, print uses real cm
      const wrapper = document.getElementById('poster-wrapper');
      const available = Math.min(window.innerWidth * 0.92, 1600);
      const scale = available / (POSTER_W * CM_PX);
      wrapper.style.zoom = scale;
    }
    fitScale();
    window.addEventListener('resize', fitScale);
  }

  document.getElementById('do-print').addEventListener('click', () => window.print());
  build();
})();
