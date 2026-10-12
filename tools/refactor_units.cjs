'use strict';
/*
 * Reorganise the 14 book chapters / 14 lessons into the 9 official AP
 * Chemistry units.
 *
 * Why this script exists
 * ----------------------
 * The previous attempt parsed the data files with regular expressions and
 * broke: `bi('EN','ZH')` actually contains a space after the comma, so a
 * pattern built around `','` matched across fields and produced invalid JS.
 *
 * This version never parses text. It *executes* the two data files inside a
 * Node `vm` sandbox, reads the resulting `window.AP_STUDY` / `window.AP_LESSONS`
 * objects, merges them in memory, and re-serialises them with JSON-escaped
 * strings. The output is therefore valid JavaScript by construction.
 *
 * Run from the repository root:
 *     node tools/refactor_units.cjs
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const assets = path.resolve(__dirname, '..', 'ap-chem-site', 'assets');

/* ---------- 1. load the current data by executing it ---------- */
function load(file, globalName) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(assets, file), 'utf8'), ctx, { filename: file });
  const value = ctx.window[globalName];
  if (!value) throw new Error(`${file} did not define ${globalName}`);
  return value;
}

const study = load('study-content.js', 'AP_STUDY');
const lessons = load('lesson-details.js', 'AP_LESSONS');

// Guard: this script transforms the original 14-chapter source. Running it on an
// already-merged file (9 chapters) would destroy content, so refuse instead.
if (study.chapters.length !== 14) {
  throw new Error(
    `expected the original 14-chapter study-content.js but found ${study.chapters.length}. ` +
    'Restore the original file (see git history) before running this script.');
}

/* ---------- 2. the fourteen old chapters folded into nine AP units ---------- */
// [newId, English title, Chinese title, [member old chapter ids]]
const UNITS = [
  [1, 'Atomic Structure and Properties', '原子结构与性质', [1, 2]],
  [2, 'Compound Structure and Properties', '化合物结构与性质', [3, 4]],
  [3, 'Properties of Substances and Mixtures', '物质与混合物的性质', [6, 7, 8, 14]],
  [4, 'Chemical Reactions', '化学反应', [5]],
  [5, 'Kinetics', '化学动力学', [10]],
  [6, 'Thermochemistry', '热化学', [11]],
  [7, 'Equilibrium', '化学平衡', [9]],
  [8, 'Acids and Bases', '酸与碱', [13]],
  [9, 'Thermodynamics and Electrochemistry', '热力学与电化学', [12]],
];

const oldToNew = new Map();
for (const [nid, , , members] of UNITS) for (const m of members) oldToNew.set(m, nid);

const chapterById = new Map(study.chapters.map(c => [c.id, c]));
for (const c of study.chapters) {
  if (!oldToNew.has(c.id)) throw new Error(`chapter ${c.id} is not assigned to any unit`);
}

/* ---------- 3. safe serialisation helpers ---------- */
const S = v => JSON.stringify(String(v));               // valid JS string literal
const bi = o => `bi(${S(o.en)},${S(o.zh)})`;            // study-content.js helper
const B = o => `b(${S(o.en)},${S(o.zh)})`;              // lesson-details.js helper
// LaTeX renders fine inside String.raw as long as it has no backtick / ${ .
const T = s => (/[`]|\$\{/.test(s) ? S(s) : 'String.raw`' + s + '`');

function joinBi(members, key) {
  return {
    en: members.map(c => c[key] && c[key].en).filter(Boolean).join(' '),
    zh: members.map(c => c[key] && c[key].zh).filter(Boolean).join(''),
  };
}

/* ---------- 4. chapters ---------- */
const newChapters = UNITS.map(([nid, en, zh, members]) => {
  const cs = members.map(id => chapterById.get(id));
  const formulas = cs.map(c => c.formula).filter(Boolean);
  return {
    id: nid,
    title: { en, zh },
    units: [nid],
    core: joinBi(cs, 'core'),
    why: joinBi(cs, 'why'),
    formula: formulas.join(',\\qquad '),
    symbols: joinBi(cs, 'symbols'),
    example: cs[0].example,
    steps: cs[0].steps,
    trap: joinBi(cs, 'trap'),
  };
});

function emitChapter(c) {
  return [
    `    {id:${c.id}, title:${bi(c.title)}, units:[${c.units.join(',')}],`,
    `      core:${bi(c.core)},`,
    `      why:${bi(c.why)},`,
    `      formula:${T(c.formula)},`,
    `      symbols:${bi(c.symbols)},`,
    `      example:${bi(c.example)},`,
    `      steps:[${c.steps.map(bi).join(',')}],`,
    `      trap:${bi(c.trap)}}`,
  ].join('\n');
}

/* ---------- 5. pane -> chapter mapping ---------- */
const newPanes = {};
for (const [key, ids] of Object.entries(study.paneChapters)) {
  const out = [];
  for (const id of ids) {
    const n = oldToNew.get(id);
    if (n === undefined) throw new Error(`pane ${key} references unknown chapter ${id}`);
    if (!out.includes(n)) out.push(n);
  }
  newPanes[key] = out;
}

/* ---------- 6. lessons ---------- */
function renumberSections(sections) {
  return sections.map((s, i) => {
    const n = i + 1;
    const hasPrefix = /^\s*\d+\.\s+/.test(s.title.en) && /^\s*\d+\.\s+/.test(s.title.zh);
    const title = hasPrefix
      ? { en: `${n}. ${s.title.en.replace(/^\s*\d+\.\s+/, '')}`, zh: `${n}. ${s.title.zh.replace(/^\s*\d+\.\s+/, '')}` }
      : s.title;
    return { ...s, title };
  });
}

function buildLesson(nid, members) {
  const ls = members.map(id => lessons[id]);
  if (ls.some(l => !l)) throw new Error(`missing lesson for unit ${nid}`);
  const before = {
    en: ls.map(l => l.before.en).join(' '),
    zh: ls.map(l => l.before.zh).join(''),
  };
  const goals = {
    en: ls.map(l => l.goals.en).join(' '),
    zh: ls.map(l => l.goals.zh).join(''),
  };
  const sections = renumberSections(ls.flatMap(l => l.sections));
  const checks = ls.flatMap(l => l.checks);
  const extra = ls[0].extra;
  return { before, goals, sections, extra, checks };
}

function emitLesson(nid, l) {
  const out = [`    ${nid}:{`, `      before:${B(l.before)},`, `      goals:${B(l.goals)},`, `      sections:[`];
  const secs = l.sections.map(s => {
    if (s.tex && !s.note) throw new Error(`unit ${nid} section "${s.title.en}" has tex but no note`);
    const args = [`${S(s.title.en)}`, `${S(s.title.zh)}`, `[${s.paragraphs.map(B).join(',')}]`];
    if (s.tex || s.note) args.push(s.tex ? T(s.tex) : 'null');
    if (s.note) args.push(B(s.note));
    return `        s(${args.join(',')})`;
  });
  out.push(secs.join(',\n'));
  out.push('      ],');
  const e = l.extra;
  out.push(`      extra:x(${S(e.prompt.en)},${S(e.prompt.zh)},[${e.steps.map(B).join(',')}]${e.tex ? ',' + T(e.tex) : ''}),`);
  out.push('      checks:[');
  out.push(l.checks.map(c => `        q(${S(c.question.en)},${S(c.question.zh)},${S(c.answer.en)},${S(c.answer.zh)})`).join(',\n'));
  out.push('      ]');
  out.push('    }');
  return out.join('\n');
}

/* ---------- 7. write the files ---------- */
const chapterHeader = [
  '/* Original bilingual explanations reorganised into the nine official AP',
  '   Chemistry units. Each unit merges the equivalent chapters of the source',
  '   book; see tools/refactor_units.cjs for the chapter mapping. */',
  'window.AP_STUDY = (() => {',
  '  const bi = (en, zh) => ({en, zh});',
  '  const chapters = [',
].join('\n');

const paneLines = Object.entries(newPanes).map(([k, v]) => `    ${S(k)}:[${v.join(',')}]`);

const studyOut =
  chapterHeader + '\n' +
  newChapters.map(emitChapter).join(',\n') + '\n' +
  '  ];\n' +
  '  const paneChapters = {\n' + paneLines.join(',\n') + '\n  };\n' +
  '  return {chapters, paneChapters};\n' +
  '})();\n';

const lessonOut =
  '/* Original teaching material: paired English/Chinese explanations, not book prose.\n' +
  '   Merged into the nine AP Chemistry units; see tools/refactor_units.cjs. */\n' +
  'window.AP_LESSONS = (() => {\n' +
  '  const b=(en,zh)=>({en,zh});\n' +
  '  const s=(en,zh,paragraphs,tex,note)=>({title:b(en,zh),paragraphs,tex,note});\n' +
  '  const q=(en,zh,aen,azh)=>({question:b(en,zh),answer:b(aen,azh)});\n' +
  '  const x=(en,zh,steps,tex)=>({prompt:b(en,zh),steps,tex});\n' +
  '  const lessons = {\n' +
  UNITS.map(([nid, , , members]) => emitLesson(nid, buildLesson(nid, members))).join(',\n') + '\n' +
  '  };\n' +
  '  return lessons;\n' +
  '})();\n';

fs.writeFileSync(path.join(assets, 'study-content.js'), studyOut, 'utf8');
fs.writeFileSync(path.join(assets, 'lesson-details.js'), lessonOut, 'utf8');

console.log('chapters:', newChapters.length);
console.log('lessons :', UNITS.length);
console.log('panes   :', Object.keys(newPanes).length);
console.log('sections per unit:',
  UNITS.map(([nid, , , m]) => `${nid}:${m.flatMap(id => lessons[id].sections).length}`).join(' '));
