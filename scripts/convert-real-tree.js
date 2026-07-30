/**
 * convert-real-tree.js — converts the user's real exported genealogy file
 * (Downloads/عائلة الدراس/tree.json — 395 real people, first names + parent/child
 * links only, no gender/dates/bio/photos in the source) into this site's
 * assets/data/family.json schema.
 *
 * Important: the source has no birth/death years, no biography, no photos,
 * and no gender field. We do NOT invent these for real, named individuals.
 * Unknown fields are left null so the UI can show a neutral placeholder /
 * "suggest info" prompt instead of fabricated facts. The one real status
 * signal in the source is `isAbsent`, which the exporting app pairs with a
 * "non-living decoration" setting — we treat isAbsent === true as deceased.
 *
 * Gender: every one of the 163 unique first names in this dataset is a
 * traditional Arabic MALE name (this is a patrilineal lineage record, a
 * common convention for Arab family trees — wives/daughters are not
 * tracked in the source). So gender is set to 'male' for all members.
 *
 * Run: node scripts/convert-real-tree.js "<path-to-source-tree.json>"
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SOURCE_PATH = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'عائلة الدراس', 'tree.json');

const TRANSLIT_MAP = [
  ['اء','a'], ['ال','al-'], ['أ','a'], ['إ','i'], ['آ','aa'], ['ابراهيم','Ibrahim'],
  ['ا','a'], ['ب','b'], ['ت','t'], ['ث','th'], ['ج','j'], ['ح','h'], ['خ','kh'],
  ['د','d'], ['ذ','dh'], ['ر','r'], ['ز','z'], ['س','s'], ['ش','sh'], ['ص','s'],
  ['ض','d'], ['ط','t'], ['ظ','z'], ['ع','a'], ['غ','gh'], ['ف','f'], ['ق','q'],
  ['ك','k'], ['ل','l'], ['م','m'], ['ن','n'], ['ه','h'], ['و','w'], ['ي','y'],
  ['ى','a'], ['ة','ah'], ['ؤ','o'], ['ئ','e'], ['ّ',''], ['ً',''], ['ٌ',''],
  ['ٍ',''], ['َ',''], ['ُ',''], ['ِ',''], ['ْ',''],
];

function transliterate(arabic) {
  if (!arabic) return '';
  let out = arabic.trim();
  // Known common full-name overrides for nicer output
  const KNOWN = {
    'محمد':'Mohammed','أحمد':'Ahmad','احمد':'Ahmad','علي':'Ali','عمر':'Omar','عثمان':'Othman',
    'يوسف':'Yousef','إبراهيم':'Ibrahim','ابراهيم':'Ibrahim','خالد':'Khalid','سعيد':'Saeed',
    'حسن':'Hassan','حسين':'Hussein','مصطفى':'Mustafa','محمود':'Mahmoud','عبدالله':'Abdullah',
    'عبدالرحمن':'Abdulrahman','عبدالعزيز':'Abdulaziz','فيصل':'Faisal','طلال':'Talal','سلطان':'Sultan',
    'ماجد':'Majed','نبيل':'Nabil','كمال':'Kamal','جمال':'Jamal','هاشم':'Hashim','قاسم':'Qasim',
    'زيد':'Zaid','زياد':'Ziad','بلال':'Bilal','بشير':'Bashir','رشيد':'Rashid','سليمان':'Suleiman',
    'الدراس':'Al-Drrass','هدهد':'Hudhud','وائل':'Wael','أنس':'Anas','آدم':'Adam','ريان':'Rayan',
    'ليث':'Laith','فارس':'Fares','يزن':'Yazan','عمار':'Ammar','عيسى':'Issa','موسى':'Musa',
    'إسماعيل':'Ismail','حمزة':'Hamza','بسام':'Bassam','سامي':'Sami','سامر':'Samer','نادر':'Nader',
    'فادي':'Fadi','رامي':'Rami','باسل':'Basel','باسم':'Basem','أمين':'Ameen','أمير':'Ameer',
  };
  if (KNOWN[out]) return KNOWN[out];
  for (const [ar, lat] of TRANSLIT_MAP) {
    out = out.split(ar).join(lat);
  }
  out = out.replace(/\s+/g, ' ').trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const raw = fs.readFileSync(SOURCE_PATH, 'utf-8');
const source = JSON.parse(raw);
const { nodes, infos } = source;

const rootNode = Object.values(nodes).find((n) => !n.relations.some((r) => r.type === 'parent'));
if (!rootNode) throw new Error('No root ancestor found in source tree.');

const BRANCH_LABELS = {}; // branchId -> {ar, en}
const memberById = new Map();

function buildMember(node) {
  const info = infos[node.infoId] || {};
  const firstName = (info.firstName || '').trim() || 'غير معروف';
  const parents = node.relations.filter((r) => r.type === 'parent').map((r) => r.to);
  const children = node.relations.filter((r) => r.type === 'child').map((r) => r.to);
  return {
    id: node.id,
    name: { ar: firstName, en: transliterate(firstName) },
    gender: 'male',
    generation: null, // filled by BFS below
    birthYear: null,
    deathYear: null,
    alive: info.isAbsent ? false : true,
    birthPlace: null,
    occupation: null,
    branch: null, // filled below
    branchId: null,
    parents,
    spouse: [],
    children,
    photo: null,
    bio: { ar: '', en: '' },
    isFounder: node.id === rootNode.id,
  };
}

Object.values(nodes).forEach((n) => memberById.set(n.id, buildMember(n)));

// BFS from root: assign generation + propagate branch from root's direct children
const root = memberById.get(rootNode.id);
root.generation = 1;
root.branch = { ar: 'الجذر الأول', en: 'The Founding Root' };
root.branchId = 'root';

const queue = [rootNode.id];
const seen = new Set([rootNode.id]);
while (queue.length) {
  const curId = queue.shift();
  const cur = memberById.get(curId);
  cur.children.forEach((childId) => {
    if (seen.has(childId)) return;
    seen.add(childId);
    const child = memberById.get(childId);
    child.generation = cur.generation + 1;
    if (cur.id === root.id) {
      // this child is a branch root
      const idx = Object.keys(BRANCH_LABELS).length;
      const branchId = 'b' + idx;
      const label = { ar: `فرع ${child.name.ar}`, en: `${child.name.en} Branch` };
      BRANCH_LABELS[childId] = { branchId, label };
      child.branchId = branchId;
      child.branch = label;
    } else {
      child.branchId = cur.branchId;
      child.branch = cur.branch;
    }
    queue.push(childId);
  });
}

const members = Array.from(memberById.values());
const totalAlive = members.filter((m) => m.alive).length;
const totalDeceased = members.length - totalAlive;

const output = {
  meta: {
    surname: { ar: 'الدّراس', en: 'Al-Drrass' },
    generatedAt: new Date().toISOString().slice(0, 10),
    totalMembers: members.length,
    founderId: root.id,
    aliveCount: totalAlive,
    deceasedCount: totalDeceased,
    source: 'real-family-export',
    note: 'Converted from the real family export. Birth/death years, biography, birthplace, and photos were not present in the source and are intentionally left empty rather than invented — contribute real details via the Suggestions page.',
  },
  members,
};

const outPath = path.join(__dirname, '..', 'assets', 'data', 'family.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`Converted ${members.length} real members -> ${outPath}`);
console.log('Alive:', totalAlive, 'Marked absent/deceased:', totalDeceased);
console.log('Branches:', Object.values(BRANCH_LABELS).map((b) => b.label.ar));
