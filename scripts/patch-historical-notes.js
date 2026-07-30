/**
 * patch-historical-notes.js — attaches real, sourced historical notes to the
 * five family.json members that were independently confirmed by photos the
 * family shared: an 1872 Ottoman-era census of Al-Walaja (listing three
 * direct ancestors by the same three-generation names as the tree), and a
 * 1918 emigration photo ("Casa Darras", Chile) plus a memorial photo whose
 * subject and alive:false status both match a specific node.
 *
 * This does NOT invent birth/death years or bios — it only adds a short,
 * sourced note where a real document/photo was matched to a real node.
 * Run: node scripts/patch-historical-notes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'assets', 'data', 'family.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const byId = new Map(data.members.map((m) => [m.id, m]));

const NOTES = {
  '73946735-b8c8-439a-a4f6-55201ed4ec19': {
    ar: 'مذكور باسم «حسين محمد مصطفى الدّراس» في إحصاء الدولة العثمانية لقرية الولجة عام 1872.',
    en: 'Listed as "Hussein Mohammad Mustafa Al-Drrass" in the 1872 Ottoman-era census of Al-Walaja village.',
  },
  'd2ad56ba-80f4-4418-9fc4-e6770af44d23': {
    ar: 'مذكور باسم «محمود محمد الدّراس» في إحصاء الدولة العثمانية لقرية الولجة عام 1872.',
    en: 'Listed as "Mahmoud Mohammad Al-Drrass" in the 1872 Ottoman-era census of Al-Walaja village.',
  },
  '0a3bfc1b-8405-42e3-b0a4-c2f976445287': {
    ar: 'مذكور باسم «عبد القادر محمود الدّراس» في إحصاء الدولة العثمانية لقرية الولجة عام 1872.',
    en: 'Listed as "Abdul Qader Mahmoud Al-Drrass" in the 1872 Ottoman-era census of Al-Walaja village.',
  },
  'd94f5d97-2d02-4adf-b58a-96d24b876a1b': {
    ar: 'هاجر إلى تشيلي عام 1918 واستقر في سانتياغو، حيث لا تزال لافتة «Casa Darras» قائمة على أرضه حتى اليوم.',
    en: 'Emigrated to Chile in 1918 and settled in Santiago, where a "Casa Darras" sign still stands on his land today.',
  },
  '33d7e711-aafa-42e6-864a-f9ba54d9ca0f': {
    ar: 'صورته محفوظة في أرشيف مجموعة العائلة على فيسبوك.',
    en: "His portrait is preserved in the family's Facebook group archive.",
  },
};

let patched = 0;
for (const [id, note] of Object.entries(NOTES)) {
  const member = byId.get(id);
  if (!member) { console.warn('MISSING id', id); continue; }
  member.historicalNote = note;
  patched++;
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
console.log(`Patched ${patched} members with historicalNote.`);
