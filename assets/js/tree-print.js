/**
 * tree-print.js — renders the ENTIRE family tree (all 395 members, every
 * generation) as a single artistic "olive tree" poster: a trunk that
 * begins at the top as roots breaking through cracked earth, flowing
 * down into tapered organic branches, with every person shown as an
 * olive-shaped capsule holding their name in horizontal text, and small
 * leaves scattered along the branches.
 *
 * Engineering note on "organic vs. correct": true unconstrained
 * force-directed placement can't guarantee zero overlaps/crossings for a
 * real 395-person, 9-generation dataset with strictly horizontal
 * (non-rotated) readable text — the physical space just isn't there at
 * small sizes, and this is a real family record, not abstract art, so
 * correctness isn't negotiable. The layout is therefore still generation
 * -ordered and collision-safe by construction (same no-overlap slot
 * algorithm as the interactive tree), but every visual element on top —
 * branch curve shape, thickness, olive rotation, leaf placement — is
 * seeded-random per node, so nothing repeats or lines up like a grid.
 *
 * Everything is built as native SVG (not HTML) so it stays true vector
 * quality at any print size.
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Poster is 400x200 "cm" — the <svg viewBox> is 1 unit = 1cm exactly.
  const W = 400, H = 200;
  const MARGIN_X = 10;
  const HEADER_H = 30;   // roots + cracked earth + title live in here
  const FOOTER_H = 11;

  // ---- seeded PRNG (deterministic per node id, so re-renders are stable) ----
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(id, salt) { return mulberry32(hashStr(id + '|' + (salt || ''))); }

  function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---- palette ----
  const BARK = { dark: '#4a3826', mid: '#6b5238', light: '#8a6c47' };
  const OLIVE_BRANCH_TINT = {
    root: ['#3d5c3a', '#274023'],
    b0: ['#4a6b46', '#2e4a2b'],
    b1: ['#5a6b3a', '#3a4523'],
    b2: ['#41603f', '#28402a'],
  };
  const GOLD = { light: '#e6c477', mid: '#c8a24d', dark: '#8f6d24' };

  async function build() {
    const data = await DataLoader.loadJSON('assets/data/family.json');
    if (!data) return;
    // Wait for the Cairo webfont to finish loading before doing ANY
    // text-width measurement (getComputedTextLength for olive shrink-to-
    // fit and the legend) — measuring against a fallback font, then
    // painting with the real (wider) Arabic font once it swaps in,
    // silently produces text that overflows its measured box.
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* ignore */ }
    }
    const members = data.members;
    const byId = new Map(members.map((m) => [m.id, m]));
    const rootId = data.meta.founderId;

    // ---- descendant counts (for branch weight / thickness) ----
    const descCount = new Map();
    function countDesc(id) {
      if (descCount.has(id)) return descCount.get(id);
      const kids = byId.get(id).children || [];
      let c = kids.length;
      kids.forEach((k) => { c += countDesc(k); });
      descCount.set(id, c);
      return c;
    }
    countDesc(rootId);
    const maxDesc = descCount.get(rootId) || 1;

    // ---- leaf-slot layout (same no-overlap idea as the interactive tree),
    // but with per-leaf weighted width so columns aren't perfectly even ----
    const slotWeight = new Map();
    const slotX = new Map(); // weighted-slot centers, 0..totalWeight
    let cursor = 0;
    let maxGen = 1;
    function place(id) {
      const node = byId.get(id);
      maxGen = Math.max(maxGen, node.generation || 1);
      const kids = node.children || [];
      if (kids.length === 0) {
        const w = 0.75 + rngFor(id, 'w')() * 0.5; // 0.75–1.25
        slotWeight.set(id, w);
        const x = cursor + w / 2;
        cursor += w;
        slotX.set(id, x);
        return x;
      }
      const xs = kids.map(place);
      const x = (xs[0] + xs[xs.length - 1]) / 2;
      slotX.set(id, x);
      return x;
    }
    place(rootId);
    const totalWeight = cursor;

    const usableW = W - MARGIN_X * 2;
    const rowH = (H - HEADER_H - FOOTER_H) / maxGen;

    const pos = new Map(); // id -> {x, y}
    members.forEach((m) => {
      const rng = rngFor(m.id, 'pos');
      const baseX = MARGIN_X + (slotX.get(m.id) / totalWeight) * usableW;
      const baseY = HEADER_H + ((m.generation || 1) - 0.5) * rowH;
      const jitterX = (rng() - 0.5) * Math.min(1.1, (usableW / totalWeight) * 0.35);
      const jitterY = (rng() - 0.5) * rowH * 0.3;
      pos.set(m.id, { x: baseX + jitterX, y: baseY + jitterY });
    });

    // ================= SVG scaffold =================
    const svg = document.getElementById('poster');
    svg.innerHTML = '';
    const defs = el('defs');
    svg.appendChild(defs);

    // paper grain filter — subtle, fine speckle only (not a color wash)
    const grain = el('filter', { id: 'grain', x: '-5%', y: '-5%', width: '110%', height: '110%' });
    grain.innerHTML = `
      <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.22  0 0 0 0 0.17  0 0 0 0 0.1  0 0 0 0.5 0" result="tinted"/>
      <feComponentTransfer in="tinted" result="grain"><feFuncA type="linear" slope="0.05"/></feComponentTransfer>
      <feComposite in="grain" in2="SourceGraphic" operator="over"/>`;
    defs.appendChild(grain);

    const shadow = el('filter', { id: 'softShadow', x: '-40%', y: '-40%', width: '180%', height: '180%' });
    shadow.innerHTML = `
      <feDropShadow dx="0.06" dy="0.1" stdDeviation="0.09" flood-color="#2b2013" flood-opacity="0.35"/>`;
    defs.appendChild(shadow);

    // bark gradient
    const barkGrad = el('linearGradient', { id: 'barkGrad', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
    barkGrad.innerHTML = `<stop offset="0%" stop-color="${BARK.dark}"/><stop offset="55%" stop-color="${BARK.mid}"/><stop offset="100%" stop-color="${OLIVE_BRANCH_TINT.b0[0]}"/>`;
    defs.appendChild(barkGrad);

    // olive gradients (root + two branch tints)
    Object.entries(OLIVE_BRANCH_TINT).forEach(([key, [lightC, darkC]]) => {
      const g = el('radialGradient', { id: `olive-${key}`, cx: '38%', cy: '32%', r: '75%' });
      g.innerHTML = `<stop offset="0%" stop-color="${lightC}"/><stop offset="55%" stop-color="${lightC}"/><stop offset="100%" stop-color="${darkC}"/>`;
      defs.appendChild(g);
    });
    const goldGrad = el('radialGradient', { id: 'olive-gold', cx: '38%', cy: '30%', r: '75%' });
    goldGrad.innerHTML = `<stop offset="0%" stop-color="${GOLD.light}"/><stop offset="55%" stop-color="${GOLD.mid}"/><stop offset="100%" stop-color="${GOLD.dark}"/>`;
    defs.appendChild(goldGrad);

    const bgGrad = el('linearGradient', { id: 'bgGrad', x1: '0%', y1: '0%', x2: '60%', y2: '100%' });
    bgGrad.innerHTML = `<stop offset="0%" stop-color="#faf5e8"/><stop offset="100%" stop-color="#f1e6c9"/>`;
    defs.appendChild(bgGrad);

    // ---- background ----
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#bgGrad)' }));
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: 'none', filter: 'url(#grain)' }));

    const gBranches = el('g', { id: 'g-branches' });
    const gLeaves = el('g', { id: 'g-leaves' });
    const gOlives = el('g', { id: 'g-olives' });
    const gChrome = el('g', { id: 'g-chrome' });

    // ================= branch geometry helpers =================
    function branchWidth(id) {
      const w = Math.sqrt(descCount.get(id) / maxDesc);
      return 0.12 + w * 3.2;
    }
    function tintFor(m) {
      if (m.id === rootId) return 'gold';
      if (!m.branchId || m.branchId === 'root') return 'root';
      const idx = m.branchId === 'b0' ? 'b0' : m.branchId === 'b1' ? 'b1' : 'b2';
      return idx;
    }

    function drawBranch(parentPos, childPos, wParent, wChild, seedId) {
      const rng = rngFor(seedId, 'branch');
      const midY = (parentPos.y + childPos.y) / 2 + (rng() - 0.5) * 4;
      const bow = (rng() - 0.5) * 6; // organic sideways bow, never identical
      const cx1 = parentPos.x + bow * 0.3, cy1 = midY - (midY - parentPos.y) * 0.3;
      const cx2 = childPos.x + bow, cy2 = midY;

      // centerline as cubic bezier; build a tapered filled ribbon by
      // offsetting perpendicular to the approximate direction at each end
      const dx = childPos.x - parentPos.x, dy = childPos.y - parentPos.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const hp = wParent / 2, hc = wChild / 2;

      const p1x = parentPos.x + nx * hp, p1y = parentPos.y + ny * hp;
      const p2x = parentPos.x - nx * hp, p2y = parentPos.y - ny * hp;
      const c1x = childPos.x + nx * hc, c1y = childPos.y + ny * hc;
      const c2x = childPos.x - nx * hc, c2y = childPos.y - ny * hc;

      const d = `M${p1x},${p1y} C${cx1 + nx * hp},${cy1 + ny * hp} ${cx2 + nx * hc},${cy2 + ny * hc} ${c1x},${c1y}
                 L${c2x},${c2y} C${cx2 - nx * hc},${cy2 - ny * hc} ${cx1 - nx * hp},${cy1 - ny * hp} ${p2x},${p2y} Z`;
      const path = el('path', { d, fill: 'url(#barkGrad)' });
      gBranches.appendChild(path);

      // occasional bark crack texture on thicker branches
      if (wParent > 1.3 && rng() > 0.4) {
        const cx = (parentPos.x + childPos.x) / 2 + (rng() - 0.5) * len * 0.3;
        const cy = (parentPos.y + childPos.y) / 2 + (rng() - 0.5) * 3;
        const crack = el('path', {
          d: `M${cx - 1.5},${cy - 1} Q${cx + (rng() - 0.5) * 2},${cy} ${cx + 1.5},${cy + 1.2}`,
          stroke: BARK.dark, 'stroke-width': 0.05, fill: 'none', opacity: 0.35,
        });
        gBranches.appendChild(crack);
      }
    }

    function drawLeaf(x, y, seed) {
      const rng = rngFor(seed, 'leaf' + x.toFixed(1) + y.toFixed(1));
      const scale = 0.55 + rng() * 0.6;
      const rot = rng() * 360;
      const lx = 1.1 * scale, ly = 0.4 * scale;
      const tint = rng() > 0.5 ? OLIVE_BRANCH_TINT.b0[0] : OLIVE_BRANCH_TINT.b1[0];
      const leaf = el('path', {
        d: `M${-lx},0 Q0,${-ly} ${lx},0 Q0,${ly} ${-lx},0 Z`,
        fill: tint,
        opacity: 0.55 + rng() * 0.3,
        transform: `translate(${x},${y}) rotate(${rot})`,
      });
      gLeaves.appendChild(leaf);
    }

    // ---- draw every parent→child branch + scattered leaves ----
    members.forEach((m) => {
      const p1 = pos.get(m.id);
      (m.children || []).forEach((cid) => {
        const p2 = pos.get(cid);
        const wc = branchWidth(cid);
        const wp = Math.max(wc * 1.15, branchWidth(m.id) * 0.55);
        drawBranch(p1, p2, wp, wc, cid);

        // leaves along thinner (twiggier) branches, denser near actual leaf nodes
        const child = byId.get(cid);
        const isTwig = (child.children || []).length === 0;
        const leafCount = isTwig ? 3 + Math.floor(rngFor(cid, 'lc')() * 3) : (rngFor(cid, 'lc')() > 0.5 ? 1 : 0);
        for (let i = 0; i < leafCount; i++) {
          const t = 0.55 + rngFor(cid, 'lt' + i)() * 0.4;
          const lx = p1.x + (p2.x - p1.x) * t + (rngFor(cid, 'lx' + i)() - 0.5) * 2.2;
          const ly = p1.y + (p2.y - p1.y) * t + (rngFor(cid, 'ly' + i)() - 0.5) * 1.6;
          drawLeaf(lx, ly, cid + i);
        }
      });
    });

    // ---- roots emerging from cracked earth, above the founder ----
    const founderPos = pos.get(rootId);
    const rootsBaseY = founderPos.y - rowH * 0.42;
    const rootTendrils = 7;
    for (let i = 0; i < rootTendrils; i++) {
      const rng = rngFor(rootId, 'root' + i);
      const spread = (i - (rootTendrils - 1) / 2) * (7 + rng() * 3);
      const endX = founderPos.x + spread;
      const endY = HEADER_H * 0.28 + rng() * 6;
      const c1x = founderPos.x + spread * 0.3, c1y = rootsBaseY - (rootsBaseY - endY) * 0.3;
      const c2x = endX - spread * 0.2, c2y = endY + (rootsBaseY - endY) * 0.35;
      const w0 = 0.9 + rng() * 0.5, w1 = 0.08;
      drawBranch(
        { x: founderPos.x, y: rootsBaseY },
        { x: endX, y: endY },
        w0, w1, rootId + 'rt' + i
      );
    }
    // cracked earth line
    const crackY = rootsBaseY + rowH * 0.12;
    let crackD = `M${MARGIN_X},${crackY}`;
    const crackRng = rngFor(rootId, 'crack');
    for (let x = MARGIN_X; x <= W - MARGIN_X; x += 14) {
      crackD += ` L${x + 7},${crackY + (crackRng() - 0.5) * 2.2}`;
    }
    gChrome.appendChild(el('path', { d: crackD, stroke: BARK.dark, 'stroke-width': 0.18, fill: 'none', opacity: 0.3, 'stroke-linecap': 'round' }));

    // trunk from earth crack down to founder olive
    drawBranch({ x: founderPos.x, y: crackY }, founderPos, 3.6, 3.6, rootId + 'trunk');

    // Attach all layer groups to the live SVG now (even though gOlives/
    // gChrome are still empty) so their fixed paint order (branches below
    // leaves below olives below chrome) is locked in, while still letting
    // us call getComputedTextLength() on children as we add them below —
    // text metrics only resolve once an element is actually in the
    // rendered document.
    svg.appendChild(gBranches);
    svg.appendChild(gLeaves);
    svg.appendChild(gOlives);
    svg.appendChild(gChrome);

    // ================= olives (name capsules) =================
    function ellipseOlivePath(rx, ry) {
      return `M${-rx},0 C${-rx * 0.5},${-ry * 1.35} ${rx * 0.5},${-ry * 1.35} ${rx},0 C${rx * 0.5},${ry * 1.35} ${-rx * 0.5},${ry * 1.35} ${-rx},0 Z`;
    }

    members.forEach((m) => {
      const p = pos.get(m.id);
      const isRoot = m.id === rootId;
      const rng = rngFor(m.id, 'olive');
      const rx = isRoot ? 3.1 : 0.95 + rng() * 0.35;
      const ry = isRoot ? 1.3 : 0.34 + rng() * 0.08;
      const rot = isRoot ? 0 : (rng() - 0.5) * 10;

      const g = el('g', { transform: `translate(${p.x},${p.y}) rotate(${rot})`, filter: 'url(#softShadow)' });
      const shape = el('path', {
        d: ellipseOlivePath(rx, ry),
        fill: `url(#olive-${isRoot ? 'gold' : tintFor(m)})`,
        stroke: isRoot ? GOLD.dark : '#2b2013',
        'stroke-width': isRoot ? 0.08 : 0.035,
        'stroke-opacity': isRoot ? 1 : 0.4,
      });
      g.appendChild(shape);

      // highlight
      const hl = el('ellipse', { cx: -rx * 0.25, cy: -ry * 0.4, rx: rx * 0.32, ry: ry * 0.32, fill: '#ffffff', opacity: 0.18 });
      g.appendChild(hl);

      const text = el('text', {
        x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', direction: 'rtl',
        'font-family': 'Cairo, sans-serif',
        'font-weight': isRoot ? 900 : 700,
        'font-size': isRoot ? 1.15 : 0.32,
        fill: isRoot ? '#2b1e08' : '#fbf7ea',
        transform: `rotate(${-rot})`,
      });
      text.textContent = m.name.ar;
      g.appendChild(text);
      gOlives.appendChild(g);

      // shrink-to-fit: measure after attaching (real DOM metrics)
      requestAnimationFrame(() => {
        try {
          const avail = rx * 2 * 0.82;
          const len = text.getComputedTextLength();
          if (len > avail) {
            const fs = parseFloat(text.getAttribute('font-size')) * (avail / len);
            text.setAttribute('font-size', Math.max(fs, 0.16));
          }
        } catch (e) { /* ignore */ }
      });
    });

    // ================= header (title over the roots) =================
    const title = el('text', {
      x: W / 2, y: HEADER_H * 0.5, 'text-anchor': 'middle', direction: 'rtl',
      'font-family': 'Cairo, sans-serif', 'font-weight': 900, 'font-size': 6.5, fill: '#2b2013',
    });
    title.textContent = 'شجرة عائلة الدّراس';
    gChrome.appendChild(title);

    const alive = members.filter((mm) => mm.alive).length;
    const subtitle = el('text', {
      x: W / 2, y: HEADER_H * 0.5 + 4.4, 'text-anchor': 'middle', direction: 'rtl',
      'font-family': 'Cairo, sans-serif', 'font-weight': 500, 'font-size': 1.7, fill: '#6b5a3a',
    });
    subtitle.textContent = `${members.length} فردًا عبر ${maxGen} أجيال — ${alive} على قيد الحياة`;
    gChrome.appendChild(subtitle);

    // legend
    const branches = new Map();
    members.forEach((mm) => { if (mm.branchId && mm.branchId !== 'root' && !branches.has(mm.branchId)) branches.set(mm.branchId, mm.branch.ar); });
    const legendItems = [['الجذر الأول', 'gold'], ...[...branches.entries()].map(([id, label]) => [label, id === 'b0' ? 'b0' : id === 'b1' ? 'b1' : 'b2'])];
    // Render each label at x=0 first, then read back its ACTUAL rendered
    // bounding box via getBBox() — SVG text-anchor/direction semantics for
    // bidi (RTL) runs are inconsistent enough across engines that trusting
    // getComputedTextLength() + an assumed anchor side isn't reliable.
    // getBBox() sidesteps that: we just find out where the glyphs really
    // landed and shift from there, which is correct by construction.
    const legendEls = legendItems.map(([label, key]) => {
      const t = el('text', {
        x: 0, y: HEADER_H * 0.5 + 7.9, 'font-family': 'Cairo, sans-serif', 'font-size': 1.3, fill: '#2b2013',
      });
      t.textContent = label;
      gChrome.appendChild(t);
      const bbox = t.getBBox();
      return { t, key, bbox };
    });
    const gap = 1.6, itemGap = 3;
    const totalW = legendEls.reduce((s, it) => s + 1.3 + gap + it.bbox.width, 0) + itemGap * (legendEls.length - 1);
    let lx = W / 2 - totalW / 2;
    legendEls.forEach(({ t, key, bbox }) => {
      gChrome.appendChild(el('circle', { cx: lx + 0.55, cy: HEADER_H * 0.5 + 7.6, r: 0.55, fill: `url(#olive-${key})`, stroke: '#2b2013', 'stroke-width': 0.04, 'stroke-opacity': 0.35 }));
      const desiredLeft = lx + 1.3 + gap;
      t.setAttribute('x', desiredLeft - bbox.x);
      lx += 1.3 + gap + bbox.width + itemGap;
    });

    // footer
    const footerY = H - FOOTER_H * 0.5;
    gChrome.appendChild(el('line', { x1: MARGIN_X, y1: H - FOOTER_H, x2: W - MARGIN_X, y2: H - FOOTER_H, stroke: '#2b2013', 'stroke-opacity': 0.15, 'stroke-width': 0.1 }));
    const foot1 = el('text', { x: W - MARGIN_X, y: footerY - 1.2, 'text-anchor': 'end', direction: 'rtl', 'font-family': 'Cairo, sans-serif', 'font-weight': 700, 'font-size': 1.5, fill: '#2b2013' });
    foot1.textContent = 'الدّراس — من جذورٍ راسخة... نبني أجيالًا واعدة.';
    gChrome.appendChild(foot1);
    const foot2 = el('text', { x: W - MARGIN_X, y: footerY + 1.4, 'text-anchor': 'end', direction: 'rtl', 'font-family': 'Cairo, sans-serif', 'font-size': 1.2, fill: '#6b5a3a' });
    foot2.textContent = 'تم إنشاؤها بتاريخ ' + new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    gChrome.appendChild(foot2);

    // QR code linking back to the live interactive tree
    if (window.QRCode) {
      const qrCanvas = document.createElement('canvas');
      QRCode.renderToCanvas(qrCanvas, location.origin + location.pathname.replace('tree-print.html', 'tree.html'), { scale: 4, quiet: 1 });
      requestAnimationFrame(() => {
        const img = el('image', {
          x: MARGIN_X, y: H - FOOTER_H + 1, width: FOOTER_H - 2, height: FOOTER_H - 2,
          href: qrCanvas.toDataURL('image/png'),
        });
        svg.appendChild(img);
      });
    }

    // ---- fit-to-screen preview via zoom (see tree.html print media note) ----
    function fitScale() {
      const CM_PX = 37.795;
      const wrapper = document.getElementById('poster-wrapper');
      const available = Math.min(window.innerWidth * 0.92, 1600);
      wrapper.style.zoom = available / (W * CM_PX);
    }
    fitScale();
    window.addEventListener('resize', fitScale);
  }

  document.getElementById('do-print').addEventListener('click', () => window.print());
  build();
})();
