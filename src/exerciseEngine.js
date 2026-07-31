import rawLibrary from './exerciseLibrary.json' with { type: 'json' };

// ---------- shared scales ----------
const STRESS_SCORE = { None: 0, Low: 1, Moderate: 2, High: 3, 'Very High': 4 };
const scoreOf = v => STRESS_SCORE[v] ?? 0;

function parseRange(str) {
  const nums = (String(str).match(/\d+/g) || []).map(Number);
  if (nums.length >= 2) return [nums[0], nums[1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [8, 12];
}

function equipmentTierFor(equipment) {
  const s = String(equipment).toLowerCase();
  if (s.includes('bodyweight')) return 'bodyweight';
  const hasDumbbell = /dumbbell|kettlebell/.test(s);
  const hasFullGym = /barbell|cable|machine|smith|band|plate|ez bar|landmine|trap bar|safety squat|box|ghr|stability ball|medicine ball|bench|pins|rings|chair/.test(s);
  if (hasDumbbell && !hasFullGym) return 'dumbbell';
  return 'barbell'; // "Full gym" tier — everything else (barbell/cable/machine/etc)
}

// Per-exercise injury-area translation — strictly finer-grained than the old per-pattern map.
function areasForRaw(ex) {
  const areas = new Set();
  if (scoreOf(ex.shoulderStress) >= STRESS_SCORE.Moderate) areas.add('Shoulder');
  if (scoreOf(ex.elbowStress) >= STRESS_SCORE.Moderate) areas.add('Elbow');
  if (scoreOf(ex.hipStress) >= STRESS_SCORE.Moderate) areas.add('Hip');
  if (scoreOf(ex.kneeStress) >= STRESS_SCORE.Moderate) areas.add('Knee');
  if (scoreOf(ex.spinalLoading) >= STRESS_SCORE.Moderate) areas.add('Lower back');
  const text = `${ex.exercise} ${ex.primaryMuscle} ${ex.secondaryMuscles}`.toLowerCase();
  if (text.includes('hamstring')) areas.add('Hamstring');
  if (text.includes('achilles')) areas.add('Achilles');
  if (text.includes('tibialis') || text.includes('calf') || text.includes('calves')) areas.add('Ankle');
  if (text.includes('neck')) areas.add('Neck');
  if (text.includes('wrist') || text.includes('skullcrusher') || text.includes('close-grip')) areas.add('Wrist');
  return [...areas];
}

// ---------- derived library (computed once at module load) ----------
export const exerciseLibrary = rawLibrary.map(ex => {
  const [setsLow, setsHigh] = parseRange(ex.sets);
  const [repLow, repHigh] = parseRange(ex.reps);
  return {
    ...ex,
    isCompound: ex.compound === 'Yes',
    equipmentTier: equipmentTierFor(ex.equipment),
    fatigueScore: scoreOf(ex.fatigueCost),
    cnsScore: scoreOf(ex.cnsDemand),
    areas: areasForRaw(ex),
    setsLow, setsHigh, repLow, repHigh,
    priorities: String(ex.priority || '').split(',').map(s => s.trim())
  };
});

const byName = new Map(exerciseLibrary.map(ex => [ex.exercise, ex]));
export function libraryExerciseByName(name) { return byName.get(name) || null; }

export const CATEGORIES = [...new Set(exerciseLibrary.map(ex => ex.category))];

// ---------- 1RM estimation ----------
// The four tested lifts exist verbatim in the library.
export const TESTED_LIFT_NAMES = { Squat: 'squat', Deadlift: 'deadlift', 'Bench Press': 'bench', 'Seated Barbell Overhead Press': 'ohp' };

// Kept from the old hand-curated pool — most of these exercise names are unchanged in the new
// library, so they keep giving a sensible starting-weight guess. Everything else (~350 exercises)
// has no ratio and falls back to null — the app's existing "pick a challenging weight" self-select
// flow, which then autoregulates via the learned-1RM system.
export const exerciseWeightRatio = {
  'Front Squat': { ref: 'squat', mult: 0.85 }, 'Hack Squat': { ref: 'squat', mult: 1.3 }, 'Leg Press': { ref: 'squat', mult: 1.8 },
  'Goblet Squat': { ref: 'squat', mult: 0.35 }, 'Bulgarian Split Squat': { ref: 'squat', mult: 0.15 },
  'Trap Bar Deadlift With Low Handles': { ref: 'deadlift', mult: 1.05 }, 'Stiff-Legged Deadlift': { ref: 'deadlift', mult: 0.7 },
  'Good Morning': { ref: 'deadlift', mult: 0.35 }, 'Cable Pull Through': { ref: 'deadlift', mult: 0.3 },
  'Romanian Deadlift': { ref: 'deadlift', mult: 0.85 }, 'Single Leg Romanian Deadlift': { ref: 'deadlift', mult: 0.12 },
  'Decline Bench Press': { ref: 'bench', mult: 1.05 }, 'Smith Machine Bench Press': { ref: 'bench', mult: 1.05 },
  'Incline Bench Press': { ref: 'bench', mult: 0.85 }, 'Dumbbell Bench Press': { ref: 'bench', mult: 0.35 }, 'Incline Dumbbell Press': { ref: 'bench', mult: 0.3 },
  'Seated Cable Chest Fly': { ref: 'bench', mult: 0.35 }, 'Machine Chest Fly': { ref: 'bench', mult: 0.45 }, 'Dumbbell Chest Fly': { ref: 'bench', mult: 0.15 },
  'Seated Dumbbell Shoulder Press': { ref: 'ohp', mult: 0.35 }, 'Arnold Press': { ref: 'ohp', mult: 0.3 },
  'Face Pull': { ref: 'ohp', mult: 0.25 }, 'Reverse Cable Flyes': { ref: 'ohp', mult: 0.2 }, 'Reverse Dumbbell Flyes': { ref: 'ohp', mult: 0.08 },
  'Barbell Row': { ref: 'pull', mult: 1.0 }, 'Pendlay Row': { ref: 'pull', mult: 0.95 }, 'Cable Close Grip Seated Row': { ref: 'pull', mult: 1.0 },
  'Chest-Supported Dumbbell Row': { ref: 'pull', mult: 1.0 }, 'Dumbbell Row': { ref: 'pull', mult: 0.4 },
  'Lat Pulldown With Pronated Grip': { ref: 'pull', mult: 0.9 }, 'Lat Pulldown With Neutral Grip': { ref: 'pull', mult: 0.9 }, 'Dumbbell Pullover': { ref: 'pull', mult: 0.25 },
  'Tricep Pushdown With Rope': { ref: 'bench', mult: 0.35 }, 'Barbell Lying Triceps Extension': { ref: 'bench', mult: 0.3 }, 'Close-Grip Bench Press': { ref: 'bench', mult: 0.85 },
  'Dumbbell Lateral Raise': { ref: 'ohp', mult: 0.08 },
  'Barbell Curl': { ref: 'pull', mult: 0.35 }, 'EZ Curl': { ref: 'pull', mult: 0.35 }, 'Cable Curl With Bar': { ref: 'pull', mult: 0.3 },
  'Dumbbell Curl': { ref: 'pull', mult: 0.12 }, 'Hammer Curl': { ref: 'pull', mult: 0.12 },
  'Leg Extension': { ref: 'squat', mult: 0.5 }, 'Hip Adduction Machine': { ref: 'squat', mult: 0.6 }, 'Hip Abduction Machine': { ref: 'squat', mult: 0.5 },
  'Cable Glute Kickback': { ref: 'squat', mult: 0.15 }, 'Dumbbell Lunge': { ref: 'squat', mult: 0.15 }, 'Standing Calf Raise': { ref: 'squat', mult: 0.6 }
};
function pullReference(oneRMs) {
  const vals = [oneRMs.deadlift, oneRMs.bench].filter(Boolean);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 0.75);
}
export function estimateOneRMForName(name, oneRMs, learnedOneRMs) {
  if (learnedOneRMs && learnedOneRMs[name]) return { value: learnedOneRMs[name], source: 'learned' };
  const directKey = TESTED_LIFT_NAMES[name];
  if (directKey && oneRMs && oneRMs[directKey]) return { value: oneRMs[directKey], source: 'direct' };
  const ratio = exerciseWeightRatio[name];
  if (ratio) {
    const refValue = ratio.ref === 'pull' ? pullReference(oneRMs || {}) : (oneRMs || {})[ratio.ref];
    if (refValue) return { value: Math.round(refValue * ratio.mult), source: 'estimated' };
  }
  return null;
}

// ---------- day-type slot templates ----------
// Same "slot kind" taxonomy the app already used (squat/hinge/pushHoriz/...), now resolved
// against the full library by category + movement-pattern keyword instead of a tiny hardcoded pool.
const SLOT_KINDS = {
  squat: { category: 'Leg Exercises', movementPattern: /squat/i, role: 'primary' },
  hinge: { category: 'Back Exercises', movementPattern: /hip hinge/i, role: 'primary' },
  pushHoriz: { category: 'Chest Exercises', movementPattern: /horizontal push/i, role: 'primary' },
  chestFly: { category: 'Chest Exercises', movementPattern: /horizontal adduction|fly/i, role: 'accessory' },
  // Exact match only — excludes Olympic jerk variants ("Olympic - Vertical Push"), which are
  // technical, coaching-heavy lifts unsuitable as a default pick for a general lift+run program.
  pushVert: { category: 'Shoulder Exercises', movementPattern: /^vertical push$/i, role: 'primary' },
  pullHoriz: { category: 'Back Exercises', movementPattern: /horizontal pull/i, role: 'primary' },
  pullVert: { category: 'Back Exercises', movementPattern: /vertical pull/i, role: 'primary' },
  rearDelt: { category: 'Shoulder Exercises', movementPattern: /horizontal pull/i, role: 'accessory' },
  core: { category: 'Ab Exercises', movementPattern: null, role: 'accessory' },
  legAccessory: { category: ['Leg Exercises', 'Calves Exercises'], movementPattern: /isolation/i, role: 'accessory' },
  pushAccessory: { category: 'Triceps Exercises', movementPattern: null, role: 'accessory' },
  pullAccessory: { category: 'Bicep Exercises', movementPattern: null, role: 'accessory' }
};

const DAY_TYPE_KIND_SEQUENCE = {
  'Full Body A': ['squat', 'pushHoriz', 'pullHoriz', 'core'],
  'Full Body B': ['hinge', 'pushVert', 'pullVert', 'pushAccessory'],
  'Full Body C': ['squat', 'pullHoriz', 'pushVert', 'core'],
  'Upper A': ['pushHoriz', 'pullHoriz', 'pushVert', 'pullVert', 'pushAccessory'],
  'Upper B': ['pushVert', 'pullHoriz', 'pushHoriz', 'pullVert', 'pullAccessory'],
  'Lower A': ['squat', 'hinge', 'legAccessory', 'core'],
  'Lower B': ['hinge', 'squat', 'legAccessory', 'core'],
  Push: ['pushHoriz', 'pushVert', 'chestFly', 'pushAccessory'],
  Pull: ['pullHoriz', 'pullVert', 'rearDelt', 'pullAccessory'],
  Legs: ['squat', 'hinge', 'legAccessory', 'core'],
  Chest: ['pushHoriz', 'chestFly', 'pushHoriz'],
  Back: ['pullHoriz', 'pullVert', 'rearDelt'],
  Shoulders: ['pushVert', 'rearDelt', 'pushVert'],
  Arms: ['pushAccessory', 'pullAccessory', 'pushAccessory', 'pullAccessory'],
  'Chest & Back A': ['pushHoriz', 'pullHoriz', 'chestFly', 'pullVert'],
  'Chest & Back B': ['pullHoriz', 'pushHoriz', 'pullVert', 'chestFly'],
  'Shoulders & Arms A': ['pushVert', 'rearDelt', 'pushAccessory', 'pullAccessory'],
  'Shoulders & Arms B': ['pushVert', 'pushAccessory', 'pullAccessory', 'rearDelt'],
  'Legs A': ['squat', 'hinge', 'legAccessory', 'core'],
  'Legs B': ['hinge', 'squat', 'legAccessory', 'core'],
  'Power Upper': ['pushHoriz', 'pullHoriz', 'pushVert', 'pullVert', 'pushAccessory'],
  'Power Lower': ['squat', 'hinge', 'legAccessory', 'core'],
  'Hyper Upper': ['pushVert', 'pullHoriz', 'pushHoriz', 'pullVert', 'pullAccessory'],
  'Hyper Lower': ['hinge', 'squat', 'legAccessory', 'core']
};

export function slotsForDayType(dayType) {
  const seq = DAY_TYPE_KIND_SEQUENCE[dayType] || DAY_TYPE_KIND_SEQUENCE['Full Body A'];
  return seq.map(kind => ({ kind, ...SLOT_KINDS[kind] }));
}
export function slotForKind(kind) { return { kind, ...SLOT_KINDS[kind] }; }

// ---------- selection ----------
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

const AVOID_KEYWORDS = [
  { re: /squat/i, category: 'Leg Exercises' },
  { re: /deadlift/i, category: 'Back Exercises' },
  { re: /bench|pressing/i, category: 'Chest Exercises' },
  { re: /overhead|shoulder press/i, category: 'Shoulder Exercises' },
  { re: /sprint|running/i, category: 'Leg Exercises' }
];

function categoriesFromAvoidText(text) {
  if (!text || text === 'N/A') return [];
  return AVOID_KEYWORDS.filter(k => k.re.test(text)).map(k => k.category);
}

function candidatesForSlot(slot, { equipmentTier, customExercises }) {
  const categories = Array.isArray(slot.category) ? slot.category : [slot.category];
  const matchesBase = ex => categories.includes(ex.category) && (!slot.movementPattern || slot.movementPattern.test(ex.movementPattern));
  let pool = exerciseLibrary.filter(ex => matchesBase(ex) && ex.equipmentTier === equipmentTier);
  if (pool.length === 0) pool = exerciseLibrary.filter(ex => matchesBase(ex) && ex.equipmentTier === 'bodyweight');
  if (pool.length === 0) pool = exerciseLibrary.filter(matchesBase);
  const custom = (customExercises || [])
    .filter(c => categories.includes(c.category) && c.equipmentTier === equipmentTier)
    .map(c => ({
      exercise: c.name, category: c.category, movementPattern: null, isCompound: false, equipmentTier: c.equipmentTier,
      fatigueScore: 2, cnsScore: 1, areas: [], setsLow: 3, setsHigh: 4, repLow: 8, repHigh: 12,
      priorities: ['Accessory'], supersetCompatible: 'Yes', avoidPairing: 'N/A', isCustom: true
    }));
  return [...pool, ...custom];
}

function reasonNoteFor(ex, slot, categoryFatigue) {
  if (slot.role === 'primary') return `Primary ${ex.isCompound ? 'compound' : ''} movement for ${ex.category.replace(' Exercises', '').toLowerCase()}`.replace('  ', ' ');
  const tally = categoryFatigue.get(ex.category) || 0;
  if (tally > 3) return `Lower-fatigue accessory — ${ex.category.replace(' Exercises', '').toLowerCase()} is already well worked today`;
  if (/^Yes/.test(ex.supersetCompatible || '')) return `Efficient accessory, pairs well for supersetting`;
  return `Adds ${ex.category.replace(' Exercises', '').toLowerCase()} volume without duplicating what's already in this session`;
}

/**
 * Picks one exercise for a slot from the library, scoring candidates on role fit, accumulated
 * per-category fatigue this session, avoid-pairing text, and injury exclusion.
 */
export function selectExerciseForSlot(slot, ctx) {
  const { equipmentTier, injuryAreas = new Set(), usedNames = new Set(), categoryFatigue = new Map(), seqIndex = 0, customExercises = [], tightTime = false } = ctx;
  let candidates = candidatesForSlot(slot, { equipmentTier, customExercises })
    .filter(ex => !usedNames.has(ex.exercise))
    .filter(ex => !ex.areas.some(a => injuryAreas.has(a)));
  if (candidates.length === 0) {
    // Injury exclusion left nothing — relax it rather than fail the slot.
    candidates = candidatesForSlot(slot, { equipmentTier, customExercises }).filter(ex => !usedNames.has(ex.exercise));
  }
  if (candidates.length === 0) {
    // Tiny pool (e.g. bodyweight-only bicep work) already exhausted by an earlier occurrence
    // of this same slot kind today — allow a repeat rather than leaving the slot empty.
    candidates = candidatesForSlot(slot, { equipmentTier, customExercises });
  }
  if (candidates.length === 0) return null;

  const avoidCategories = new Set();
  usedNames.forEach(n => {
    const ex = libraryExerciseByName(n);
    if (ex) categoriesFromAvoidText(ex.avoidPairing).forEach(c => avoidCategories.add(c));
  });

  let best = null, bestScore = -Infinity;
  candidates.forEach(ex => {
    let score = 0;
    if (slot.role === 'primary') {
      if (ex.isCompound) score += 5;
      if (ex.priorities?.includes('Primary')) score += 3;
    } else {
      if (!ex.isCompound) score += 2;
      score += Math.max(0, 4 - ex.fatigueScore);
      if (ex.priorities?.includes('Accessory')) score += 2;
      if (tightTime && /^Yes/.test(ex.supersetCompatible || '')) score += 1;
    }
    score -= (categoryFatigue.get(ex.category) || 0) * 0.6;
    if (avoidCategories.has(ex.category)) score -= 2;
    score += (hashString(ex.exercise + seqIndex) % 7) * 0.05; // deterministic rotation for variety
    if (score > bestScore) { bestScore = score; best = ex; }
  });

  return { exercise: best, reasonNote: reasonNoteFor(best, slot, categoryFatigue) };
}

export function bumpFatigue(categoryFatigue, ex) {
  categoryFatigue.set(ex.category, (categoryFatigue.get(ex.category) || 0) + ex.fatigueScore);
  const secondary = String(ex.secondaryMuscles || '').toLowerCase();
  CATEGORIES.forEach(cat => {
    if (cat === ex.category) return;
    const key = cat.replace(' Exercises', '').toLowerCase();
    if (secondary.includes(key.slice(0, -1))) { // crude singular match, e.g. "tricep" in "Triceps Exercises"
      categoryFatigue.set(cat, (categoryFatigue.get(cat) || 0) + ex.fatigueScore * 0.5);
    }
  });
}

// Final per-day ordering: skill/CNS-demand first, heavy compound before isolation, conditioning last.
export function orderDayExercises(list) {
  const tailPattern = /carry|plyometric|olympic/i;
  return [...list].sort((a, b) => {
    const aTail = tailPattern.test(a.movementPattern) ? 1 : 0;
    const bTail = tailPattern.test(b.movementPattern) ? 1 : 0;
    if (aTail !== bTail) return aTail - bTail;
    const aCore = a.category === 'Ab Exercises' ? 1 : 0;
    const bCore = b.category === 'Ab Exercises' ? 1 : 0;
    if (aCore !== bCore) return aCore - bCore;
    if (b.cnsScore !== a.cnsScore) return b.cnsScore - a.cnsScore;
    if ((b.isCompound ? 1 : 0) !== (a.isCompound ? 1 : 0)) return (b.isCompound ? 1 : 0) - (a.isCompound ? 1 : 0);
    return 0;
  });
}
