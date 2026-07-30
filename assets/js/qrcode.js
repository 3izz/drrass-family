/**
 * qrcode.js — small, dependency-free QR Code encoder (Model 2).
 * Supports byte-mode encoding, EC level L, versions 1-6 (no version-info
 * block needed below version 7, which keeps this implementation simple).
 * That covers member-profile-length text comfortably (up to 134 bytes).
 *
 * Usage: QRCode.generate(text) -> { size, modules } where modules is a
 * size*size boolean 2D array (true = dark module).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QRCode = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- GF(256) tables (primitive poly 0x11d) ----
  const EXP = new Array(512);
  const LOG = new Array(256);
  (function buildGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  // Reed-Solomon generator polynomial of given degree (EC codeword count)
  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], 1);
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly; // highest-degree-first coefficients, length = degree+1
  }

  function rsEncode(dataCodewords, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const result = dataCodewords.slice();
    const buf = dataCodewords.concat(new Array(ecCount).fill(0));
    for (let i = 0; i < dataCodewords.length; i++) {
      const coef = buf[i];
      if (coef === 0) continue;
      for (let j = 0; j < gen.length; j++) {
        buf[i + j] ^= gfMul(gen[j], coef);
      }
    }
    return buf.slice(dataCodewords.length, dataCodewords.length + ecCount);
  }

  // ---- Per-version (1-6) EC-level-L capacity table ----
  // [totalCodewords, ecCodewordsPerBlock, [ [blockCount, dataCodewordsPerBlock], ... ] ]
  const VERSION_INFO = {
    1: { total: 26, ecPerBlock: 7, blocks: [[1, 19]] },
    2: { total: 44, ecPerBlock: 10, blocks: [[1, 34]] },
    3: { total: 70, ecPerBlock: 15, blocks: [[1, 55]] },
    4: { total: 100, ecPerBlock: 20, blocks: [[1, 80]] },
    5: { total: 134, ecPerBlock: 26, blocks: [[1, 108]] },
    6: { total: 172, ecPerBlock: 18, blocks: [[2, 68]] },
  };

  function moduleCount(version) { return version * 4 + 17; }

  // Alignment pattern center positions per version (empty for v1)
  const ALIGNMENT_POSITIONS = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  };

  function pickVersion(byteLength) {
    for (let v = 1; v <= 6; v++) {
      const info = VERSION_INFO[v];
      const dataCapacity = info.blocks.reduce((s, [c, n]) => s + c * n, 0);
      // capacity minus mode(4 bits)+length(8 bits for v1-9 byte mode)=12 bits => 1.5 bytes overhead
      const usable = dataCapacity - 2;
      if (byteLength <= usable) return v;
    }
    return null; // too long
  }

  function textToUtf8Bytes(str) {
    return Array.from(new TextEncoder().encode(str));
  }

  function buildDataCodewords(version, bytes) {
    const info = VERSION_INFO[version];
    const dataCapacity = info.blocks.reduce((s, [c, n]) => s + c * n, 0);
    const bits = [];
    const pushBits = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };

    pushBits(0b0100, 4); // byte mode indicator
    pushBits(bytes.length, 8); // character count (versions 1-9)
    bytes.forEach((b) => pushBits(b, 8));

    // terminator
    for (let i = 0; i < 4 && bits.length < dataCapacity * 8; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }
    const PAD = [0xec, 0x11];
    let p = 0;
    while (codewords.length < dataCapacity) { codewords.push(PAD[p % 2]); p++; }
    return codewords;
  }

  function interleave(version, dataCodewords) {
    const info = VERSION_INFO[version];
    const blocks = [];
    let offset = 0;
    info.blocks.forEach(([count, size]) => {
      for (let i = 0; i < count; i++) {
        const block = dataCodewords.slice(offset, offset + size);
        offset += size;
        const ec = rsEncode(block, info.ecPerBlock);
        blocks.push({ data: block, ec });
      }
    });
    const maxDataLen = Math.max(...blocks.map((b) => b.data.length));
    const result = [];
    for (let i = 0; i < maxDataLen; i++) {
      blocks.forEach((b) => { if (i < b.data.length) result.push(b.data[i]); });
    }
    for (let i = 0; i < info.ecPerBlock; i++) {
      blocks.forEach((b) => result.push(b.ec[i]));
    }
    return result;
  }

  function codewordsToBits(codewords) {
    const bits = [];
    codewords.forEach((cw) => { for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1); });
    return bits;
  }

  // ---- Matrix construction ----
  function createMatrix(version) {
    const n = moduleCount(version);
    const matrix = Array.from({ length: n }, () => new Array(n).fill(null));
    return matrix;
  }

  function placeFinder(matrix, row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || cc < 0 || rr >= matrix.length || cc >= matrix.length) continue;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        matrix[rr][cc] = inFinder ? (isBorder || isCore) : false;
      }
    }
  }

  function placeAlignment(matrix, row, col) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isBorder = Math.max(Math.abs(r), Math.abs(c)) === 2;
        const isCenter = r === 0 && c === 0;
        matrix[row + r][col + c] = isBorder || isCenter;
      }
    }
  }

  function addFunctionPatterns(matrix, version) {
    const n = matrix.length;
    placeFinder(matrix, 0, 0);
    placeFinder(matrix, 0, n - 7);
    placeFinder(matrix, n - 7, 0);

    // timing patterns
    for (let i = 8; i < n - 8; i++) {
      matrix[6][i] = i % 2 === 0;
      matrix[i][6] = i % 2 === 0;
    }

    // alignment patterns
    const positions = ALIGNMENT_POSITIONS[version];
    positions.forEach((r) => {
      positions.forEach((c) => {
        // skip if overlapping a finder pattern corner
        const overlapsFinder = (r < 9 && c < 9) || (r < 9 && c > n - 9) || (r > n - 9 && c < 9);
        if (!overlapsFinder) placeAlignment(matrix, r, c);
      });
    });

    // dark module (always present, position fixed relative to version)
    matrix[4 * version + 9][8] = true;

    // reserve format info areas (filled later)
    for (let i = 0; i < 9; i++) {
      if (matrix[8][i] === null) matrix[8][i] = 'reserve';
      if (matrix[i][8] === null) matrix[i][8] = 'reserve';
    }
    for (let i = 0; i < 8; i++) {
      if (matrix[8][n - 1 - i] === null) matrix[8][n - 1 - i] = 'reserve';
      if (matrix[n - 1 - i][8] === null) matrix[n - 1 - i][8] = 'reserve';
    }
  }

  function isFree(matrix, r, c) {
    return matrix[r][c] === null;
  }

  function placeData(matrix, bits) {
    const n = matrix.length;
    let bitIndex = 0;
    let dir = -1; // upward
    let col = n - 1;
    while (col > 0) {
      if (col === 6) col--; // skip timing column
      for (let i = 0; i < n; i++) {
        const row = dir === -1 ? n - 1 - i : i;
        for (let c = 0; c < 2; c++) {
          const cc = col - c;
          if (isFree(matrix, row, cc)) {
            const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
            matrix[row][cc] = !!bit;
            bitIndex++;
          }
        }
      }
      dir = -dir;
      col -= 2;
    }
  }

  function applyMask(matrix, reserved) {
    const n = matrix.length;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (reserved[r][c]) continue; // don't mask function patterns
        if ((r + c) % 2 === 0) matrix[r][c] = !matrix[r][c];
      }
    }
  }

  // Format info: EC level L = '01', mask pattern 0 = '000' -> 5 data bits
  function computeFormatBits() {
    const FORMAT_GENERATOR = 0b10100110111; // degree-10 BCH generator (spec constant)
    const FORMAT_XOR_MASK = 0x5412; // spec constant applied to the final 15-bit codeword
    const dataBits = 0b01000; // EC level L (01) + mask pattern 0 (000)
    let value = dataBits << 10;
    for (let i = 14; i >= 10; i--) {
      if ((value >> i) & 1) value ^= (FORMAT_GENERATOR << (i - 10));
    }
    const remainder = value & 0x3ff;
    const codeword = (dataBits << 10) | remainder;
    return codeword ^ FORMAT_XOR_MASK;
  }

  function placeFormatInfo(matrix) {
    const n = matrix.length;
    const formatValue = computeFormatBits();
    const bits = [];
    for (let i = 14; i >= 0; i--) bits.push((formatValue >> i) & 1);

    // around top-left finder
    const col6 = [0,1,2,3,4,5,7,8];
    for (let i = 0; i < 6; i++) matrix[8][i] = !!bits[i];
    matrix[8][7] = !!bits[6];
    matrix[8][8] = !!bits[7];
    matrix[7][8] = !!bits[8];
    for (let i = 9; i < 15; i++) matrix[14 - i][8] = !!bits[i];

    // bottom-left + top-right copies
    for (let i = 0; i < 8; i++) matrix[n - 1 - i][8] = !!bits[i];
    for (let i = 8; i < 15; i++) matrix[8][n - 15 + i] = !!bits[i];
  }

  function generate(text) {
    const bytes = textToUtf8Bytes(text);
    const version = pickVersion(bytes.length);
    if (!version) throw new Error('Text too long for supported QR versions (max ~130 bytes)');

    const dataCodewords = buildDataCodewords(version, bytes);
    const allCodewords = interleave(version, dataCodewords);
    const bits = codewordsToBits(allCodewords);

    const matrix = createMatrix(version);
    addFunctionPatterns(matrix, version);
    const reserved = matrix.map((row) => row.map((cell) => cell !== null));
    placeData(matrix, bits);
    applyMask(matrix, reserved);
    placeFormatInfo(matrix);

    const size = matrix.length;
    const modules = matrix.map((row) => row.map((cell) => !!cell));
    return { size, modules };
  }

  /** Renders `text` as a QR code onto a <canvas> element (browser only). */
  function renderToCanvas(canvas, text, opts) {
    opts = opts || {};
    const scale = opts.scale || 6;
    const quiet = opts.quiet != null ? opts.quiet : 3;
    const dark = opts.dark || '#0a1622';
    const light = opts.light || '#ffffff';
    const { size, modules } = generate(text);
    const px = (size + quiet * 2) * scale;
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = dark;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
    }
    return canvas;
  }

  return { generate, renderToCanvas };
});
