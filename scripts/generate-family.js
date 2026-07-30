/**
 * generate-family.js — one-off generator for assets/data/family.json.
 * Produces a consistent 6-generation genealogy (~180-200 members) with
 * bidirectional parent/child/spouse links, branches, bios, and dates.
 * Run: node scripts/generate-family.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MALE_NAMES = ['سالم','عبدالله','محمد','ناصر','فهد','سعود','خالد','تركي','عبدالعزيز','إبراهيم','فيصل','ماجد','بندر','سلطان','عمر','يوسف','حمد','راشد','مشعل','عبدالرحمن','زياد','وليد','باسل','طلال','عادل','هاني','سامي','نايف','مساعد','فارس','ريان','آدم','لؤي','سند','جاسم','ضاري'];
const FEMALE_NAMES = ['نورة','منيرة','لطيفة','سارة','هيا','العنود','موضي','دلال','ريم','أمل','هند','بدرية','شيخة','مها','غادة','عبير','لمى','جواهر','رغد','دانة','شمة','وضحاء','فاطمة','مريم','لولوة','حصة','أروى','رهف'];
const MALE_NAMES_EN = { 'سالم':'Salem','عبدالله':'Abdullah','محمد':'Mohammed','ناصر':'Nasser','فهد':'Fahad','سعود':'Saud','خالد':'Khalid','تركي':'Turki','عبدالعزيز':'Abdulaziz','إبراهيم':'Ibrahim','فيصل':'Faisal','ماجد':'Majed','بندر':'Bandar','سلطان':'Sultan','عمر':'Omar','يوسف':'Yousef','حمد':'Hamad','راشد':'Rashed','مشعل':'Mishal','عبدالرحمن':'Abdulrahman','زياد':'Ziad','وليد':'Waleed','باسل':'Basel','طلال':'Talal','عادل':'Adel','هاني':'Hani','سامي':'Sami','نايف':'Nayef','مساعد':'Musaed','فارس':'Fares','ريان':'Rayan','آدم':'Adam','لؤي':'Loai','سند':'Sanad','جاسم':'Jasim','ضاري':'Dhari' };
const FEMALE_NAMES_EN = { 'نورة':'Noura','منيرة':'Muneera','لطيفة':'Latifa','سارة':'Sarah','هيا':'Haya','العنود':'Al-Anoud','موضي':'Modhi','دلال':'Dalal','ريم':'Reem','أمل':'Amal','هند':'Hind','بدرية':'Badriah','شيخة':'Sheikha','مها':'Maha','غادة':'Ghada','عبير':'Abeer','لمى':'Lama','جواهر':'Jawaher','رغد':'Raghad','دانة':'Dana','شمة':'Shamma','وضحاء':'Wadha','فاطمة':'Fatima','مريم':'Mariam','لولوة':'Lulwa','حصة':'Hessa','أروى':'Arwa','رهف':'Rahaf' };

const CITIES = [
  { ar: 'بريدة', en: 'Buraidah' },
  { ar: 'الرياض', en: 'Riyadh' },
  { ar: 'الكويت', en: 'Kuwait City' },
  { ar: 'جدة', en: 'Jeddah' },
  { ar: 'الدمام', en: 'Dammam' },
  { ar: 'مكة المكرمة', en: 'Makkah' },
  { ar: 'عنيزة', en: 'Unaizah' },
  { ar: 'الدوحة', en: 'Doha' },
  { ar: 'أبوظبي', en: 'Abu Dhabi' },
  { ar: 'المدينة المنورة', en: 'Madinah' },
];

const OCCUPATIONS = [
  { ar: 'تاجر', en: 'Merchant' }, { ar: 'مهندس', en: 'Engineer' }, { ar: 'طبيب', en: 'Physician' },
  { ar: 'معلم', en: 'Teacher' }, { ar: 'قاضٍ', en: 'Judge' }, { ar: 'رجل أعمال', en: 'Businessman' },
  { ar: 'أستاذ جامعي', en: 'University Professor' }, { ar: 'ضابط', en: 'Officer' },
  { ar: 'كاتب', en: 'Writer' }, { ar: 'مزارع', en: 'Farmer' }, { ar: 'طالب', en: 'Student' },
];

const BIO_TEMPLATES_AR = [
  (n, city) => `عُرف ${n} بحكمته وكرمه، وكان من أبرز وجهاء الأسرة في ${city}، وقد ساهم في لمّ شمل العائلة عبر أجيال متعاقبة.`,
  (n, city) => `نشأ ${n} في ${city}، وترك أثرًا طيبًا في ذاكرة العائلة من خلال مواقفه الإنسانية ورعايته لأبنائه وأحفاده.`,
  (n, city) => `يُذكر ${n} بحبه للعلم وسعيه الدائم لدعم أبناء العائلة في تحصيلهم العلمي والعملي، وقد أقام في ${city} لسنوات طويلة.`,
  (n, city) => `اشتهر ${n} بروح المبادرة، وكان له دور بارز في تطوير أعمال العائلة التجارية انطلاقًا من ${city}.`,
  (n, city) => `يحمل ${n} قصة ملهمة عن الصبر والعطاء، وقد ارتبط اسمه بذكريات جميلة يتناقلها أفراد الأسرة في ${city} وخارجها.`,
];
const BIO_TEMPLATES_EN = [
  (n, city) => `${n} was known for wisdom and generosity, becoming one of the family's most respected figures in ${city} and helping unite generations across the years.`,
  (n, city) => `Raised in ${city}, ${n} left a lasting mark on the family's memory through compassion and dedication to the next generation.`,
  (n, city) => `${n} is remembered for a love of learning, always encouraging the family's children to pursue education, having lived for many years in ${city}.`,
  (n, city) => `Known for an entrepreneurial spirit, ${n} played a key role in growing the family's trade, starting from ${city}.`,
  (n, city) => `${n} carries an inspiring story of patience and generosity, fondly remembered by relatives in ${city} and beyond.`,
];

let idCounter = 1;
function nextId() { return 'm' + String(idCounter++).padStart(3, '0'); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const members = [];
const CURRENT_YEAR = 2026;

function makePerson({ gender, generation, birthYear, branch, branchId, surnameAr, surnameEn }) {
  const pool = gender === 'm' ? MALE_NAMES : FEMALE_NAMES;
  const poolEn = gender === 'm' ? MALE_NAMES_EN : FEMALE_NAMES_EN;
  const first = pick(pool);
  const city = pick(CITIES);
  const id = nextId();
  const person = {
    id,
    name: { ar: `${first} ${surnameAr}`, en: `${poolEn[first]} ${surnameEn}` },
    firstNameAr: first,
    gender,
    generation,
    birthYear,
    deathYear: null,
    alive: true,
    birthPlace: city,
    occupation: pick(OCCUPATIONS),
    branch,
    branchId,
    parents: [],
    spouse: [],
    children: [],
    photo: null,
    bio: { ar: '', en: '' },
  };
  return person;
}

function finalizeBio(person) {
  const tmplIdx = randInt(0, BIO_TEMPLATES_AR.length - 1);
  person.bio.ar = BIO_TEMPLATES_AR[tmplIdx](person.name.ar, person.birthPlace.ar);
  person.bio.en = BIO_TEMPLATES_EN[tmplIdx](person.name.en, person.birthPlace.en);
}

function maybeDeath(person) {
  const age = CURRENT_YEAR - person.birthYear;
  if (person.generation <= 2) {
    if (age > 60 && Math.random() < 0.88) {
      person.deathYear = person.birthYear + randInt(58, Math.min(age, 92));
      person.alive = false;
    }
  } else if (person.generation === 3) {
    if (age > 70 && Math.random() < 0.5) {
      person.deathYear = person.birthYear + randInt(65, Math.min(age, 90));
      person.alive = false;
    }
  } else {
    if (age > 80 && Math.random() < 0.15) {
      person.deathYear = person.birthYear + randInt(75, Math.min(age, 88));
      person.alive = false;
    }
  }
}

// ---- Branch definitions (children of the founder define the branches) ----
const BRANCH_NAMES = [
  { ar: 'فرع الشيخ سالم', en: 'Sheikh Salem Branch' },
  { ar: 'فرع عبدالله الكبير', en: 'Abdullah Al-Kabeer Branch' },
  { ar: 'فرع ناصر التاجر', en: 'Nasser the Merchant Branch' },
  { ar: 'فرع إبراهيم القاضي', en: 'Ibrahim the Judge Branch' },
  { ar: 'فرع سعود الديرة', en: 'Saud Al-Deerah Branch' },
];

const SURNAME_AR = 'الدّراس';
const SURNAME_EN = 'Al-Drrass';

// ---- Generation 1: the founder ----
const founder = makePerson({ gender: 'm', generation: 1, birthYear: 1882, branch: { ar: 'الجذر الأول', en: 'The Founding Root' }, branchId: 'root', surnameAr: SURNAME_AR, surnameEn: SURNAME_EN });
founder.isFounder = true;
founder.birthPlace = CITIES[0]; // Buraidah
maybeDeath(founder); founder.deathYear = 1968; founder.alive = false;
finalizeBio(founder);
members.push(founder);

const founderSpouse = makePerson({ gender: 'f', generation: 1, birthYear: 1888, branch: founder.branch, branchId: 'root', surnameAr: SURNAME_AR, surnameEn: SURNAME_EN });
founderSpouse.deathYear = 1971; founderSpouse.alive = false;
finalizeBio(founderSpouse);
founder.spouse.push(founderSpouse.id);
founderSpouse.spouse.push(founder.id);
members.push(founderSpouse);

const TARGET_TOTAL = 190;

function childCountFor(generation) {
  if (generation === 2) return randInt(4, 5);
  if (generation === 3) return randInt(3, 5);
  if (generation === 4) return randInt(2, 4);
  if (generation === 5) return randInt(1, 3);
  return randInt(0, 2);
}

function birthYearFor(parentBirthYear, generation) {
  const parentAgeAtBirth = randInt(20, 34);
  return parentBirthYear + parentAgeAtBirth;
}

// BFS-style generation build
let frontier = [founder]; // only "blood" members carry the line forward
let branchAssignAtGen2 = true;

function buildGeneration(gen) {
  const nextFrontier = [];
  for (const parent of frontier) {
    if (members.length >= TARGET_TOTAL) break;
    const nKids = childCountFor(gen);
    for (let i = 0; i < nKids; i++) {
      if (members.length >= TARGET_TOTAL) break;
      const gender = Math.random() < 0.5 ? 'm' : 'f';
      const birthYear = birthYearFor(parent.birthYear, gen);
      let branch = parent.branch, branchId = parent.branchId;
      if (gen === 2) {
        branch = BRANCH_NAMES[nextFrontier.length % BRANCH_NAMES.length];
        branchId = 'b' + (nextFrontier.length % BRANCH_NAMES.length);
      }
      const child = makePerson({ gender, generation: gen, birthYear, branch, branchId, surnameAr: SURNAME_AR, surnameEn: SURNAME_EN });
      child.parents.push(parent.id);
      if (parent.spouse[0]) child.parents.push(parent.spouse[0]);
      parent.children.push(child.id);
      if (parent.spouse[0]) {
        const sp = members.find((m) => m.id === parent.spouse[0]);
        if (sp) sp.children.push(child.id);
      }
      maybeDeath(child);
      finalizeBio(child);
      members.push(child);

      // Marry in a spouse for adults who will have their own children later (gen < 6)
      if (gen < 6 && Math.random() < (gen <= 4 ? 0.82 : 0.35) && members.length < TARGET_TOTAL) {
        const spouseGender = gender === 'm' ? 'f' : 'm';
        const marriedYear = child.birthYear + randInt(20, 27);
        const spouse = makePerson({ gender: spouseGender, generation: gen, birthYear: child.birthYear - randInt(-3, 4), branch, branchId, surnameAr: gender === 'm' ? pick(['العتيبي','السبيعي','القحطاني','الحربي','المطيري','الدّراس']) : SURNAME_AR, surnameEn: gender === 'm' ? pick(['Al-Otaibi','Al-Subai\'i','Al-Qahtani','Al-Harbi','Al-Mutairi','Al-Drrass']) : SURNAME_EN });
        spouse.marriedIn = true;
        spouse.parents = [];
        maybeDeath(spouse);
        finalizeBio(spouse);
        spouse.spouse.push(child.id);
        child.spouse.push(spouse.id);
        members.push(spouse);
      }
      nextFrontier.push(child);
    }
  }
  return nextFrontier;
}

for (let gen = 2; gen <= 6; gen++) {
  if (members.length >= TARGET_TOTAL) break;
  frontier = buildGeneration(gen);
  if (frontier.length === 0) break;
}

// ---- Mark a handful of very recent births (for the Births page) ----
const recentCandidates = members.filter((m) => m.generation >= 5 && m.alive);
recentCandidates.slice(0, 12).forEach((m, i) => {
  m.birthYear = CURRENT_YEAR - randInt(0, 3);
});

// ---- Mark a handful of recent deaths (for the Deaths / memorial page) ----
const elderCandidates = members.filter((m) => m.generation <= 3 && m.alive);
elderCandidates.slice(0, 6).forEach((m) => {
  m.deathYear = CURRENT_YEAR - randInt(0, 2);
  m.alive = false;
});

const output = {
  meta: {
    surname: { ar: SURNAME_AR, en: SURNAME_EN },
    generatedAt: new Date().toISOString().slice(0, 10),
    totalMembers: members.length,
    founderId: founder.id,
  },
  members,
};

const outPath = path.join(__dirname, '..', 'assets', 'data', 'family.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`Wrote ${members.length} members to ${outPath}`);
