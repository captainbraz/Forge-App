import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutDashboard, Dumbbell, Activity, UtensilsCrossed, Flame, Settings,
  ChevronRight, ChevronLeft, Plus, X, Check, AlertTriangle, CalendarDays, RefreshCw, Timer,
  User, BarChart3
} from 'lucide-react';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const INJURY_AREAS = ['Knee', 'Lower back', 'Shoulder', 'Elbow', 'Wrist', 'Hip', 'Ankle', 'Hamstring', 'Achilles', 'Neck', 'Other'];
const DIST_MILES = { '5k': 3.1069, '2mi': 2, '10k': 6.2137, half: 13.1094, marathon: 26.2188 };

// ---------- storage helpers ----------
async function loadKey(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
async function saveKey(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { console.error('storage save failed', e); return false; }
}
async function listKeys(prefix) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) keys.push(k); }
    return keys;
  } catch (e) { return []; }
}

// ---------- date helpers ----------
function getMonday(d = new Date()) {
  const date = new Date(d); const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff); date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function dateKey(d) { return d.toISOString().slice(0, 10); }
function formatDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function todayKey() { return `food:${dateKey(new Date())}`; }

// ---------- 1RM / VDOT / pace math ----------
function epley1RM(weight, reps) { if (!weight || !reps) return null; if (reps === 1) return Math.round(weight); return Math.round(weight * (1 + reps / 30)); }
function riegelPredict(timeMin, fromMiles, toMiles) { return timeMin * Math.pow(toMiles / fromMiles, 1.06); }
function computeVDOT(distMiles, timeMin) {
  const meters = distMiles * 1609.34;
  const velocity = meters / timeMin;
  const vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity;
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMin) + 0.2989558 * Math.exp(-0.1932605 * timeMin);
  return vo2 / pctMax;
}
function paceFromSeconds(sec) { const m = Math.floor(sec / 60); const s = Math.round(sec % 60); return `${m}:${s.toString().padStart(2, '0')}`; }
function parseMinutesInput(val) {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.some(n => isNaN(n))) return null;
    if (parts.length === 2) return parts[0] + parts[1] / 60;
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    return null;
  }
  const n = Number(str);
  return isNaN(n) ? null : n;
}

// ---------- exercise library ----------
const exercisePool = {
  squat: { barbell: ['Back Squat', 'Front Squat', 'Hack Squat', 'Machine Leg Press'], dumbbell: ['Goblet Squat', 'DB Bulgarian Split Squat'], bodyweight: ['Bodyweight Squat', 'Split Squat'] },
  hinge: { barbell: ['Trap Bar Deadlift', 'Stiff-Legged Deadlift', 'Smith Machine Good Morning', 'Cable Pull-Through'], dumbbell: ['DB Romanian Deadlift', 'Single-Leg DB RDL'], bodyweight: ['Glute Bridge', 'Single-Leg Glute Bridge'] },
  pushHoriz: { barbell: ['Barbell Bench Press', 'Barbell Decline Bench Press', 'Smith Machine Bench Press', 'Plate-Loaded Incline Chest Press'], dumbbell: ['Dumbbell Bench Press', 'DB Incline Press'], bodyweight: ['Push-Up', 'Decline Push-Up'] },
  chestFly: { barbell: ['Low Cable Chest Fly', 'Machine Chest Fly'], dumbbell: ['Dumbbell Fly'], bodyweight: ['Wide Push-Up'] },
  pushVert: { barbell: ['Seated Barbell Shoulder Press', 'Overhead Press'], dumbbell: ['DB Shoulder Press', 'Arnold Press'], bodyweight: ['Pike Push-Up', 'Wall Handstand Push-Up'] },
  pullHoriz: { barbell: ['Barbell Row', 'Pendlay Row', 'Cable Row', 'Plate-Loaded Chest-Supported Row'], dumbbell: ['Dumbbell Row', 'Incline Dumbbell Row'], bodyweight: ['Inverted Row', 'Towel Row'] },
  pullVert: { barbell: ['Weighted Pull-Up', 'Reverse-Grip Pulldown', 'Close-Grip Pulldown'], dumbbell: ['DB Pullover'], bodyweight: ['Pull-Up', 'Band-Assisted Pull-Up'] },
  rearDelt: { barbell: ['Cable Face Pull', 'Cable Reverse Fly'], dumbbell: ['DB Rear Delt Fly'], bodyweight: ['Towel Row'] },
  core: { barbell: ['Weighted Plank', 'Machine Back Extension'], dumbbell: ['DB Suitcase Carry', 'Russian Twist'], bodyweight: ['Plank', 'Hanging Knee Raise', 'Hanging Leg Raise', 'Mountain Climber'] },
  legAccessory: { barbell: ['Leg Extension', 'Machine Adduction', 'Machine Abduction', 'Cable Kickback'], dumbbell: ['Dumbbell Lunge'], bodyweight: ['Calf Raise'] },
  pushAccessory: { barbell: ['Rope Tricep Pushdown', 'EZ-Bar Skullcrusher', 'Close-Grip Bench Press'], dumbbell: ['Single-Arm Dumbbell Tricep Extension', 'DB Lateral Raise'], bodyweight: ['Dip', 'Pike Push-Up'] },
  pullAccessory: { barbell: ['Barbell Curl', 'EZ-Bar Curl', 'Cable Bicep Curl', 'Cable Double Bicep Curl'], dumbbell: ['Dumbbell Bicep Curl', 'Hammer Curl', 'Dumbbell Concentration Curl'], bodyweight: ['Chin-Up'] }
};
// Per-exercise sets/rep-range options/style/drop-set guidance. Falls back to the generic goal-based scheme when an exercise isn't listed.
const exerciseSpecs = {
  'Back Squat': { setsRange: [3, 5], repOptions: [[3, 5], [5, 8], [8, 12]], style: 'either', dropSet: 'no' },
  'Front Squat': { setsRange: [3, 5], repOptions: [[3, 5], [5, 8], [8, 12]], style: 'either', dropSet: 'no' },
  'Hack Squat': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12], [12, 15]], style: 'either', dropSet: 'occasionally' },
  'Machine Leg Press': { setsRange: [3, 5], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Trap Bar Deadlift': { setsRange: [2, 4], repOptions: [[3, 5], [5, 8], [8, 12]], style: 'either', dropSet: 'no' },
  'Stiff-Legged Deadlift': { setsRange: [2, 4], repOptions: [[8, 12]], style: 'straight', dropSet: 'no' },
  'Smith Machine Good Morning': { setsRange: [2, 4], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'no' },
  'Cable Pull-Through': { setsRange: [2, 4], repOptions: [[10, 15]], style: 'straight', dropSet: 'occasionally' },
  'Barbell Bench Press': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'either', dropSet: 'no' },
  'Barbell Decline Bench Press': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'either', dropSet: 'no' },
  'Smith Machine Bench Press': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'either', dropSet: 'occasionally' },
  'Plate-Loaded Incline Chest Press': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'either', dropSet: 'occasionally' },
  'Dumbbell Bench Press': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'either', dropSet: 'occasionally' },
  'Low Cable Chest Fly': { setsRange: [2, 4], repOptions: [[10, 15]], style: 'straight', dropSet: 'last_set' },
  'Machine Chest Fly': { setsRange: [2, 4], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'last_set' },
  'Dumbbell Fly': { setsRange: [2, 4], repOptions: [[10, 15]], style: 'straight', dropSet: 'no' },
  'Seated Barbell Shoulder Press': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'either', dropSet: 'no' },
  'Barbell Row': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'either', dropSet: 'no' },
  'Pendlay Row': { setsRange: [2, 4], repOptions: [[3, 5], [5, 8], [8, 12]], style: 'either', dropSet: 'no' },
  'Cable Row': { setsRange: [3, 5], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Plate-Loaded Chest-Supported Row': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'either', dropSet: 'occasionally' },
  'Dumbbell Row': { setsRange: [3, 5], repOptions: [[5, 8], [8, 12]], style: 'straight', dropSet: 'no' },
  'Incline Dumbbell Row': { setsRange: [3, 5], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Weighted Pull-Up': { setsRange: [3, 5], repOptions: [[5, 10]], style: 'straight', dropSet: 'no' },
  'Pull-Up': { setsRange: [3, 5], repOptions: [[5, 10]], style: 'straight', dropSet: 'no' },
  'Reverse-Grip Pulldown': { setsRange: [3, 4], repOptions: [[8, 12]], style: 'straight', dropSet: 'occasionally' },
  'Close-Grip Pulldown': { setsRange: [3, 5], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Cable Face Pull': { setsRange: [2, 4], repOptions: [[12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Cable Reverse Fly': { setsRange: [2, 5], repOptions: [[12, 15]], style: 'straight', dropSet: 'last_set' },
  'Weighted Plank': { setsRange: [2, 4], repOptions: [[1, 1]], style: 'straight', dropSet: 'no' },
  'Machine Back Extension': { setsRange: [2, 4], repOptions: [[8, 15]], style: 'straight', dropSet: 'occasionally' },
  'Russian Twist': { setsRange: [2, 4], repOptions: [[15, 20]], style: 'straight', dropSet: 'no' },
  'Plank': { setsRange: [2, 4], repOptions: [[1, 1]], style: 'straight', dropSet: 'no' },
  'Hanging Knee Raise': { setsRange: [2, 4], repOptions: [[8, 15]], style: 'straight', dropSet: 'no' },
  'Hanging Leg Raise': { setsRange: [2, 4], repOptions: [[8, 15]], style: 'straight', dropSet: 'no' },
  'Mountain Climber': { setsRange: [2, 4], repOptions: [[15, 20]], style: 'straight', dropSet: 'no' },
  'Leg Extension': { setsRange: [2, 5], repOptions: [[10, 15]], style: 'straight', dropSet: 'last_set' },
  'Machine Adduction': { setsRange: [2, 5], repOptions: [[8, 15]], style: 'straight', dropSet: 'last_set' },
  'Machine Abduction': { setsRange: [2, 5], repOptions: [[12, 15]], style: 'straight', dropSet: 'last_set' },
  'Cable Kickback': { setsRange: [2, 4], repOptions: [[12, 15]], style: 'straight', dropSet: 'last_set' },
  'Dumbbell Lunge': { setsRange: [2, 4], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Calf Raise': { setsRange: [3, 5], repOptions: [[8, 15]], style: 'straight', dropSet: 'last_set' },
  'Rope Tricep Pushdown': { setsRange: [3, 5], repOptions: [[10, 15], [12, 20]], style: 'straight', dropSet: 'last_set' },
  'EZ-Bar Skullcrusher': { setsRange: [2, 4], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Single-Arm Dumbbell Tricep Extension': { setsRange: [2, 4], repOptions: [[10, 15]], style: 'straight', dropSet: 'occasionally' },
  'DB Lateral Raise': { setsRange: [2, 5], repOptions: [[12, 15]], style: 'straight', dropSet: 'last_set' },
  'Barbell Curl': { setsRange: [2, 4], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'EZ-Bar Curl': { setsRange: [2, 4], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Cable Bicep Curl': { setsRange: [3, 5], repOptions: [[8, 12], [10, 15]], style: 'straight', dropSet: 'last_set' },
  'Cable Double Bicep Curl': { setsRange: [2, 4], repOptions: [[10, 15], [12, 15]], style: 'straight', dropSet: 'last_set' },
  'Dumbbell Bicep Curl': { setsRange: [2, 4], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Hammer Curl': { setsRange: [2, 4], repOptions: [[8, 12], [12, 15]], style: 'straight', dropSet: 'occasionally' },
  'Dumbbell Concentration Curl': { setsRange: [2, 4], repOptions: [[10, 15]], style: 'straight', dropSet: 'last_set' }
};
function pickRepRange(repOptions, goal) {
  if (repOptions.length === 1) return repOptions[0];
  if (goal === 'strength') return repOptions[0];
  if (goal === 'hypertrophy') return repOptions[repOptions.length - 1];
  return repOptions[Math.floor(repOptions.length / 2)];
}
function pickSetsCount(setsRange, goal) {
  const [lo, hi] = setsRange;
  if (goal === 'strength') return lo;
  if (goal === 'hypertrophy') return hi;
  return Math.round((lo + hi) / 2);
}
function parseRepsRangeStr(str) {
  const nums = (String(str).match(/\d+/g) || []).map(Number);
  if (nums.length >= 2) return [nums[0], nums[1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [8, 12];
}
function prescriptionFor(name, goal) {
  const spec = exerciseSpecs[name];
  if (!spec) return null;
  const [repLow, repHigh] = pickRepRange(spec.repOptions, goal);
  const sets = pickSetsCount(spec.setsRange, goal);
  const style = (spec.style === 'either' && goal === 'strength') ? 'reverse_pyramid' : 'straight';
  return { sets, repLow, repHigh, style, dropSet: spec.dropSet };
}
function repsDisplay(repLow, repHigh) { return repLow === repHigh ? `${repLow}` : `${repLow}-${repHigh}`; }
const patternMuscleGroup = {
  squat: 'legs', hinge: 'legs', legAccessory: 'legs',
  pushHoriz: 'chest', chestFly: 'chest',
  pushVert: 'shoulders', rearDelt: 'shoulders',
  pushAccessory: 'triceps', pullAccessory: 'biceps',
  pullHoriz: 'back', pullVert: 'back',
  core: 'core'
};
function equivalentReps(targetWeight, targetReps, newWeight) {
  if (!targetWeight || !targetReps || !newWeight) return null;
  const target1RM = targetWeight * (1 + targetReps / 30);
  const reps = Math.round(30 * (target1RM / newWeight - 1));
  return Math.max(targetReps, Math.min(40, reps));
}
function buildSetPlan({ sets, repLow, repHigh, style, dropSet, weight, needsWarmup }) {
  const plan = [];
  if (needsWarmup) {
    const warmupWeight = weight ? Math.round((weight * 0.5) / 5) * 5 : null;
    plan.push({ targetWeight: warmupWeight, targetReps: 10, isDrop: false, isWarmup: true });
  }
  for (let i = 0; i < sets; i++) {
    if (style === 'reverse_pyramid') {
      const reps = sets > 1 ? Math.round(repLow + (i * (repHigh - repLow)) / (sets - 1)) : repLow;
      const targetWeight = weight ? Math.round((weight * (1 - 0.1 * i)) / 5) * 5 : null;
      plan.push({ targetWeight, targetReps: reps, isDrop: false });
    } else {
      plan.push({ targetWeight: weight || null, targetReps: repLow, isDrop: false });
    }
  }
  if (dropSet === 'last_set' && plan.length) {
    const workingWeight = plan[plan.length - 1].targetWeight;
    plan.push({ targetWeight: workingWeight ? Math.round((workingWeight * 0.75) / 5) * 5 : null, targetReps: repHigh, isDrop: true });
    plan.push({ targetWeight: workingWeight ? Math.round((workingWeight * 0.50) / 5) * 5 : null, targetReps: repHigh, isDrop: true });
  }
  return plan;
}
const compoundPatterns = new Set(['squat', 'hinge', 'pushHoriz', 'pushVert', 'pullHoriz', 'pullVert']);
const known1RMPatterns = { squat: 'squat', hinge: 'deadlift', pushHoriz: 'bench', pushVert: 'ohp' };
const primaryExerciseForPattern = { squat: 'Back Squat', hinge: 'Trap Bar Deadlift', pushHoriz: 'Barbell Bench Press', pushVert: 'Seated Barbell Shoulder Press' };
// Rough starting-point ratios to the 4 tested lifts, for exercises without their own tested 1RM.
// 'pull' is a derived reference (blend of deadlift + bench) since rows/pulldowns don't map cleanly to either alone.
const exerciseWeightRatio = {
  'Front Squat': { ref: 'squat', mult: 0.85 }, 'Hack Squat': { ref: 'squat', mult: 1.3 }, 'Machine Leg Press': { ref: 'squat', mult: 1.8 },
  'Goblet Squat': { ref: 'squat', mult: 0.35 }, 'DB Bulgarian Split Squat': { ref: 'squat', mult: 0.15 },
  'Trap Bar Deadlift': { ref: 'deadlift', mult: 1.05 }, 'Stiff-Legged Deadlift': { ref: 'deadlift', mult: 0.7 },
  'Smith Machine Good Morning': { ref: 'deadlift', mult: 0.35 }, 'Cable Pull-Through': { ref: 'deadlift', mult: 0.3 },
  'DB Romanian Deadlift': { ref: 'deadlift', mult: 0.15 }, 'Single-Leg DB RDL': { ref: 'deadlift', mult: 0.12 },
  'Barbell Decline Bench Press': { ref: 'bench', mult: 1.05 }, 'Smith Machine Bench Press': { ref: 'bench', mult: 1.05 },
  'Plate-Loaded Incline Chest Press': { ref: 'bench', mult: 0.8 }, 'Dumbbell Bench Press': { ref: 'bench', mult: 0.35 }, 'DB Incline Press': { ref: 'bench', mult: 0.3 },
  'Low Cable Chest Fly': { ref: 'bench', mult: 0.35 }, 'Machine Chest Fly': { ref: 'bench', mult: 0.45 }, 'Dumbbell Fly': { ref: 'bench', mult: 0.15 },
  'DB Shoulder Press': { ref: 'ohp', mult: 0.35 }, 'Arnold Press': { ref: 'ohp', mult: 0.3 },
  'Cable Face Pull': { ref: 'ohp', mult: 0.25 }, 'Cable Reverse Fly': { ref: 'ohp', mult: 0.2 }, 'DB Rear Delt Fly': { ref: 'ohp', mult: 0.08 },
  'Barbell Row': { ref: 'pull', mult: 1.0 }, 'Pendlay Row': { ref: 'pull', mult: 0.95 }, 'Cable Row': { ref: 'pull', mult: 1.0 },
  'Plate-Loaded Chest-Supported Row': { ref: 'pull', mult: 1.0 }, 'Dumbbell Row': { ref: 'pull', mult: 0.4 }, 'Incline Dumbbell Row': { ref: 'pull', mult: 0.35 },
  'Reverse-Grip Pulldown': { ref: 'pull', mult: 0.9 }, 'Close-Grip Pulldown': { ref: 'pull', mult: 0.9 }, 'DB Pullover': { ref: 'pull', mult: 0.25 },
  'Rope Tricep Pushdown': { ref: 'bench', mult: 0.35 }, 'EZ-Bar Skullcrusher': { ref: 'bench', mult: 0.3 }, 'Close-Grip Bench Press': { ref: 'bench', mult: 0.85 },
  'Single-Arm Dumbbell Tricep Extension': { ref: 'bench', mult: 0.15 }, 'DB Lateral Raise': { ref: 'ohp', mult: 0.08 },
  'Barbell Curl': { ref: 'pull', mult: 0.35 }, 'EZ-Bar Curl': { ref: 'pull', mult: 0.35 }, 'Cable Bicep Curl': { ref: 'pull', mult: 0.3 },
  'Cable Double Bicep Curl': { ref: 'pull', mult: 0.3 }, 'Dumbbell Bicep Curl': { ref: 'pull', mult: 0.12 }, 'Hammer Curl': { ref: 'pull', mult: 0.12 },
  'Dumbbell Concentration Curl': { ref: 'pull', mult: 0.08 },
  'Leg Extension': { ref: 'squat', mult: 0.5 }, 'Machine Adduction': { ref: 'squat', mult: 0.6 }, 'Machine Abduction': { ref: 'squat', mult: 0.5 },
  'Cable Kickback': { ref: 'squat', mult: 0.15 }, 'Dumbbell Lunge': { ref: 'squat', mult: 0.15 }, 'Calf Raise': { ref: 'squat', mult: 0.6 }
};
function pullReference(oneRMs) {
  const vals = [oneRMs.deadlift, oneRMs.bench].filter(Boolean);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 0.75);
}
function estimateOneRMFor(name, pattern, oneRMs, learnedOneRMs) {
  if (learnedOneRMs && learnedOneRMs[name]) return { value: learnedOneRMs[name], source: 'learned' };
  const directKey = known1RMPatterns[pattern];
  if (directKey && oneRMs[directKey]) return { value: oneRMs[directKey], source: 'direct' };
  const ratio = exerciseWeightRatio[name];
  if (ratio) {
    const refValue = ratio.ref === 'pull' ? pullReference(oneRMs) : oneRMs[ratio.ref];
    if (refValue) return { value: Math.round(refValue * ratio.mult), source: 'estimated' };
  }
  return null;
}
const patternAreaMap = {
  squat: ['Knee', 'Hip', 'Lower back'], hinge: ['Lower back', 'Hamstring'], pushHoriz: ['Shoulder', 'Elbow', 'Wrist'],
  chestFly: ['Shoulder'], pushVert: ['Shoulder', 'Elbow'], pullHoriz: ['Lower back', 'Shoulder'], pullVert: ['Shoulder', 'Elbow'],
  rearDelt: ['Shoulder'], core: ['Lower back'], legAccessory: ['Knee', 'Hip', 'Ankle'],
  pushAccessory: ['Shoulder', 'Elbow'], pullAccessory: ['Elbow', 'Shoulder']
};
const exerciseAreaOverride = {
  Dip: ['Shoulder'], 'Calf Raise': ['Ankle', 'Achilles'], 'DB Lateral Raise': ['Shoulder'], 'Wall Handstand Push-Up': ['Shoulder', 'Wrist'],
  'Weighted Pull-Up': ['Shoulder', 'Elbow'], 'Pull-Up': ['Shoulder', 'Elbow'], 'Close-Grip Bench Press': ['Elbow', 'Wrist'], 'DB Rear Delt Fly': ['Shoulder']
};
function areasForExercise(pattern, name) { return exerciseAreaOverride[name] || patternAreaMap[pattern] || []; }

const splitFamilies = {
  full_body: { label: 'Full Body', sequence: ['Full Body A', 'Full Body B', 'Full Body C'] },
  upper_lower: { label: 'Upper / Lower', sequence: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] },
  ppl: { label: 'Push / Pull / Legs', sequence: ['Push', 'Pull', 'Legs'] },
  ppl_fb: { label: 'Push / Pull / Legs / Full Body', sequence: ['Push', 'Pull', 'Legs', 'Full Body A'], onlyForDayCount: 4 }
};
const patternsByDayType = {
  'Full Body A': ['squat', 'pushHoriz', 'pullHoriz', 'core'],
  'Full Body B': ['hinge', 'pushVert', 'pullVert', 'pushAccessory'],
  'Full Body C': ['squat', 'pullHoriz', 'pushVert', 'core'],
  'Upper A': ['pushHoriz', 'pullHoriz', 'pushVert', 'pullVert', 'pushAccessory'],
  'Upper B': ['pushVert', 'pullHoriz', 'pushHoriz', 'pullVert', 'pullAccessory'],
  'Lower A': ['squat', 'hinge', 'legAccessory', 'core'],
  'Lower B': ['hinge', 'squat', 'legAccessory', 'core'],
  Push: ['pushHoriz', 'pushVert', 'chestFly', 'pushAccessory'],
  Pull: ['pullHoriz', 'pullVert', 'rearDelt', 'pullAccessory'],
  Legs: ['squat', 'hinge', 'legAccessory', 'core']
};
function repSchemeFor(goal) {
  return {
    strength: { compoundSets: 4, compoundReps: '4-6', compoundPct: 0.85, accessorySets: 3, accessoryReps: '8', rest: '2-3 min' },
    hypertrophy: { compoundSets: 4, compoundReps: '8-10', compoundPct: 0.70, accessorySets: 3, accessoryReps: '12-15', rest: '60-90 sec' },
    hybrid: { compoundSets: 3, compoundReps: '5-6', compoundPct: 0.78, accessorySets: 3, accessoryReps: '12', rest: '90 sec' }
  }[goal];
}
function restForStyle(baseRest, style, dropSet) {
  if (style === 'reverse_pyramid') return '2-3 min (less on later sets)';
  if (dropSet === 'last_set' || dropSet === 'occasionally') return `${baseRest} (no rest into drop set)`;
  return baseRest;
}
function exerciseNote(ex) {
  const parts = [];
  if (ex.style === 'reverse_pyramid') parts.push('reverse pyramid');
  if (ex.dropSet === 'last_set') parts.push('drop set on last set');
  else if (ex.dropSet === 'occasionally') parts.push('drop set optional');
  return parts.join(' · ');
}
function weightSourceNote(ex) {
  if (ex.weightSource === 'estimated') return 'estimated from your tested lifts';
  if (ex.weightSource === 'learned') return 'based on what you last lifted here';
  return '';
}
function setRowLabel(ex, si) {
  const warmupOffset = ex.needsWarmup ? 1 : 0;
  if (warmupOffset && si === 0) return { label: 'Warm-up', color: 'text-teal-400' };
  if (si < warmupOffset + ex.sets) return { label: `Set ${si - warmupOffset + 1}`, color: 'text-zinc-500' };
  return { label: `Drop ${si - warmupOffset - ex.sets + 1}`, color: 'text-amber-500' };
}
function buildDayExercises(dayType, seqIndex, { equipment, goal, oneRMs, learnedOneRMs }) {
  const patterns = patternsByDayType[dayType] || patternsByDayType['Full Body A'];
  const repScheme = repSchemeFor(goal);
  const occurrenceByPattern = {};
  const seenMuscleGroups = new Set();
  return patterns.map((pattern, i) => {
    const pool = exercisePool[pattern][equipment] || exercisePool[pattern].bodyweight;
    const occurrence = occurrenceByPattern[pattern] || 0;
    occurrenceByPattern[pattern] = occurrence + 1;
    const name = pool[(seqIndex + occurrence) % pool.length];
    const isCompound = compoundPatterns.has(pattern);
    const prescription = prescriptionFor(name, goal);
    const sets = prescription ? prescription.sets : (isCompound ? repScheme.compoundSets : repScheme.accessorySets);
    const [repLow, repHigh] = prescription ? [prescription.repLow, prescription.repHigh] : parseRepsRangeStr(isCompound ? repScheme.compoundReps : repScheme.accessoryReps);
    const style = prescription ? prescription.style : 'straight';
    const dropSet = prescription ? prescription.dropSet : 'no';
    const estimate = estimateOneRMFor(name, pattern, oneRMs, learnedOneRMs);
    const pct1RM = estimate ? +(1 / (1 + repLow / 30)).toFixed(3) : null;
    const muscleGroup = patternMuscleGroup[pattern] || pattern;
    const needsWarmup = !seenMuscleGroups.has(muscleGroup);
    seenMuscleGroups.add(muscleGroup);
    return {
      id: `${dayType}-${pattern}-${i}`, name, pattern, isCompound, muscleGroup, needsWarmup,
      sets, repLow, repHigh, reps: repsDisplay(repLow, repHigh),
      rest: restForStyle(repScheme.rest, style, dropSet),
      style, dropSet,
      pct1RM,
      oneRMValue: estimate ? estimate.value : null,
      weightSource: estimate ? estimate.source : null,
      loadNote: estimate ? null : 'RPE 7-8 · pick a challenging weight',
      areas: areasForExercise(pattern, name)
    };
  });
}
function estimateSessionMinutes(exercises) {
  return exercises.reduce((sum, ex) => sum + ex.sets * (ex.isCompound ? 3.5 : 2), 5);
}
function trimToTimeBudget(exercises, targetMinutes) {
  let list = [...exercises];
  while (estimateSessionMinutes(list) > targetMinutes && list.length > 2) {
    let idx = -1;
    for (let i = list.length - 1; i >= 0; i--) { if (!list[i].isCompound) { idx = i; break; } }
    if (idx === -1) idx = list.length - 1;
    list.splice(idx, 1);
  }
  return list;
}
function accessoryPatternForDayType(dayType) {
  if (dayType.startsWith('Push')) return 'pushAccessory';
  if (dayType.startsWith('Pull')) return 'pullAccessory';
  if (dayType.startsWith('Legs') || dayType.startsWith('Lower')) return 'legAccessory';
  return 'pushAccessory';
}
function padToTimeBudget(exercises, targetMinutes, dayType, seqIndex, { equipment, goal, oneRMs, learnedOneRMs }) {
  let list = [...exercises];
  const repScheme = repSchemeFor(goal);
  const patternKey = accessoryPatternForDayType(dayType);
  const seenMuscleGroups = new Set(list.map(e => e.muscleGroup));
  let guard = 0;
  while (estimateSessionMinutes(list) < targetMinutes - 15 && list.length < 7 && guard < 3) {
    const pool = exercisePool[patternKey][equipment] || exercisePool[patternKey].bodyweight;
    const usedNames = new Set(list.map(e => e.name));
    const freshName = pool.find(n => !usedNames.has(n));
    if (!freshName) break;
    const prescription = prescriptionFor(freshName, goal);
    const [repLow, repHigh] = prescription ? [prescription.repLow, prescription.repHigh] : parseRepsRangeStr(repScheme.accessoryReps);
    const muscleGroup = patternMuscleGroup[patternKey] || patternKey;
    const needsWarmup = !seenMuscleGroups.has(muscleGroup);
    seenMuscleGroups.add(muscleGroup);
    const estimate = estimateOneRMFor(freshName, patternKey, oneRMs || {}, learnedOneRMs);
    const pct1RM = estimate ? +(1 / (1 + repLow / 30)).toFixed(3) : null;
    list.push({
      id: `${dayType}-fill-${list.length}`, name: freshName, pattern: patternKey, isCompound: false, muscleGroup, needsWarmup,
      sets: prescription ? prescription.sets : repScheme.accessorySets, repLow, repHigh, reps: repsDisplay(repLow, repHigh),
      rest: prescription ? restForStyle(repScheme.rest, prescription.style, prescription.dropSet) : repScheme.rest,
      style: prescription ? prescription.style : 'straight', dropSet: prescription ? prescription.dropSet : 'no',
      pct1RM, oneRMValue: estimate ? estimate.value : null, weightSource: estimate ? estimate.source : null,
      loadNote: estimate ? null : 'RPE 7-8 · pick a challenging weight', areas: areasForExercise(patternKey, freshName)
    });
    guard++;
  }
  return list;
}
function weightForWeek(exercise, weekIndex) {
  const hasWeight = !!exercise.oneRMValue;
  const pctBump = hasWeight ? (weekIndex < 3 ? weekIndex * 0.025 : -0.05) : 0;
  const setsAdj = weekIndex === 3 ? Math.max(2, exercise.sets - 1) : exercise.sets;
  const weight = hasWeight ? Math.round((exercise.oneRMValue * (exercise.pct1RM + pctBump)) / 5) * 5 : null;
  const setPlan = buildSetPlan({ sets: setsAdj, repLow: exercise.repLow, repHigh: exercise.repHigh, style: exercise.style, dropSet: exercise.dropSet, weight, needsWarmup: exercise.needsWarmup });
  return { ...exercise, sets: setsAdj, weight, setPlan };
}
function recalculateFutureWeights(calendarData, profile, todayStr) {
  return calendarData.map((week, weekIndex) => ({
    ...week,
    days: Object.fromEntries(Object.entries(week.days).map(([wd, entry]) => {
      if (!entry.lift || entry.date <= todayStr) return [wd, entry];
      const exercises = entry.lift.exercises.map(ex => {
        const estimate = estimateOneRMFor(ex.name, ex.pattern, profile.oneRMs || {}, profile.learnedOneRMs);
        if (!estimate) return ex;
        const pct1RM = +(1 / (1 + ex.repLow / 30)).toFixed(3);
        const pctBump = weekIndex < 3 ? weekIndex * 0.025 : -0.05;
        const weight = Math.round((estimate.value * (pct1RM + pctBump)) / 5) * 5;
        const setPlan = buildSetPlan({ sets: ex.sets, repLow: ex.repLow, repHigh: ex.repHigh, style: ex.style, dropSet: ex.dropSet, weight, needsWarmup: ex.needsWarmup });
        return { ...ex, oneRMValue: estimate.value, weightSource: estimate.source, pct1RM, weight, setPlan, loadNote: null };
      });
      return [wd, { ...entry, lift: { ...entry.lift, exercises } }];
    }))
  }));
}

// ---------- autoregulation (Phase 3) ----------
function minRepsFromLabel(repsLabel) {
  const n = parseInt(String(repsLabel).match(/\d+/), 10);
  return isNaN(n) ? 0 : n;
}
function evaluateExerciseLog(exercise, log) {
  if (log.rpe == null) return null;
  const warmupOffset = exercise.needsWarmup ? 1 : 0;
  const workingWeights = [];
  for (let i = warmupOffset; i < warmupOffset + exercise.sets; i++) {
    const s = log.sets[i];
    if (s && s.done) { const w = Number(s.weight); if (!isNaN(w) && w > 0) workingWeights.push(w); }
  }
  if (workingWeights.length === 0) return null;
  const avgWeight = workingWeights.reduce((a, b) => a + b, 0) / workingWeights.length;
  const fallbackMinReps = minRepsFromLabel(exercise.reps);
  const repsShortfall = log.sets.some((s, i) => {
    if (!s.done || s.reps === '') return false;
    const target = (exercise.setPlan && exercise.setPlan[i]) ? exercise.setPlan[i].targetReps : fallbackMinReps;
    return Number(s.reps) < target;
  });
  if (log.rpe >= 9 || repsShortfall) {
    return { direction: 'decrease', newWeight: Math.round((avgWeight * 0.93) / 5) * 5, reason: repsShortfall ? `Missed target reps at RPE ${log.rpe} last time.` : `RPE ${log.rpe} was near max effort — pulling back slightly.` };
  }
  if (log.rpe <= 6 && !repsShortfall) {
    return { direction: 'increase', newWeight: Math.round((avgWeight * 1.04) / 5) * 5, reason: `RPE ${log.rpe} with all reps hit — ready for more.` };
  }
  return null;
}
function computeLearnedOneRM(exercise, log) {
  const warmupOffset = exercise.needsWarmup ? 1 : 0;
  let best = null;
  for (let i = warmupOffset; i < warmupOffset + exercise.sets; i++) {
    const s = log.sets[i];
    if (!s || !s.done) continue;
    const w = Number(s.weight), r = Number(s.reps);
    if (!w || !r) continue;
    const oneRM = epley1RM(w, r);
    if (oneRM && (!best || oneRM > best)) best = oneRM;
  }
  return best;
}
function patternForExerciseName(name) {
  for (const [pattern, tiers] of Object.entries(exercisePool)) {
    for (const list of Object.values(tiers)) { if (list.includes(name)) return pattern; }
  }
  return null;
}
function currentOneRMFor(name, profile, bestHistorical) {
  if (profile.learnedOneRMs && profile.learnedOneRMs[name]) return profile.learnedOneRMs[name];
  const pattern = patternForExerciseName(name);
  const directKey = pattern && known1RMPatterns[pattern];
  if (directKey && primaryExerciseForPattern[pattern] === name && profile.oneRMs && profile.oneRMs[directKey]) return profile.oneRMs[directKey];
  return bestHistorical || null;
}
function aggregateExerciseStats(logs, profile) {
  const byName = {};
  logs.forEach(log => {
    if (!log.lift) return;
    Object.values(log.lift).forEach(exLog => {
      const name = exLog.swappedName || exLog.name;
      if (!name) return;
      const workingSets = exLog.sets.filter(s => s.done && s.weight && s.reps);
      if (workingSets.length === 0) return;
      let bestOneRM = null;
      workingSets.forEach(s => {
        const rm = epley1RM(Number(s.weight), Number(s.reps));
        if (rm && (!bestOneRM || rm > bestOneRM)) bestOneRM = rm;
      });
      if (!byName[name]) byName[name] = { count: 0, history: [], bestOneRM: null };
      byName[name].count += 1;
      byName[name].history.push({ date: log.date, sets: workingSets, oneRM: bestOneRM, rpe: exLog.rpe });
      if (bestOneRM && (!byName[name].bestOneRM || bestOneRM > byName[name].bestOneRM)) byName[name].bestOneRM = bestOneRM;
    });
  });
  Object.entries(byName).forEach(([name, entry]) => {
    entry.history.sort((a, b) => b.date.localeCompare(a.date));
    entry.currentOneRM = currentOneRMFor(name, profile, entry.bestOneRM);
  });
  return byName;
}
function aggregateRunStats(logs, profile) {
  const spec = qualitySpecs[profile?.runGoal] || qualitySpecs.general;
  const runs = [];
  const warmupPaces = [];
  const cooldownPaces = [];
  logs.forEach(l => {
    if (!l.run) return;
    let distance = null, time = null;
    if (l.run.warmup) {
      let dist = 0, sec = 0;
      const addPhase = (p) => { if (p && p.distance && p.time) { const s = timeStrToSeconds(p.time); if (s != null) { dist += Number(p.distance); sec += s; } } };
      addPhase(l.run.warmup); addPhase(l.run.cooldown);
      if (l.run.tempo) addPhase(l.run.tempo);
      if (l.run.intervals) l.run.intervals.forEach(iv => { const s = iv && timeStrToSeconds(iv.time); if (s != null) { sec += s; dist += spec.intervalMiles; } });
      if (dist > 0) { distance = +dist.toFixed(2); time = secondsToTimeStr(sec); }
      if (l.run.warmup.distance && l.run.warmup.time) { const p = actualPaceSeconds(l.run.warmup.distance, l.run.warmup.time); if (p) warmupPaces.push(p); }
      if (l.run.cooldown && l.run.cooldown.distance && l.run.cooldown.time) { const p = actualPaceSeconds(l.run.cooldown.distance, l.run.cooldown.time); if (p) cooldownPaces.push(p); }
    } else if (l.run.time && l.run.distance) {
      distance = Number(l.run.distance); time = l.run.time;
    }
    if (distance && time) runs.push({ date: l.date, distance, time, effort: l.run.effort, notes: l.run.notes });
  });
  runs.sort((a, b) => b.date.localeCompare(a.date));
  const totalDistance = runs.reduce((sum, r) => sum + (r.distance || 0), 0);
  let totalSeconds = 0, timedDistance = 0;
  runs.forEach(r => { const s = timeStrToSeconds(r.time); if (s != null) { totalSeconds += s; timedDistance += r.distance; } });
  const avgPaceMinPerMile = timedDistance > 0 ? (totalSeconds / 60) / timedDistance : null;
  const avgWarmupPace = warmupPaces.length ? warmupPaces.reduce((a, b) => a + b, 0) / warmupPaces.length : null;
  const avgCooldownPace = cooldownPaces.length ? cooldownPaces.reduce((a, b) => a + b, 0) / cooldownPaces.length : null;
  return {
    runs, count: runs.length, totalDistance: +totalDistance.toFixed(1),
    avgPace: avgPaceMinPerMile ? paceFromSeconds(avgPaceMinPerMile * 60) : null,
    avgWarmupPace: avgWarmupPace ? paceFromSeconds(avgWarmupPace) : null,
    avgCooldownPace: avgCooldownPace ? paceFromSeconds(avgCooldownPace) : null
  };
}
function runDetailText(type, distance, paces) {
  if (type === 'Easy') return `${distance} mi conversational` + (paces ? ` (~${paces.easy}/mi)` : '');
  if (type === 'Long') return `${distance} mi steady` + (paces ? ` (~${paces.easy}/mi or slower)` : '');
  return `${distance} mi`;
}
function evaluateRunLog(runEntry, log) {
  if (!log.time || log.effort == null) return null;
  const actualDist = Number(log.distance);
  if (!actualDist) return null;
  const planned = runEntry.distance;
  if ((runEntry.type === 'Easy' || runEntry.type === 'Long') && log.effort >= 8) {
    return { direction: 'decrease', newDistance: +(planned * 0.9).toFixed(1), reason: `Felt much harder than a ${runEntry.type.toLowerCase()} run should (RPE ${log.effort}) — trimming mileage slightly.` };
  }
  if (actualDist < planned * 0.8) {
    return { direction: 'decrease', newDistance: +(actualDist * 1.05).toFixed(1), reason: 'Came in under the planned distance — matching the next target closer to what you actually covered.' };
  }
  if ((runEntry.type === 'Quality' || runEntry.type === 'Tempo') && log.effort <= 4) {
    return { direction: 'increase', newDistance: +(planned * 1.1).toFixed(1), reason: `Felt easy for a ${runEntry.type.toLowerCase()} session (RPE ${log.effort}) — a bit more next time.` };
  }
  return null;
}
function buildRunLogSkeleton(runEntry) {
  if (!runEntry) return null;
  if (runEntry.type === 'Quality') {
    return { warmup: { distance: '', time: '' }, intervals: Array.from({ length: runEntry.reps || 6 }, () => ({ time: '' })), cooldown: { distance: '', time: '' }, effort: 5, notes: '', avgHR: null, maxHR: null };
  }
  if (runEntry.type === 'Tempo') {
    return { warmup: { distance: '', time: '' }, tempo: { distance: '', time: '' }, cooldown: { distance: '', time: '' }, effort: 5, notes: '', avgHR: null, maxHR: null };
  }
  return { distance: '', time: '', effort: 5, notes: '', avgHR: null, maxHR: null };
}
function timeStrToSeconds(str) {
  const parts = String(str).split(':').map(Number);
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}
function secondsToTimeStr(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function actualPaceSeconds(distance, timeStr) {
  const d = Number(distance);
  const sec = timeStrToSeconds(timeStr);
  if (!d || sec == null) return null;
  return sec / d;
}
function paceDiffLabel(actualSeconds, prescribedSeconds) {
  if (!actualSeconds || !prescribedSeconds) return null;
  const diff = Math.round(actualSeconds - prescribedSeconds);
  if (Math.abs(diff) <= 2) return { text: 'on pace', color: 'text-teal-400' };
  if (diff > 0) return { text: `+${diff}s slow`, color: 'text-orange-400' };
  return { text: `${Math.abs(diff)}s fast`, color: 'text-teal-400' };
}
function runLogTotals(runEntry, log, profile) {
  if (runEntry.type !== 'Quality' && runEntry.type !== 'Tempo') {
    return { distance: log.distance, time: log.time };
  }
  let totalDistance = 0, totalSeconds = 0;
  const addPhase = (p) => {
    if (p && p.distance && p.time) {
      const sec = timeStrToSeconds(p.time);
      if (sec != null) { totalDistance += Number(p.distance); totalSeconds += sec; }
    }
  };
  addPhase(log.warmup); addPhase(log.cooldown);
  if (runEntry.type === 'Tempo') addPhase(log.tempo);
  if (runEntry.type === 'Quality' && log.intervals) {
    const spec = qualitySpecs[profile.runGoal] || qualitySpecs.general;
    log.intervals.forEach(iv => {
      const sec = iv && timeStrToSeconds(iv.time);
      if (sec != null) { totalSeconds += sec; totalDistance += spec.intervalMiles; }
    });
  }
  if (!totalDistance) return { distance: '', time: '' };
  return { distance: +totalDistance.toFixed(2), time: secondsToTimeStr(totalSeconds) };
}

// ---------- Garmin TCX upload ----------
function parseTCX(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const lapNodes = Array.from(doc.getElementsByTagName('Lap'));
  if (lapNodes.length === 0) return null;
  return lapNodes.map(lap => {
    const timeSec = parseFloat(lap.getElementsByTagName('TotalTimeSeconds')[0]?.textContent) || 0;
    const distanceM = parseFloat(lap.getElementsByTagName('DistanceMeters')[0]?.textContent) || 0;
    const avgHrEl = lap.getElementsByTagName('AverageHeartRateBpm')[0];
    const avgHR = avgHrEl ? parseFloat(avgHrEl.getElementsByTagName('Value')[0]?.textContent) : null;
    const maxHrEl = lap.getElementsByTagName('MaximumHeartRateBpm')[0];
    const maxHR = maxHrEl ? parseFloat(maxHrEl.getElementsByTagName('Value')[0]?.textContent) : null;
    return { distanceMiles: distanceM / 1609.34, timeSec, avgHR: avgHR || null, maxHR: maxHR || null };
  });
}
function lapsOverallStats(laps) {
  const totalDistance = laps.reduce((s, l) => s + l.distanceMiles, 0);
  const totalTimeSec = laps.reduce((s, l) => s + l.timeSec, 0);
  const hrLaps = laps.filter(l => l.avgHR);
  const hrWeightedTime = hrLaps.reduce((s, l) => s + l.timeSec, 0);
  const avgHR = hrLaps.length ? Math.round(hrLaps.reduce((s, l) => s + l.avgHR * l.timeSec, 0) / hrWeightedTime) : null;
  const maxHR = laps.reduce((m, l) => (l.maxHR && l.maxHR > m ? l.maxHR : m), 0) || null;
  return { totalDistance: +totalDistance.toFixed(2), totalTimeSec, avgHR, maxHR };
}
function mapLapsToPhases(laps, runEntry) {
  if (runEntry.type === 'Quality' && runEntry.reps && laps.length === runEntry.reps + 2) {
    return {
      warmup: { distance: +laps[0].distanceMiles.toFixed(2), time: secondsToTimeStr(laps[0].timeSec) },
      intervals: laps.slice(1, 1 + runEntry.reps).map(l => ({ time: secondsToTimeStr(l.timeSec) })),
      cooldown: { distance: +laps[laps.length - 1].distanceMiles.toFixed(2), time: secondsToTimeStr(laps[laps.length - 1].timeSec) }
    };
  }
  if (runEntry.type === 'Tempo' && laps.length === 3) {
    return {
      warmup: { distance: +laps[0].distanceMiles.toFixed(2), time: secondsToTimeStr(laps[0].timeSec) },
      tempo: { distance: +laps[1].distanceMiles.toFixed(2), time: secondsToTimeStr(laps[1].timeSec) },
      cooldown: { distance: +laps[2].distanceMiles.toFixed(2), time: secondsToTimeStr(laps[2].timeSec) }
    };
  }
  return null;
}
function analyzeRunUpload(runEntry, overall, profile) {
  const feedback = [];
  const paces = computePaces(profile);
  const actualPaceSec = overall.totalDistance ? overall.totalTimeSec / overall.totalDistance : null;
  if (actualPaceSec && paces) {
    const prescribedPaceSec = {
      Easy: paceStrToMinutes(paces.easy) * 60, Long: paceStrToMinutes(paces.easy) * 60,
      Tempo: paceStrToMinutes(paces.tempo) * 60, Quality: paceStrToMinutes(paces.interval) * 60
    }[runEntry.type];
    if (prescribedPaceSec) {
      const diff = paceDiffLabel(actualPaceSec, prescribedPaceSec);
      feedback.push(`Overall pace: ${paceFromSeconds(actualPaceSec)}/mi${diff ? ` — ${diff.text} vs your ~${paceFromSeconds(prescribedPaceSec)}/mi target` : ''}`);
    }
  }
  if (overall.avgHR && profile.age) {
    const hrMax = 220 - profile.age;
    const pct = Math.round((overall.avgHR / hrMax) * 100);
    let note = `Average HR ${overall.avgHR} bpm (~${pct}% of estimated max ${hrMax}).`;
    if ((runEntry.type === 'Easy' || runEntry.type === 'Long') && pct > 78) note += ' Higher than typical for this effort — the pace may have been a bit hot for an easy day.';
    else if ((runEntry.type === 'Quality' || runEntry.type === 'Tempo') && pct < 75) note += ' Lower than expected for this effort — there may be room to push harder next time.';
    feedback.push(note);
  }
  if (!feedback.length) feedback.push('Distance and HR data loaded, but not enough to compare against a target for this run type.');
  return feedback;
}

// ---------- running ----------
const WARMUP_MIN = 12, COOLDOWN_MIN = 8;
const qualitySpecs = {
  '5k': { repsLow: 6, repsHigh: 8, intervalMiles: 0.25, recoveryMin: 1.5, label: '400m @ 5k effort' },
  '10k': { repsLow: 4, repsHigh: 6, intervalMiles: 0.5, recoveryMin: 2, label: '800m @ 10k effort' },
  half: { repsLow: 3, repsHigh: 5, intervalMiles: 1, recoveryMin: 3, label: '1mi @ half-marathon effort' },
  marathon: { repsLow: 2, repsHigh: 4, intervalMiles: 2, recoveryMin: 3, label: '2mi @ marathon effort' },
  general: { repsLow: 5, repsHigh: 7, intervalMiles: 0.375, recoveryMin: 2, label: '3min hard / 2min easy fartlek' }
};
function paceStrToMinutes(str) {
  const parts = String(str).split(':').map(Number);
  if (parts.some(n => isNaN(n))) return 10;
  return parts[0] + parts[1] / 60;
}
function qualityRepsForWeek(spec, weekIndex) {
  if (weekIndex === 3) return spec.repsLow;
  const span = spec.repsHigh - spec.repsLow;
  return Math.round(spec.repsLow + (span * weekIndex) / 2);
}
function qualitySessionFromReps(spec, reps, easyPaceMinPerMile) {
  const recoveryMiles = +(spec.recoveryMin / easyPaceMinPerMile).toFixed(2);
  const warmupMiles = +(WARMUP_MIN / easyPaceMinPerMile).toFixed(1);
  const cooldownMiles = +(COOLDOWN_MIN / easyPaceMinPerMile).toFixed(1);
  const mainMiles = reps * (spec.intervalMiles + recoveryMiles);
  const totalMiles = +(warmupMiles + mainMiles + cooldownMiles).toFixed(1);
  const detail = `${warmupMiles}mi warmup, ${reps} x ${spec.label} (jog recovery), ${cooldownMiles}mi cooldown — ${totalMiles}mi total`;
  return { totalMiles, detail, reps };
}
function computeQualitySession(runGoal, weekIndex, easyPaceMinPerMile) {
  const spec = qualitySpecs[runGoal] || qualitySpecs.general;
  return qualitySessionFromReps(spec, qualityRepsForWeek(spec, weekIndex), easyPaceMinPerMile);
}
function computeQualitySessionForDistance(runGoal, easyPaceMinPerMile, targetDistance) {
  const spec = qualitySpecs[runGoal] || qualitySpecs.general;
  const recoveryMiles = spec.recoveryMin / easyPaceMinPerMile;
  const warmupMiles = WARMUP_MIN / easyPaceMinPerMile;
  const cooldownMiles = COOLDOWN_MIN / easyPaceMinPerMile;
  const perRep = spec.intervalMiles + recoveryMiles;
  let reps = Math.round((targetDistance - warmupMiles - cooldownMiles) / perRep);
  reps = Math.max(2, Math.min(spec.repsHigh + 2, reps));
  return qualitySessionFromReps(spec, reps, easyPaceMinPerMile);
}
function tempoSessionFromMiles(tempoMiles, easyPaceMinPerMile, tempoPace) {
  const warmupMiles = +(WARMUP_MIN / easyPaceMinPerMile).toFixed(1);
  const cooldownMiles = +(COOLDOWN_MIN / easyPaceMinPerMile).toFixed(1);
  const totalMiles = +(warmupMiles + tempoMiles + cooldownMiles).toFixed(1);
  const detail = `${warmupMiles}mi warmup, ${tempoMiles}mi @ tempo pace${tempoPace ? ` (~${tempoPace}/mi)` : ''}, ${cooldownMiles}mi cooldown — ${totalMiles}mi total`;
  return { totalMiles, detail };
}
function computeTempoSession(weeklyMiles, easyPaceMinPerMile, tempoPace) {
  return tempoSessionFromMiles(+(weeklyMiles * 0.12).toFixed(1), easyPaceMinPerMile, tempoPace);
}
function computeTempoSessionForDistance(easyPaceMinPerMile, tempoPace, targetDistance) {
  const warmupMiles = WARMUP_MIN / easyPaceMinPerMile;
  const cooldownMiles = COOLDOWN_MIN / easyPaceMinPerMile;
  const tempoMiles = Math.max(1, +(targetDistance - warmupMiles - cooldownMiles).toFixed(1));
  return tempoSessionFromMiles(tempoMiles, easyPaceMinPerMile, tempoPace);
}
function simpleRunDetail(type, distance) {
  return `${distance} mi (adjusted based on your last ${type.toLowerCase()} session)`;
}
function liftDayPurpose(dayType, strengthGoal) {
  const base = {
    'Full Body A': 'A balanced full-body stimulus — efficient coverage when you\'re training fewer days a week.',
    'Full Body B': 'Full-body again, different pattern emphasis so no muscle group goes untouched between sessions.',
    'Full Body C': 'The third full-body angle in the rotation, rounding out the week\'s coverage.',
    'Upper A': 'Upper body strength and size, paired with a separate lower day so your legs get focused recovery.',
    'Upper B': 'Second upper session — same muscles, different exercise order and emphasis for balanced development.',
    'Lower A': 'Quads, hamstrings, glutes, and core — the foundation of athletic power and injury-resistant legs.',
    'Lower B': 'Second leg day — different squat/hinge emphasis so the same muscles get hit from a new angle.',
    Push: 'Chest, shoulders, and triceps — the pushing muscles trained together for efficient recovery before they\'re hit again.',
    Pull: 'Back and biceps — balances your pushing volume and keeps shoulder health in check.',
    Legs: 'Quads, hamstrings, glutes, and core — the biggest muscles in the body and the base of total-body strength.'
  }[dayType] || 'A structured session built around your split.';
  const goalNote = { strength: ' Heavier loads, lower reps — built for max strength.', hypertrophy: ' Moderate loads, higher volume — built for muscle growth.', hybrid: ' A blend of load and volume to support both strength and your running.' }[strengthGoal] || '';
  return base + goalNote;
}
function runTypePurpose(runType) {
  return {
    Easy: 'Builds aerobic base and capillary density without adding fatigue — most of your running volume should live here.',
    Long: 'Extends endurance capacity and trains your body to use fat as fuel over time — the backbone of anything beyond a 10K.',
    Tempo: 'Raises your lactate threshold, the pace you can hold before fatigue piles up fast — directly improves sustainable race pace.',
    Quality: 'Improves VO2max and running economy — the top-end speed and efficiency that makes every other pace feel easier.'
  }[runType] || 'Part of your weekly training stimulus.';
}
const REST_MESSAGES = [
  'Full rest today — recovery is when the actual adaptation happens. Nothing to prove, just let it absorb.',
  'Nothing scheduled today. Your body does the rebuilding on days like this, not in the gym.',
  'Rest is part of the program, not a break from it. Enjoy it.',
  'A quiet day. Sleep, eat well, and let the work you\'ve put in actually take hold.'
];
const ACTIVE_RECOVERY_MESSAGES = [
  'Active recovery today — a walk, an easy spin, some light mobility. Keep the blood flowing without adding stress.',
  'Light movement only. This is about circulation and loosening up, not training.',
  'Easy does it today — gentle movement helps you show up fresher for the next hard session.'
];
function dayMessage(list, dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) hash = (hash * 31 + dateStr.charCodeAt(i)) % 1000;
  return list[hash % list.length];
}
function suggestOrder(runType, strengthGoal) {
  if (runType === 'Quality' || runType === 'Tempo') {
    return { order: 'Run first', reason: 'Hard running efforts need fresh legs and sharp turnover — do those before you lift.' };
  }
  if (runType === 'Long') {
    return { order: 'Lift first', reason: 'A long run leans on aerobic endurance more than sharpness, so it tolerates some pre-fatigue better than a heavy lift does.' };
  }
  if (strengthGoal === 'strength') {
    return { order: 'Lift first', reason: 'Max-effort lifting is the more fatigue-sensitive session today — protect it, then use the easy run as recovery.' };
  }
  return { order: 'Run first (easy pace)', reason: "An easy run won't blunt a hypertrophy-focused lift session, and it doubles as a warmup." };
}

// ---------- nutrition ----------
function calcTDEE({ sex, age, heightIn, weightLb, activityLevel }) {
  const weightKg = weightLb * 0.453592, heightCm = heightIn * 2.54;
  const bmr = sex === 'male' ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5 : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 }[activityLevel] || 1.55;
  return { tdee: bmr * mult, weightKg };
}
function calcMacros({ weightKg, tdee, goal }) {
  const adj = goal === 'cut' ? -0.15 : goal === 'bulk' ? 0.1 : 0;
  const targetCals = Math.round(tdee * (1 + adj));
  const proteinG = Math.round(weightKg * 2.0);
  const fatG = Math.round((targetCals * 0.25) / 9);
  const carbG = Math.round((targetCals - proteinG * 4 - fatG * 9) / 4);
  return { targetCals, proteinG, fatG, carbG };
}
function estimateLiftCalories(liftEntry, log, profile) {
  if (!liftEntry || !log || !log.liftCompletedAt) return 0;
  const weightKg = profile.weightLb * 0.453592;
  let minutes = 0, rpeSum = 0, rpeCount = 0;
  liftEntry.exercises.forEach(ex => {
    const exLog = log.lift[ex.id];
    if (!exLog) return;
    const doneSets = exLog.sets.filter(s => s.done).length;
    minutes += doneSets * (ex.isCompound ? 3.5 : 2);
    if (exLog.rpe != null) { rpeSum += exLog.rpe; rpeCount++; }
  });
  const avgRpe = rpeCount ? rpeSum / rpeCount : 7;
  const met = 3.5 + Math.min(1, Math.max(0, (avgRpe - 5) / 5)) * 3;
  return met * weightKg * (minutes / 60);
}
function estimateRunCalories(runEntry, log, profile) {
  if (!runEntry || !log || !log.runCompletedAt) return 0;
  const weightKg = profile.weightLb * 0.453592;
  const totals = runLogTotals(runEntry, log.run, profile);
  const distance = Number(totals.distance) || 0;
  return weightKg * 1.036 * 1.60934 * distance;
}

// ---------- plan generation pipeline ----------
function buildLiftTemplate(profile, oneRMs) {
  const liftDays = WEEKDAYS.filter(d => profile.schedule[d] === 'lift' || profile.schedule[d] === 'lift_run');
  const family = splitFamilies[profile.splitType] || splitFamilies.full_body;
  const learnedOneRMs = profile.learnedOneRMs || {};
  return liftDays.map((weekday, i) => {
    const dayType = family.sequence[i % family.sequence.length];
    let exercises = buildDayExercises(dayType, i, { equipment: profile.equipment, goal: profile.strengthGoal, oneRMs, learnedOneRMs });
    const budget = Number(profile.sessionLengthMin) || 60;
    exercises = trimToTimeBudget(exercises, budget);
    exercises = padToTimeBudget(exercises, budget, dayType, i, { equipment: profile.equipment, goal: profile.strengthGoal, oneRMs, learnedOneRMs });
    return { weekday, dayType, exercises };
  });
}
function buildRunTemplate(profile) {
  const runDays = WEEKDAYS.filter(d => profile.schedule[d] === 'run' || profile.schedule[d] === 'lift_run');
  return runDays.map(weekday => ({ weekday, type: (profile.runDayTypes && profile.runDayTypes[weekday]) || 'Easy' }));
}
function ageAdjustedRaceMinutes(predicted5kMin, since) {
  if (!since || !since.month || !since.year) return predicted5kMin;
  const monthsAgo = monthsSince(since.month, since.year);
  if (monthsAgo <= 3) return predicted5kMin;
  if (monthsAgo <= 12) return predicted5kMin * 1.03;
  if (monthsAgo <= 24) return predicted5kMin * 1.06;
  return predicted5kMin * 1.10;
}
function bestRaceEstimate(races) {
  if (!races || !races.length) return null;
  const candidates = races.map(r => {
    const mins = parseMinutesInput(r.minutes);
    if (!mins) return null;
    const predicted5k = riegelPredict(mins, DIST_MILES[r.distance], DIST_MILES['5k']);
    return { ...r, predicted5k, adjusted: ageAdjustedRaceMinutes(predicted5k, r.since) };
  }).filter(Boolean);
  if (!candidates.length) return null;
  return candidates.reduce((best, c) => (!best || c.adjusted < best.adjusted) ? c : best, null);
}
function computePaces(profile) {
  const best = bestRaceEstimate(profile.recentRaces);
  if (!best) return null;
  const paceSecPerMile = (best.predicted5k * 60) / 3.1069;
  return {
    easy: paceFromSeconds(paceSecPerMile + 90), tempo: paceFromSeconds(paceSecPerMile + 25), interval: paceFromSeconds(paceSecPerMile - 10)
  };
}
function detectConflicts(liftTemplate, injuries) {
  const active = injuries.filter(inj => inj.status === 'current' || inj.status === 'recurring');
  if (active.length === 0) return [];
  const conflicts = [];
  liftTemplate.forEach(day => {
    day.exercises.forEach(ex => {
      active.forEach(inj => {
        if (ex.areas.includes(inj.area)) conflicts.push({ id: `${day.weekday}-${ex.id}`, weekday: day.weekday, dayType: day.dayType, exerciseId: ex.id, exerciseName: ex.name, pattern: ex.pattern, area: inj.area, status: inj.status });
      });
    });
  });
  return conflicts;
}
function swapExercise(liftTemplate, weekday, exerciseId, equipment, goal, oneRMs, learnedOneRMs) {
  return liftTemplate.map(day => {
    if (day.weekday !== weekday) return day;
    return {
      ...day, exercises: day.exercises.map(ex => {
        if (ex.id !== exerciseId) return ex;
        const pool = exercisePool[ex.pattern][equipment] || exercisePool[ex.pattern].bodyweight;
        const currentIdx = pool.indexOf(ex.name);
        const nextName = pool[(currentIdx + 1) % pool.length];
        const prescription = prescriptionFor(nextName, goal);
        const repLow = prescription ? prescription.repLow : ex.repLow;
        const repHigh = prescription ? prescription.repHigh : ex.repHigh;
        const estimate = estimateOneRMFor(nextName, ex.pattern, oneRMs || {}, learnedOneRMs);
        return {
          ...ex, name: nextName, areas: areasForExercise(ex.pattern, nextName),
          repLow, repHigh, reps: repsDisplay(repLow, repHigh),
          style: prescription ? prescription.style : ex.style, dropSet: prescription ? prescription.dropSet : ex.dropSet,
          pct1RM: estimate ? +(1 / (1 + repLow / 30)).toFixed(3) : null,
          oneRMValue: estimate ? estimate.value : null, weightSource: estimate ? estimate.source : null,
          loadNote: estimate ? null : 'RPE 7-8 · pick a challenging weight'
        };
      })
    };
  });
}
function expandToCalendar(profile, liftTemplate, runTemplate) {
  const monday = getMonday(new Date());
  const runCounts = {
    easy: runTemplate.filter(d => d.type === 'Easy').length, quality: runTemplate.filter(d => d.type === 'Quality').length,
    tempo: runTemplate.filter(d => d.type === 'Tempo').length, long: runTemplate.filter(d => d.type === 'Long').length
  };
  const baseMiles = Number(profile.currentWeeklyMileage) || 0;
  const mileageBlock = [baseMiles, +(baseMiles * 1.1).toFixed(1), +(baseMiles * 1.1 * 1.1).toFixed(1), +(baseMiles * 0.7).toFixed(1)];
  const paces = computePaces(profile);
  const easyPaceMinPerMile = paces ? paceStrToMinutes(paces.easy) : 10;
  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const qualitySession = runCounts.quality ? computeQualitySession(profile.runGoal, w, easyPaceMinPerMile) : null;
    const tempoSession = runCounts.tempo ? computeTempoSession(mileageBlock[w], easyPaceMinPerMile, paces?.tempo) : null;
    const longDist = +(mileageBlock[w] * 0.30).toFixed(1);
    const committedMiles = longDist * runCounts.long + (qualitySession?.totalMiles || 0) * runCounts.quality + (tempoSession?.totalMiles || 0) * runCounts.tempo;
    const remainder = mileageBlock[w] - committedMiles;
    const easyDist = runCounts.easy ? Math.max(2, +(remainder / runCounts.easy).toFixed(1)) : 0;
    const days = {};
    WEEKDAYS.forEach((weekday, di) => {
      const date = addDays(monday, w * 7 + di);
      const entry = { date: dateKey(date), display: formatDate(date), weekday, type: profile.schedule[weekday] };
      const liftDay = liftTemplate.find(d => d.weekday === weekday);
      if (liftDay && (entry.type === 'lift' || entry.type === 'lift_run')) {
        entry.lift = { dayType: liftDay.dayType, exercises: liftDay.exercises.map(ex => weightForWeek(ex, w)) };
      }
      const runDay = runTemplate.find(d => d.weekday === weekday);
      if (runDay && (entry.type === 'run' || entry.type === 'lift_run')) {
        if (runDay.type === 'Quality') entry.run = { type: 'Quality', distance: qualitySession.totalMiles, detail: qualitySession.detail, reps: qualitySession.reps };
        else if (runDay.type === 'Tempo') entry.run = { type: 'Tempo', distance: tempoSession.totalMiles, detail: tempoSession.detail };
        else if (runDay.type === 'Long') entry.run = { type: 'Long', distance: longDist, detail: runDetailText('Long', longDist, paces) };
        else entry.run = { type: 'Easy', distance: easyDist, detail: runDetailText('Easy', easyDist, paces) };
      }
      if (entry.lift && entry.run) entry.orderSuggestion = suggestOrder(entry.run.type, profile.strengthGoal);
      days[weekday] = entry;
    });
    weeks.push({ weekIndex: w, monday: dateKey(addDays(monday, w * 7)), miles: mileageBlock[w], deload: w === 3, days });
  }
  return weeks;
}

// ---------- workout logging helpers ----------
function parseRestSeconds(restStr) {
  if (!restStr) return 90;
  if (restStr.includes('2-3 min')) return 150;
  if (restStr.includes('60-90 sec')) return 75;
  if (restStr.includes('90 sec')) return 90;
  return 90;
}
function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.2;
    o.start(); o.stop(ctx.currentTime + 0.3);
  } catch (e) { /* audio unavailable, skip silently */ }
}
function buildLogSkeleton(entry) {
  const lift = {};
  if (entry.lift) entry.lift.exercises.forEach(ex => {
    const plan = ex.setPlan || Array.from({ length: ex.sets }, () => ({ targetWeight: ex.weight || null, targetReps: null, isDrop: false }));
    lift[ex.id] = {
      name: ex.name,
      sets: plan.map(p => ({ weight: p.targetWeight != null ? String(p.targetWeight) : '', reps: p.targetReps != null ? String(p.targetReps) : '', done: false })),
      rpe: null, swappedName: null, skipped: false
    };
  });
  const run = entry.run ? buildRunLogSkeleton(entry.run) : null;
  return { lift, run, liftCompletedAt: null, runCompletedAt: null };
}
function mergeLog(skeleton, saved) {
  if (!saved) return skeleton;
  const lift = { ...skeleton.lift };
  Object.keys(lift).forEach(id => { if (saved.lift && saved.lift[id]) lift[id] = saved.lift[id]; });
  let run = skeleton.run;
  if (skeleton.run && saved.run) {
    const savedStructured = 'warmup' in saved.run;
    const skeletonStructured = 'warmup' in skeleton.run;
    if (savedStructured === skeletonStructured) {
      run = saved.run;
      if (skeletonStructured && skeleton.run.intervals && (!saved.run.intervals || saved.run.intervals.length !== skeleton.run.intervals.length)) {
        run = { ...saved.run, intervals: skeleton.run.intervals.map((iv, i) => (saved.run.intervals && saved.run.intervals[i]) || iv) };
      }
    }
    // shape mismatch (e.g. old flat log from before phases existed, or run type changed on regeneration) — discard stale data, start fresh rather than crash
  }
  return { lift, run, liftCompletedAt: saved.liftCompletedAt || null, runCompletedAt: saved.runCompletedAt || null };
}

// ---------- UI atoms ----------
function SectionHeader({ children, accent }) {
  return <h2 className={`text-sm font-black uppercase tracking-widest ${accent === 'amber' ? 'text-amber-500' : accent === 'teal' ? 'text-teal-400' : 'text-stone-300'}`}>{children}</h2>;
}
function Card({ children, className = '' }) {
  return <div className={`bg-zinc-800 rounded-lg p-4 border border-zinc-700 ${className}`}>{children}</div>;
}
function Field({ label, children }) {
  return <label className="text-xs text-zinc-400 block">{label}<div className="mt-1">{children}</div></label>;
}
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-stone-100 text-sm";

// ---------- scroll wheel picker ----------
const WHEEL_ITEM_H = 36;
function numRange(min, max, step = 1, suffix = '') {
  const arr = [];
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i++) {
    const v = Math.round((min + i * step) * 100) / 100;
    arr.push({ value: v, label: `${v}${suffix}` });
  }
  return arr;
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthOptions() { return MONTH_NAMES.map((m, i) => ({ value: i + 1, label: m })); }
function yearOptions(back = 20) { const y = new Date().getFullYear(); const arr = []; for (let v = y; v >= y - back; v--) arr.push({ value: v, label: `${v}` }); return arr; }
function monthsSince(month, year) {
  const now = new Date();
  return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
}
function currentMonthYear() { const now = new Date(); return { month: now.getMonth() + 1, year: now.getFullYear() }; }
function ageAdjustedOneRM(rawOneRM, since) {
  if (!rawOneRM || !since || !since.month || !since.year) return rawOneRM;
  const monthsAgo = monthsSince(since.month, since.year);
  if (monthsAgo <= 3) return rawOneRM;
  if (monthsAgo <= 12) return Math.round(rawOneRM * 0.95);
  if (monthsAgo <= 24) return Math.round(rawOneRM * 0.90);
  return Math.round(rawOneRM * 0.82);
}
function durationLabel(month, year) {
  if (!month || !year) return '';
  const m = monthsSince(month, year);
  if (m <= 0) return 'this month';
  if (m < 12) return `${m} mo`;
  const y = Math.floor(m / 12), rem = m % 12;
  return rem === 0 ? `${y} yr` : `${y}yr ${rem}mo`;
}
function WheelPicker({ value, onChange, options, width = 'flex-1', itemHeight = WHEEL_ITEM_H }) {
  const ref = useRef(null);
  const settling = useRef(false);
  const height = itemHeight * 3;
  const [typing, setTyping] = useState(false);
  const [typedValue, setTypedValue] = useState('');

  useEffect(() => {
    if (typing || !ref.current) return;
    const i = Math.max(0, options.findIndex(o => o.value === value));
    ref.current.scrollTop = i * itemHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing]);

  function commit(scrollTop) {
    const i = Math.max(0, Math.min(options.length - 1, Math.round(scrollTop / itemHeight)));
    if (options[i] && options[i].value !== value) onChange(options[i].value);
  }
  function handleScroll(e) {
    const st = e.target.scrollTop;
    if (settling.current) return;
    clearTimeout(e.target._t);
    e.target._t = setTimeout(() => commit(st), 120);
  }
  function commitTyped() {
    const num = parseFloat(typedValue);
    if (!isNaN(num)) {
      let closest = options[0], minDiff = Infinity;
      options.forEach(o => { const diff = Math.abs(o.value - num); if (diff < minDiff) { minDiff = diff; closest = o; } });
      onChange(closest.value);
    }
    setTyping(false);
  }
  if (typing) {
    return (
      <div className={`relative ${width}`} style={{ height }}>
        <input autoFocus type="number" inputMode="decimal" value={typedValue} onChange={e => setTypedValue(e.target.value)}
          onBlur={commitTyped} onKeyDown={e => { if (e.key === 'Enter') commitTyped(); }}
          className="w-full h-full text-center bg-zinc-900 border border-amber-500 rounded text-stone-100 font-mono text-base" />
      </div>
    );
  }
  return (
    <div className={`relative ${width}`} style={{ height }}>
      <div className="absolute inset-x-0 pointer-events-none border-y border-amber-500/40 bg-amber-500/5 rounded" style={{ top: itemHeight, height: itemHeight }} />
      <div ref={ref} onScroll={handleScroll} className="wheel-scroll h-full overflow-y-scroll snap-y snap-mandatory relative"
        style={{ paddingTop: itemHeight, paddingBottom: itemHeight }}>
        {options.map((o, i) => (
          <div key={i} onClick={() => { if (o.value === value) { setTypedValue(String(value)); setTyping(true); } else { onChange(o.value); if (ref.current) ref.current.scrollTop = i * itemHeight; } }}
            className={`snap-center flex items-center justify-center font-mono cursor-pointer ${o.value === value ? 'text-stone-100 font-bold' : 'text-zinc-600'} ${itemHeight <= 26 ? 'text-xs' : 'text-base'}`}
            style={{ height: itemHeight }}>
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
}
function DualWheelPicker({ leftLabel, rightLabel, leftOptions, rightOptions, leftValue, rightValue, onLeftChange, onRightChange, itemHeight }) {
  return (
    <div>
      <div className="flex gap-2 text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
        <span className="flex-1 text-center">{leftLabel}</span><span className="flex-1 text-center">{rightLabel}</span>
      </div>
      <div className="flex gap-2 bg-zinc-800 border border-zinc-700 rounded">
        <WheelPicker value={leftValue} onChange={onLeftChange} options={leftOptions} itemHeight={itemHeight} />
        <div className="w-px bg-zinc-700" />
        <WheelPicker value={rightValue} onChange={onRightChange} options={rightOptions} itemHeight={itemHeight} />
      </div>
    </div>
  );
}

export default function HybridAthleteApp() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [liftTemplate, setLiftTemplate] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [weekIndex, setWeekIndex] = useState(0);
  const [expandedDate, setExpandedDate] = useState(null);
  const [logsByDate, setLogsByDate] = useState({});
  const dayLog = expandedDate ? logsByDate[expandedDate] : null;
  const [expandedExerciseId, setExpandedExerciseId] = useState(null);
  const [sessionFocus, setSessionFocus] = useState(null);
  const [timer, setTimer] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const [saveError, setSaveError] = useState(false);
  const [garminError, setGarminError] = useState('');
  const [garminAnalysis, setGarminAnalysis] = useState(null);
  const [liftCompleteMessage, setLiftCompleteMessage] = useState('');
  const [runCompleteMessage, setRunCompleteMessage] = useState('');

  const [setupStep, setSetupStep] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showInjuryManager, setShowInjuryManager] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [exerciseStats, setExerciseStats] = useState({});
  const [runStats, setRunStats] = useState(null);
  const [selectedExerciseName, setSelectedExerciseName] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [pendingLiftTemplate, setPendingLiftTemplate] = useState(null);
  const [pendingRunTemplate, setPendingRunTemplate] = useState(null);
  const [pendingProfile, setPendingProfile] = useState(null);

  const emptySchedule = { Mon: 'rest', Tue: 'rest', Wed: 'rest', Thu: 'rest', Fri: 'rest', Sat: 'rest', Sun: 'rest' };
  const [form, setForm] = useState({
    name: '', sex: 'male', age: 30, weightLb: 170, heightIn: 70, activityLevel: 'moderate',
    trainingMode: 'hybrid', strengthGoal: 'hybrid', runGoal: 'general', experience: 'intermediate', equipment: 'barbell',
    splitType: 'upper_lower', schedule: { ...emptySchedule }, sessionLengthMin: 60, runDayTypes: {},
    lifts: { squat: { weight: '', reps: '', since: currentMonthYear() }, bench: { weight: '', reps: '', since: currentMonthYear() }, deadlift: { weight: '', reps: '', since: currentMonthYear() }, ohp: { weight: '', reps: '', since: currentMonthYear() } },
    currentWeeklyMileage: 15, recentRaces: [{ distance: '5k', minutes: '', since: currentMonthYear() }],
    injuries: [], nutritionGoal: 'maintain'
  });

  const [showFoodForm, setShowFoodForm] = useState(false);
  const [foodDraft, setFoodDraft] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [todayFood, setTodayFood] = useState([]);

  useEffect(() => {
    (async () => {
      const p = await loadKey('profile');
      const c = await loadKey('calendar');
      const lt = await loadKey('liftTemplate');
      const f = await loadKey(todayKey());
      const sugg = await loadKey('suggestions');
      setProfile(p); setCalendar(c); setLiftTemplate(lt);
      if (f) setTodayFood(f);
      if (sugg) setSuggestions(sugg);
      if (c) {
        const todayStr0 = dateKey(new Date());
        let todayEntry0 = null;
        for (const w of c) { const found = Object.values(w.days).find(d => d.date === todayStr0); if (found) { todayEntry0 = found; break; } }
        if (todayEntry0 && (todayEntry0.lift || todayEntry0.run)) {
          const saved = await loadKey(`log:${todayStr0}`);
          setLogsByDate(prev => ({ ...prev, [todayStr0]: mergeLog(buildLogSkeleton(todayEntry0), saved) }));
        }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!timer || timer.done) return;
    if (timer.secondsLeft <= 0) {
      playBeep();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setTimer(t => t ? { ...t, done: true } : null);
      return;
    }
    const id = setTimeout(() => setTimer(t => t ? { ...t, secondsLeft: t.secondsLeft - 1 } : null), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  async function loadHistory() {
    setHistoryLoading(true);
    const keys = await listKeys('log:');
    const logs = [];
    for (const key of keys) {
      const data = await loadKey(key);
      if (data) logs.push({ date: key.slice(4), ...data });
    }
    setExerciseStats(aggregateExerciseStats(logs, profile));
    setRunStats(aggregateRunStats(logs, profile));
    setHistoryLoaded(true);
    setHistoryLoading(false);
  }
  async function exportAllData() {
    setExporting(true);
    try {
      const [profileData, calendarData, liftTemplateData, suggestionsData] = await Promise.all([
        loadKey('profile'), loadKey('calendar'), loadKey('liftTemplate'), loadKey('suggestions')
      ]);
      const logKeys = await listKeys('log:');
      const foodKeys = await listKeys('food:');
      const logs = {};
      for (const key of logKeys) { const d = await loadKey(key); if (d) logs[key] = d; }
      const food = {};
      for (const key of foodKeys) { const d = await loadKey(key); if (d) food[key] = d; }
      const bundle = { exportedAt: new Date().toISOString(), profile: profileData, calendar: calendarData, liftTemplate: liftTemplateData, suggestions: suggestionsData, logs, food };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `forge-backup-${dateKey(new Date())}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { console.error('export failed', e); }
    setExporting(false);
  }
  async function toggleDay(entry) {
    if (expandedDate === entry.date) { setExpandedDate(null); setExpandedExerciseId(null); setSessionFocus(null); return; }
    setExpandedDate(entry.date);
    setExpandedExerciseId(null);
    setSessionFocus(null);
    setSaveError(false);
    setGarminError(''); setGarminAnalysis(null);
    setLiftCompleteMessage(''); setRunCompleteMessage('');
    if (!logsByDate[entry.date]) {
      const saved = await loadKey(`log:${entry.date}`);
      setLogsByDate(prev => ({ ...prev, [entry.date]: mergeLog(buildLogSkeleton(entry), saved) }));
    }
  }
  function updateDayLog(updater) {
    setLogsByDate(prev => {
      const next = updater(prev[expandedDate]);
      saveKey(`log:${expandedDate}`, next).then(ok => setSaveError(!ok));
      return { ...prev, [expandedDate]: next };
    });
  }
  function updateSetLocal(exId, setIdx, field, value) {
    setLogsByDate(prev => {
      const current = prev[expandedDate];
      const next = { ...current, lift: { ...current.lift, [exId]: { ...current.lift[exId], sets: current.lift[exId].sets.map((s, i) => i === setIdx ? { ...s, [field]: value } : s) } } };
      return { ...prev, [expandedDate]: next };
    });
  }
  function persistCurrentLog() {
    setLogsByDate(prev => {
      const current = prev[expandedDate];
      if (current) saveKey(`log:${expandedDate}`, current).then(ok => setSaveError(!ok));
      return prev;
    });
  }
  function handleWeightBlur(exId, si, ex) {
    updateDayLog(log => {
      const currentSets = log.lift[exId].sets;
      const s = currentSets[si];
      const target = ex.setPlan && ex.setPlan[si];
      let pendingRepMatch = s.pendingRepMatch || null;
      if (target && target.targetWeight != null) {
        const newWeight = Number(s.weight);
        if (newWeight && newWeight < target.targetWeight) {
          const suggested = equivalentReps(target.targetWeight, target.targetReps, newWeight);
          pendingRepMatch = suggested && suggested !== target.targetReps ? { suggestedReps: suggested, originalReps: target.targetReps } : null;
        } else {
          pendingRepMatch = null;
        }
      }
      const sets = currentSets.map((set, i) => i === si ? { ...set, pendingRepMatch } : set);
      return { ...log, lift: { ...log.lift, [exId]: { ...log.lift[exId], sets } } };
    });
  }
  function applyRepMatch(exId, si, newReps) {
    updateDayLog(log => {
      const sets = log.lift[exId].sets.map((s, i) => i === si ? { ...s, reps: String(newReps), pendingRepMatch: null } : s);
      return { ...log, lift: { ...log.lift, [exId]: { ...log.lift[exId], sets } } };
    });
  }
  function dismissRepMatch(exId, si) {
    updateDayLog(log => {
      const sets = log.lift[exId].sets.map((s, i) => i === si ? { ...s, pendingRepMatch: null } : s);
      return { ...log, lift: { ...log.lift, [exId]: { ...log.lift[exId], sets } } };
    });
  }
  function completeLift(entry) {
    const currentLog = logsByDate[expandedDate];
    const nextLift = {};
    const missingRpeNames = [];
    let firstMissingId = null;
    entry.lift.exercises.forEach(ex => {
      const exLog = currentLog.lift[ex.id];
      if (exLog.skipped) { nextLift[ex.id] = exLog; return; }
      const sets = exLog.sets.map(s => ({ ...s, done: true }));
      nextLift[ex.id] = { ...exLog, sets };
      if (exLog.rpe == null) { missingRpeNames.push(exLog.swappedName || ex.name); if (!firstMissingId) firstMissingId = ex.id; }
    });
    const allRated = missingRpeNames.length === 0;
    const nextLog = { ...currentLog, lift: nextLift, liftCompletedAt: allRated ? new Date().toISOString() : null };
    setLogsByDate(prev => ({ ...prev, [expandedDate]: nextLog }));
    saveKey(`log:${expandedDate}`, nextLog).then(ok => setSaveError(!ok));
    if (!allRated) {
      setExpandedExerciseId(firstMissingId);
      setLiftCompleteMessage(`Rate RPE for: ${missingRpeNames.join(', ')} to finish.`);
      return;
    }
    setLiftCompleteMessage('');
    let nextSuggestions = { ...suggestions };
    entry.lift.exercises.forEach(ex => {
      const log = nextLift[ex.id];
      if (log.skipped) return;
      if (log && log.rpe != null) {
        const evaluation = evaluateExerciseLog(ex, log);
        if (evaluation) nextSuggestions[ex.id] = { ...evaluation, exerciseName: log.swappedName || ex.name, fromDate: expandedDate };
      }
    });
    setSuggestions(nextSuggestions);
    saveKey('suggestions', nextSuggestions);
    setHistoryLoaded(false);
  }
  function completeRun(entry) {
    const currentLog = logsByDate[expandedDate];
    const totals = runLogTotals(entry.run, currentLog.run, profile);
    if (!totals.distance || !totals.time) {
      setRunCompleteMessage('Enter your distance and time before completing.');
      return;
    }
    if (currentLog.run.effort == null) {
      setRunCompleteMessage('Rate your effort (RPE) before completing.');
      return;
    }
    setRunCompleteMessage('');
    const nextLog = { ...currentLog, runCompletedAt: new Date().toISOString() };
    setLogsByDate(prev => ({ ...prev, [expandedDate]: nextLog }));
    saveKey(`log:${expandedDate}`, nextLog).then(ok => setSaveError(!ok));
    const evaluation = evaluateRunLog(entry.run, totals);
    if (evaluation) {
      const key = `run-${entry.weekday}`;
      const nextSuggestions = { ...suggestions, [key]: { ...evaluation, fromDate: entry.date } };
      setSuggestions(nextSuggestions);
      saveKey('suggestions', nextSuggestions);
    }
    setHistoryLoaded(false);
  }
  function toggleSetDone(exId, setIdx, restStr) {
    updateDayLog(log => {
      const ex = log.lift[exId];
      const newDone = !ex.sets[setIdx].done;
      const newSets = ex.sets.map((s, i) => i === setIdx ? { ...s, done: newDone } : s);
      if (newDone) { const secs = parseRestSeconds(restStr); setTimer({ secondsLeft: secs, total: secs, done: false }); }
      return { ...log, lift: { ...log.lift, [exId]: { ...ex, sets: newSets } } };
    });
  }
  function setExerciseRpe(ex, n) {
    const nextExLog = { ...dayLog.lift[ex.id], rpe: n };
    updateDayLog(log => ({ ...log, lift: { ...log.lift, [ex.id]: nextExLog } }));
    const evaluation = evaluateExerciseLog(ex, nextExLog);
    const exerciseName = nextExLog.swappedName || ex.name;
    if (evaluation) {
      const next = { ...suggestions, [ex.id]: { ...evaluation, exerciseName, fromDate: expandedDate } };
      setSuggestions(next); saveKey('suggestions', next);
    }
    const learned = computeLearnedOneRM(ex, nextExLog);
    if (learned) {
      const nextLearned = { ...(profile.learnedOneRMs || {}), [exerciseName]: learned };
      const directKey = known1RMPatterns[ex.pattern];
      const isPrimary = directKey && primaryExerciseForPattern[ex.pattern] === exerciseName;
      const nextOneRMs = isPrimary ? { ...(profile.oneRMs || {}), [directKey]: learned } : profile.oneRMs;
      const nextProfile = { ...profile, learnedOneRMs: nextLearned, oneRMs: nextOneRMs };
      setProfile(nextProfile); saveKey('profile', nextProfile);
      const nextCalendar = recalculateFutureWeights(calendar, nextProfile, todayStr);
      setCalendar(nextCalendar); saveKey('calendar', nextCalendar);
    }
  }
  function swapToday(exId, ex, currentName) {
    updateDayLog(log => {
      const pool = exercisePool[ex.pattern][profile.equipment] || exercisePool[ex.pattern].bodyweight;
      const idx = pool.indexOf(currentName);
      const nextName = pool[(idx + 1) % pool.length];
      const prescription = prescriptionFor(nextName, profile.strengthGoal);
      const repLow = prescription ? prescription.repLow : ex.repLow;
      const repHigh = prescription ? prescription.repHigh : ex.repHigh;
      const style = prescription ? prescription.style : ex.style;
      const dropSet = prescription ? prescription.dropSet : ex.dropSet;
      const sets = prescription ? prescription.sets : ex.sets;
      const estimate = estimateOneRMFor(nextName, ex.pattern, profile.oneRMs || {}, profile.learnedOneRMs);
      const weight = estimate ? Math.round((estimate.value * (1 / (1 + repLow / 30))) / 5) * 5 : null;
      const setPlan = buildSetPlan({ sets, repLow, repHigh, style, dropSet, weight, needsWarmup: ex.needsWarmup });
      const newSets = setPlan.map(p => ({ weight: p.targetWeight != null ? String(p.targetWeight) : '', reps: p.targetReps != null ? String(p.targetReps) : '', done: false }));
      return { ...log, lift: { ...log.lift, [exId]: { swappedName: nextName, sets: newSets, rpe: null, skipped: false } } };
    });
  }
  function toggleSkipExercise(exId) {
    updateDayLog(log => {
      const exLog = log.lift[exId];
      const skipped = !exLog.skipped;
      const sets = skipped ? exLog.sets.map(s => ({ ...s, done: false })) : exLog.sets;
      return { ...log, lift: { ...log.lift, [exId]: { ...exLog, skipped, sets, rpe: skipped ? null : exLog.rpe } } };
    });
  }
  function removeLastSet(exId) {
    updateDayLog(log => {
      const exLog = log.lift[exId];
      if (exLog.sets.length <= 1) return log;
      return { ...log, lift: { ...log.lift, [exId]: { ...exLog, sets: exLog.sets.slice(0, -1), rpe: null } } };
    });
  }
  function addDropSet(ex) {
    updateDayLog(log => {
      const currentSets = log.lift[ex.id].sets;
      const lastLoggedWeight = Number(currentSets[currentSets.length - 1]?.weight) || ex.weight;
      const drop75 = lastLoggedWeight ? Math.round((lastLoggedWeight * 0.75) / 5) * 5 : null;
      const drop50 = lastLoggedWeight ? Math.round((lastLoggedWeight * 0.50) / 5) * 5 : null;
      const newSets = [
        { weight: drop75 != null ? String(drop75) : '', reps: String(ex.repHigh), done: false },
        { weight: drop50 != null ? String(drop50) : '', reps: String(ex.repHigh), done: false }
      ];
      return { ...log, lift: { ...log.lift, [ex.id]: { ...log.lift[ex.id], sets: [...currentSets, ...newSets] } } };
    });
  }
  function tryEvaluateRun(nextRunLog, entry) {
    const totals = runLogTotals(entry.run, nextRunLog, profile);
    if (totals.time && totals.distance && nextRunLog.effort != null) {
      const evaluation = evaluateRunLog(entry.run, totals);
      if (evaluation) {
        const key = `run-${entry.weekday}`;
        const next = { ...suggestions, [key]: { ...evaluation, fromDate: entry.date } };
        setSuggestions(next); saveKey('suggestions', next);
      }
    }
  }
  function updateRun(field, value, entry) {
    const nextRunLog = { ...dayLog.run, [field]: value };
    updateDayLog(log => ({ ...log, run: nextRunLog }));
    tryEvaluateRun(nextRunLog, entry);
  }
  function updateRunPhase(phase, field, value, entry) {
    const nextRunLog = { ...dayLog.run, [phase]: { ...dayLog.run[phase], [field]: value } };
    updateDayLog(log => ({ ...log, run: nextRunLog }));
    tryEvaluateRun(nextRunLog, entry);
  }
  function updateRunInterval(idx, value, entry) {
    const nextIntervals = (dayLog.run.intervals || []).map((iv, i) => i === idx ? { time: value } : iv);
    const nextRunLog = { ...dayLog.run, intervals: nextIntervals };
    updateDayLog(log => ({ ...log, run: nextRunLog }));
    tryEvaluateRun(nextRunLog, entry);
  }
  function handleGarminUpload(file, entry) {
    if (!file) return;
    setGarminError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      const laps = parseTCX(evt.target.result);
      if (!laps) { setGarminError("Couldn't find lap/heart-rate data in that file. Make sure it's a .tcx export from Garmin Connect."); return; }
      const overall = lapsOverallStats(laps);
      const phases = mapLapsToPhases(laps, entry.run);
      updateDayLog(log => {
        let nextRun = { ...log.run, avgHR: overall.avgHR, maxHR: overall.maxHR };
        if (phases) nextRun = { ...nextRun, ...phases };
        else { nextRun.distance = overall.totalDistance; nextRun.time = secondsToTimeStr(overall.totalTimeSec); }
        return { ...log, run: nextRun };
      });
      setGarminAnalysis(analyzeRunUpload(entry.run, overall, profile));
    };
    reader.onerror = () => setGarminError('Could not read that file.');
    reader.readAsText(file);
  }
  function dismissSuggestion(key) {
    const next = { ...suggestions }; delete next[key];
    setSuggestions(next); saveKey('suggestions', next);
  }
  function applyExerciseSuggestion(exId, newWeight, fromDate) {
    const nextCalendar = calendar.map(week => ({
      ...week,
      days: Object.fromEntries(Object.entries(week.days).map(([wd, entry]) => {
        if (entry.lift && entry.date > fromDate) {
          const exercises = entry.lift.exercises.map(ex => ex.id === exId ? { ...ex, weight: newWeight } : ex);
          return [wd, { ...entry, lift: { ...entry.lift, exercises } }];
        }
        return [wd, entry];
      }))
    }));
    setCalendar(nextCalendar); saveKey('calendar', nextCalendar);
    dismissSuggestion(exId);
  }
  function applyRunSuggestion(key, newDistance, fromDate) {
    const paces = computePaces(profile);
    const easyPaceMinPerMile = paces ? paceStrToMinutes(paces.easy) : 10;
    const nextCalendar = calendar.map(week => ({
      ...week,
      days: Object.fromEntries(Object.entries(week.days).map(([wd, entry]) => {
        if (entry.run && entry.date > fromDate && `run-${entry.weekday}` === key) {
          let distance = newDistance, detail;
          if (entry.run.type === 'Easy' || entry.run.type === 'Long') {
            detail = runDetailText(entry.run.type, newDistance, paces);
          } else if (entry.run.type === 'Quality') {
            const session = computeQualitySessionForDistance(profile.runGoal, easyPaceMinPerMile, newDistance);
            distance = session.totalMiles; detail = session.detail;
          } else if (entry.run.type === 'Tempo') {
            const session = computeTempoSessionForDistance(easyPaceMinPerMile, paces?.tempo, newDistance);
            distance = session.totalMiles; detail = session.detail;
          } else {
            detail = simpleRunDetail(entry.run.type, newDistance);
          }
          return [wd, { ...entry, run: { ...entry.run, distance, detail } }];
        }
        return [wd, entry];
      }))
    }));
    setCalendar(nextCalendar); saveKey('calendar', nextCalendar);
    dismissSuggestion(key);
  }

  const includesStrength = form.trainingMode === 'hybrid' || form.trainingMode === 'strength';
  const includesRunning = form.trainingMode === 'hybrid' || form.trainingMode === 'running';
  const liftDayCount = WEEKDAYS.filter(d => form.schedule[d] === 'lift' || form.schedule[d] === 'lift_run').length;
  const runDayCount = WEEKDAYS.filter(d => form.schedule[d] === 'run' || form.schedule[d] === 'lift_run').length;
  const scheduleOptions = useMemo(() => {
    if (form.trainingMode === 'strength') return [['rest', 'Rest'], ['active_recovery', 'Active recovery'], ['lift', 'Lift']];
    if (form.trainingMode === 'running') return [['rest', 'Rest'], ['active_recovery', 'Active recovery'], ['run', 'Run']];
    return [['rest', 'Rest'], ['active_recovery', 'Active recovery'], ['lift', 'Lift'], ['run', 'Run'], ['lift_run', 'Lift + Run']];
  }, [form.trainingMode]);

  function syncRunDayTypes(schedule, existing) {
    const runDays = WEEKDAYS.filter(d => schedule[d] === 'run' || schedule[d] === 'lift_run');
    const next = {};
    runDays.forEach(d => { next[d] = existing[d] || 'Easy'; });
    return next;
  }
  function updateSchedule(day, val) {
    const nextSchedule = { ...form.schedule, [day]: val };
    setForm({ ...form, schedule: nextSchedule, runDayTypes: syncRunDayTypes(nextSchedule, form.runDayTypes) });
  }

  function buildOneRMs() {
    const l = form.lifts;
    return {
      squat: ageAdjustedOneRM(epley1RM(Number(l.squat.weight), Number(l.squat.reps)), l.squat.since),
      bench: ageAdjustedOneRM(epley1RM(Number(l.bench.weight), Number(l.bench.reps)), l.bench.since),
      deadlift: ageAdjustedOneRM(epley1RM(Number(l.deadlift.weight), Number(l.deadlift.reps)), l.deadlift.since),
      ohp: ageAdjustedOneRM(epley1RM(Number(l.ohp.weight), Number(l.ohp.reps)), l.ohp.since)
    };
  }

  function handleBuildPlan() {
    const oneRMs = includesStrength ? buildOneRMs() : { squat: null, bench: null, deadlift: null, ohp: null };
    const bestRace = includesRunning ? bestRaceEstimate(form.recentRaces) : null;
    const vdot = bestRace ? computeVDOT(DIST_MILES[bestRace.distance], parseMinutesInput(bestRace.minutes)) : null;
    const p = { ...form, oneRMs, vdot, learnedOneRMs: {} };
    const lt = includesStrength ? buildLiftTemplate(p, oneRMs) : [];
    const rt = includesRunning ? buildRunTemplate(p) : [];
    const conf = detectConflicts(lt, form.injuries);
    setPendingProfile(p); setPendingLiftTemplate(lt); setPendingRunTemplate(rt);
    if (conf.length > 0) { setConflicts(conf); setReviewing(true); }
    else { finalizePlan(p, lt, rt); }
  }

  function resolveConflict(conflict, action) {
    let lt = pendingLiftTemplate;
    if (action === 'swap') lt = swapExercise(lt, conflict.weekday, conflict.exerciseId, pendingProfile.equipment, pendingProfile.strengthGoal, pendingProfile.oneRMs, pendingProfile.learnedOneRMs);
    setPendingLiftTemplate(lt);
    setConflicts(conflicts.filter(c => c.id !== conflict.id));
  }

  function finalizePlan(p, lt, rt) {
    const cal = expandToCalendar(p, lt, rt);
    setProfile(p); setLiftTemplate(lt); setCalendar(cal);
    saveKey('profile', p); saveKey('liftTemplate', lt); saveKey('calendar', cal);
    setReviewing(false);
  }

  function addInjury() { const now = new Date(); setForm({ ...form, injuries: [...form.injuries, { area: 'Knee', status: 'current', since: { month: now.getMonth() + 1, year: now.getFullYear() }, notes: '' }] }); }
  function updateInjury(idx, field, val) {
    const next = form.injuries.map((inj, i) => i === idx ? { ...inj, [field]: val } : inj);
    setForm({ ...form, injuries: next });
  }
  function updateInjurySince(idx, part, val) {
    const next = form.injuries.map((inj, i) => i === idx ? { ...inj, since: { ...inj.since, [part]: val } } : inj);
    setForm({ ...form, injuries: next });
  }
  function removeInjury(idx) { setForm({ ...form, injuries: form.injuries.filter((_, i) => i !== idx) }); }

  function addRace() { setForm({ ...form, recentRaces: [...form.recentRaces, { distance: '5k', minutes: '', since: currentMonthYear() }] }); }
  function updateRace(idx, field, val) { setForm({ ...form, recentRaces: form.recentRaces.map((r, i) => i === idx ? { ...r, [field]: val } : r) }); }
  function updateRaceSince(idx, part, val) { setForm({ ...form, recentRaces: form.recentRaces.map((r, i) => i === idx ? { ...r, since: { ...r.since, [part]: val } } : r) }); }
  function removeRace(idx) { setForm({ ...form, recentRaces: form.recentRaces.filter((_, i) => i !== idx) }); }

  function updateProfileInjury(idx, field, val) {
    const next = profile.injuries.map((inj, i) => i === idx ? { ...inj, [field]: val } : inj);
    const nextProfile = { ...profile, injuries: next };
    setProfile(nextProfile); saveKey('profile', nextProfile);
  }
  function updateProfileInjurySince(idx, part, val) {
    const next = profile.injuries.map((inj, i) => i === idx ? { ...inj, since: { ...inj.since, [part]: val } } : inj);
    const nextProfile = { ...profile, injuries: next };
    setProfile(nextProfile); saveKey('profile', nextProfile);
  }
  function removeProfileInjury(idx) {
    const next = profile.injuries.filter((_, i) => i !== idx);
    const nextProfile = { ...profile, injuries: next };
    setProfile(nextProfile); saveKey('profile', nextProfile);
  }
  function addProfileInjury() {
    const now = new Date();
    const next = [...(profile.injuries || []), { area: 'Knee', status: 'current', since: { month: now.getMonth() + 1, year: now.getFullYear() }, notes: '' }];
    const nextProfile = { ...profile, injuries: next };
    setProfile(nextProfile); saveKey('profile', nextProfile);
  }

  async function addFood() {
    if (!foodDraft.name) return;
    const entry = { name: foodDraft.name, kcal: Number(foodDraft.kcal) || 0, protein: Number(foodDraft.protein) || 0, carbs: Number(foodDraft.carbs) || 0, fat: Number(foodDraft.fat) || 0 };
    const next = [...todayFood, entry];
    setTodayFood(next); await saveKey(todayKey(), next);
    setFoodDraft({ name: '', kcal: '', protein: '', carbs: '', fat: '' }); setShowFoodForm(false);
  }
  async function deleteFood(idx) {
    const next = todayFood.filter((_, i) => i !== idx);
    setTodayFood(next); await saveKey(todayKey(), next);
  }

  const todayStr = dateKey(new Date());
  const currentWeekIdx = useMemo(() => {
    if (!calendar) return 0;
    const idx = calendar.findIndex(w => Object.values(w.days).some(d => d.date === todayStr));
    return idx === -1 ? 0 : idx;
  }, [calendar, todayStr]);
  const todayEntry = useMemo(() => {
    if (!calendar) return null;
    for (const w of calendar) { const found = Object.values(w.days).find(d => d.date === todayStr); if (found) return found; }
    return null;
  }, [calendar, todayStr]);

  const todayWorkoutCalories = useMemo(() => {
    if (!profile || !todayEntry) return 0;
    const log = logsByDate[todayStr];
    if (!log) return 0;
    const liftCals = todayEntry.lift ? estimateLiftCalories(todayEntry.lift, log, profile) : 0;
    const runCals = todayEntry.run ? estimateRunCalories(todayEntry.run, log, profile) : 0;
    return Math.round(liftCals + runCals);
  }, [profile, todayEntry, logsByDate, todayStr]);
  const macros = useMemo(() => {
    if (!profile) return null;
    const { tdee, weightKg } = calcTDEE(profile);
    return calcMacros({ weightKg, tdee: tdee + todayWorkoutCalories, goal: profile.nutritionGoal });
  }, [profile, todayWorkoutCalories]);
  const foodTotals = useMemo(() => todayFood.reduce((acc, f) => ({ kcal: acc.kcal + f.kcal, protein: acc.protein + f.protein, carbs: acc.carbs + f.carbs, fat: acc.fat + f.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }), [todayFood]);

  const weekLoad = useMemo(() => {
    if (!calendar) return null;
    const week = calendar[Math.min(weekIndex, calendar.length - 1)];
    const loads = {};
    WEEKDAYS.forEach(d => {
      const entry = week.days[d];
      const s = entry.lift ? (profile.strengthGoal === 'strength' ? 3 : 2) : 0;
      const r = entry.run ? ({ Easy: 1, Tempo: 2, Quality: 2, Long: 3 }[entry.run.type] || 0) : 0;
      loads[d] = { strength: s, running: r };
    });
    return loads;
  }, [calendar, weekIndex, profile]);
  const maxLoad = weekLoad ? Math.max(1, ...WEEKDAYS.map(d => weekLoad[d].strength + weekLoad[d].running)) : 1;

  if (loading) return <div className="min-h-screen bg-zinc-900 flex items-center justify-center text-stone-400 font-mono text-sm">Loading...</div>;

  // ---------- injury conflict review ----------
  if (reviewing) {
    return (
      <div className="min-h-screen bg-zinc-900 text-stone-100 p-4">
        <div className="max-w-sm mx-auto">
          <h1 className="text-xl font-black uppercase tracking-widest mb-1">Check this first</h1>
          <p className="text-zinc-400 text-sm mb-4">These exercises may affect something you flagged. Keep or swap each one.</p>
          <div className="space-y-3">
            {conflicts.map(c => (
              <Card key={c.id}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-orange-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold">{c.exerciseName}</p>
                    <p className="text-xs text-zinc-400">{c.weekday} · {c.dayType} · may affect your {c.area.toLowerCase()} ({c.status})</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => resolveConflict(c, 'keep')} className="flex-1 py-1.5 rounded bg-zinc-700 text-xs font-bold uppercase tracking-wide">Keep anyway</button>
                  <button onClick={() => resolveConflict(c, 'swap')} className="flex-1 py-1.5 rounded bg-amber-500 text-zinc-900 text-xs font-bold uppercase tracking-wide">Swap it</button>
                </div>
              </Card>
            ))}
          </div>
          {conflicts.length === 0 && (
            <Card><p className="text-sm text-zinc-300 mb-3">All set — no flagged conflicts remain.</p></Card>
          )}
          <button disabled={conflicts.length > 0} onClick={() => finalizePlan(pendingProfile, pendingLiftTemplate, pendingRunTemplate)} className={`w-full mt-4 py-2 rounded text-sm font-bold uppercase tracking-wide ${conflicts.length > 0 ? 'bg-zinc-700 text-zinc-500' : 'bg-teal-500 text-zinc-900'}`}>
            Confirm & build calendar
          </button>
        </div>
      </div>
    );
  }

  // ---------- splash ----------
  if (!profile && showSplash) {
    return (
      <div className="min-h-screen bg-zinc-900 text-stone-100 flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 30% 20%, rgba(245,158,11,0.35), transparent 45%), radial-gradient(circle at 70% 80%, rgba(45,212,191,0.3), transparent 45%)' }} />
        <div className="relative flex flex-col items-center text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-6">
            <Flame size={30} className="text-amber-500" />
          </div>
          <h1 className="text-5xl font-black uppercase tracking-tighter mb-2 bg-gradient-to-r from-amber-500 to-teal-400 bg-clip-text text-transparent">Forge</h1>
          <p className="text-zinc-400 text-sm mb-10">Strength and endurance, built on the same program.</p>
          <div className="flex items-center gap-3 mb-10 text-[11px] text-zinc-500 uppercase tracking-wide">
            <span className="flex items-center gap-1.5"><Dumbbell size={13} className="text-amber-500" />Lift</span>
            <span className="text-zinc-700">+</span>
            <span className="flex items-center gap-1.5"><Activity size={13} className="text-teal-400" />Run</span>
            <span className="text-zinc-700">+</span>
            <span className="flex items-center gap-1.5"><UtensilsCrossed size={13} className="text-stone-300" />Fuel</span>
          </div>
          <button onClick={() => setShowSplash(false)} className="w-full py-3 rounded bg-gradient-to-r from-amber-500 to-teal-400 text-zinc-900 text-sm font-black uppercase tracking-widest">Get Started</button>
        </div>
      </div>
    );
  }

  // ---------- setup wizard ----------
  if (!profile) {
    const steps = ['Basics', 'Focus', 'Schedule', 'Performance', 'Injuries', 'Nutrition'];
    return (
      <div className="min-h-screen bg-zinc-900 text-stone-100 flex flex-col items-center py-8 px-4">
        <style>{`.wheel-scroll::-webkit-scrollbar{display:none}.wheel-scroll{-ms-overflow-style:none;scrollbar-width:none}`}</style>
        <div className="max-w-sm w-full">
          <h1 className="text-2xl font-black uppercase tracking-widest mb-1 bg-gradient-to-r from-amber-500 to-teal-400 bg-clip-text text-transparent">Forge</h1>
          <p className="text-zinc-400 text-sm mb-6">Strength + endurance, one program.</p>
          <div className="flex items-center gap-1 mb-6">
            {steps.map((s, i) => (
              <div key={s} className={`flex-1 h-1 rounded ${i <= setupStep ? 'bg-amber-500' : 'bg-zinc-700'}`} />
            ))}
          </div>
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-4">{setupStep + 1}. {steps[setupStep]}</p>

          {setupStep === 0 && (
            <div className="space-y-3">
              <Field label="Name"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sex"><select value={form.sex} onChange={e => setForm({ ...form, sex: e.target.value })} className={inputCls}><option value="male">Male</option><option value="female">Female</option></select></Field>
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Age</p>
                  <WheelPicker value={Number(form.age)} onChange={v => setForm({ ...form, age: v })} options={numRange(13, 90)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Weight (lb)</p>
                  <WheelPicker value={Number(form.weightLb)} onChange={v => setForm({ ...form, weightLb: v })} options={numRange(70, 400)} />
                </div>
                <div>
                  <p className="text-xs text-zinc-400 mb-1">Height</p>
                  <DualWheelPicker
                    leftLabel="ft" rightLabel="in"
                    leftOptions={numRange(3, 7)} rightOptions={numRange(0, 11)}
                    leftValue={Math.floor(Number(form.heightIn) / 12)} rightValue={Number(form.heightIn) % 12}
                    onLeftChange={ft => setForm({ ...form, heightIn: ft * 12 + (Number(form.heightIn) % 12) })}
                    onRightChange={inch => setForm({ ...form, heightIn: Math.floor(Number(form.heightIn) / 12) * 12 + inch })}
                  />
                </div>
              </div>
              <Field label="Daily activity outside training">
                <select value={form.activityLevel} onChange={e => setForm({ ...form, activityLevel: e.target.value })} className={inputCls}>
                  <option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="active">Active</option><option value="veryActive">Very active</option>
                </select>
              </Field>
            </div>
          )}

          {setupStep === 1 && (
            <div className="space-y-3">
              <Field label="Training focus">
                <select value={form.trainingMode} onChange={e => setForm({ ...form, trainingMode: e.target.value })} className={inputCls}>
                  <option value="hybrid">Hybrid (lift + run)</option><option value="strength">Strength only</option><option value="running">Running only</option>
                </select>
              </Field>
              {includesStrength && (
                <>
                  <Field label="Strength goal">
                    <select value={form.strengthGoal} onChange={e => setForm({ ...form, strengthGoal: e.target.value })} className={inputCls}>
                      <option value="strength">Max strength</option><option value="hypertrophy">Hypertrophy</option><option value="hybrid">Hybrid support</option>
                    </select>
                  </Field>
                  <Field label="Experience">
                    <select value={form.experience} onChange={e => setForm({ ...form, experience: e.target.value })} className={inputCls}>
                      <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
                    </select>
                  </Field>
                  <Field label="Equipment">
                    <select value={form.equipment} onChange={e => setForm({ ...form, equipment: e.target.value })} className={inputCls}>
                      <option value="barbell">Full gym / barbell</option><option value="dumbbell">Dumbbells only</option><option value="bodyweight">Bodyweight only</option>
                    </select>
                  </Field>
                </>
              )}
              {includesRunning && (
                <Field label="Running focus">
                  <select value={form.runGoal} onChange={e => setForm({ ...form, runGoal: e.target.value })} className={inputCls}>
                    <option value="5k">5K</option><option value="10k">10K</option><option value="half">Half marathon</option><option value="marathon">Marathon</option><option value="general">General endurance</option>
                  </select>
                </Field>
              )}
            </div>
          )}

          {setupStep === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">Tap each day to assign it.</p>
              <div className="space-y-1.5">
                {WEEKDAYS.map(d => (
                  <div key={d} className="flex items-center justify-between">
                    <span className="text-xs font-mono w-10">{d}</span>
                    <select value={form.schedule[d]} onChange={e => updateSchedule(d, e.target.value)} className="flex-1 ml-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm">
                      {scheduleOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {includesStrength && (
                <>
                  <Field label={`Split (${liftDayCount} lift day${liftDayCount === 1 ? '' : 's'}/wk)`}>
                    <select value={form.splitType} onChange={e => setForm({ ...form, splitType: e.target.value })} className={inputCls}>
                      {Object.entries(splitFamilies).filter(([, f]) => !f.onlyForDayCount || f.onlyForDayCount === liftDayCount).map(([id, f]) => <option key={id} value={id}>{f.label}</option>)}
                    </select>
                  </Field>
                  <div>
                    <p className="text-xs text-zinc-400 mb-1">Lifting session length (min) — running is separate and sized to the prescribed run</p>
                    <WheelPicker value={Number(form.sessionLengthMin)} onChange={v => setForm({ ...form, sessionLengthMin: v })} options={numRange(20, 150, 5)} />
                  </div>
                </>
              )}
              {includesRunning && runDayCount > 0 && (
                <div>
                  <SectionHeader accent="teal">Run day types</SectionHeader>
                  <p className="text-xs text-zinc-500 mt-1 mb-2">Pick which day is your long run and which are quality sessions.</p>
                  <div className="space-y-1.5">
                    {WEEKDAYS.filter(d => form.schedule[d] === 'run' || form.schedule[d] === 'lift_run').map(d => (
                      <div key={d} className="flex items-center justify-between">
                        <span className="text-xs font-mono w-10">{d}</span>
                        <select value={form.runDayTypes[d] || 'Easy'} onChange={e => setForm({ ...form, runDayTypes: { ...form.runDayTypes, [d]: e.target.value } })} className="flex-1 ml-2 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm">
                          <option value="Long">Long</option><option value="Quality">Quality</option><option value="Tempo">Tempo</option><option value="Easy">Easy</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {setupStep === 3 && (
            <div className="space-y-4">
              {includesStrength && (
                <div>
                  <SectionHeader accent="amber">Recent lifts</SectionHeader>
                  <p className="text-xs text-zinc-500 mb-2">Weight x reps for a recent working set, and roughly when. Leave blank to skip.</p>
                  <div className="space-y-2">
                    {['squat', 'bench', 'deadlift', 'ohp'].map(lift => (
                      <Card key={lift}>
                        <p className="text-xs font-bold capitalize mb-2">{lift === 'ohp' ? 'OHP' : lift}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="lb" value={form.lifts[lift].weight} onChange={e => setForm({ ...form, lifts: { ...form.lifts, [lift]: { ...form.lifts[lift], weight: e.target.value } } })} className={inputCls} />
                          <input placeholder="reps" value={form.lifts[lift].reps} onChange={e => setForm({ ...form, lifts: { ...form.lifts, [lift]: { ...form.lifts[lift], reps: e.target.value } } })} className={inputCls} />
                        </div>
                        {form.lifts[lift].weight && (
                          <div className="mt-2">
                            <p className="text-[11px] text-zinc-500 mb-1">When? {durationLabel(form.lifts[lift].since.month, form.lifts[lift].since.year) && <span className="text-amber-500">· {durationLabel(form.lifts[lift].since.month, form.lifts[lift].since.year)} ago</span>}</p>
                            <DualWheelPicker
                              leftLabel="month" rightLabel="year"
                              leftOptions={monthOptions()} rightOptions={yearOptions()}
                              leftValue={form.lifts[lift].since.month} rightValue={form.lifts[lift].since.year}
                              onLeftChange={v => setForm({ ...form, lifts: { ...form.lifts, [lift]: { ...form.lifts[lift], since: { ...form.lifts[lift].since, month: v } } } })}
                              onRightChange={v => setForm({ ...form, lifts: { ...form.lifts, [lift]: { ...form.lifts[lift], since: { ...form.lifts[lift].since, year: v } } } })}
                            />
                            {form.lifts[lift].reps && (() => {
                              const raw = epley1RM(Number(form.lifts[lift].weight), Number(form.lifts[lift].reps));
                              const adjusted = ageAdjustedOneRM(raw, form.lifts[lift].since);
                              return adjusted !== raw ? <p className="text-[11px] text-amber-500 mt-1.5">That's a bit old — starting conservatively at ~{adjusted}lb est. 1RM instead of {raw}lb. Adjusts up fast once you log real sets.</p> : null;
                            })()}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              {includesRunning && (
                <div>
                  <SectionHeader accent="teal">Recent races + mileage</SectionHeader>
                  <p className="text-xs text-zinc-500 mt-1 mb-2">Add one or more — more data points make for a better pace estimate.</p>
                  <div className="space-y-2">
                    {form.recentRaces.map((race, i) => (
                      <Card key={i}>
                        <div className="flex items-center justify-between mb-2">
                          <select value={race.distance} onChange={e => updateRace(i, 'distance', e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                            <option value="5k">5K</option><option value="2mi">2 mi</option><option value="10k">10K</option><option value="half">Half</option><option value="marathon">Marathon</option>
                          </select>
                          {form.recentRaces.length > 1 && <button onClick={() => removeRace(i)} className="text-zinc-500"><X size={16} /></button>}
                        </div>
                        <input placeholder="time: 24:30 or 24.5" value={race.minutes} onChange={e => updateRace(i, 'minutes', e.target.value)} className={inputCls} />
                        {race.minutes && (
                          <div className="mt-2">
                            <p className="text-[11px] text-zinc-500 mb-1">When? {durationLabel(race.since.month, race.since.year) && <span className="text-amber-500">· {durationLabel(race.since.month, race.since.year)} ago</span>}</p>
                            <DualWheelPicker
                              leftLabel="month" rightLabel="year"
                              leftOptions={monthOptions()} rightOptions={yearOptions()}
                              leftValue={race.since.month} rightValue={race.since.year}
                              onLeftChange={v => updateRaceSince(i, 'month', v)} onRightChange={v => updateRaceSince(i, 'year', v)}
                            />
                          </div>
                        )}
                      </Card>
                    ))}
                    <button onClick={addRace} className="w-full py-1.5 rounded border border-zinc-700 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1"><Plus size={12} />Add another race</button>
                  </div>
                  <Field label="Current weekly mileage"><input type="number" value={form.currentWeeklyMileage} onChange={e => setForm({ ...form, currentWeeklyMileage: e.target.value })} className={inputCls} /></Field>
                </div>
              )}
            </div>
          )}

          {setupStep === 4 && (
            <div className="space-y-3">
              <SectionHeader>Injuries</SectionHeader>
              <p className="text-xs text-zinc-500">Current, recurring, or historic. We'll flag exercises that might aggravate these.</p>
              {form.injuries.map((inj, i) => (
                <Card key={i}>
                  <div className="flex justify-between items-start mb-2">
                    <select value={inj.area} onChange={e => updateInjury(i, 'area', e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                      {INJURY_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button onClick={() => removeInjury(i)} className="text-zinc-500"><X size={16} /></button>
                  </div>
                  <select value={inj.status} onChange={e => updateInjury(i, 'status', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs mb-2">
                    <option value="current">Current</option><option value="recurring">Recurring</option><option value="historic">Historic</option>
                  </select>
                  <p className="text-[11px] text-zinc-500 mb-1">Since {inj.since && durationLabel(inj.since.month, inj.since.year) && <span className="text-amber-500">· {durationLabel(inj.since.month, inj.since.year)} ago</span>}</p>
                  <DualWheelPicker
                    leftLabel="month" rightLabel="year"
                    leftOptions={monthOptions()} rightOptions={yearOptions()}
                    leftValue={inj.since?.month} rightValue={inj.since?.year}
                    onLeftChange={v => updateInjurySince(i, 'month', v)} onRightChange={v => updateInjurySince(i, 'year', v)}
                  />
                  <input placeholder="notes (optional)" value={inj.notes} onChange={e => updateInjury(i, 'notes', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs mt-2" />
                </Card>
              ))}
              <button onClick={addInjury} className="w-full py-1.5 rounded border border-zinc-700 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1"><Plus size={12} />Add injury</button>
            </div>
          )}

          {setupStep === 5 && (
            <div className="space-y-3">
              <Field label="Nutrition goal">
                <select value={form.nutritionGoal} onChange={e => setForm({ ...form, nutritionGoal: e.target.value })} className={inputCls}>
                  <option value="maintain">Maintain</option><option value="cut">Cut (fat loss)</option><option value="bulk">Bulk (mass gain)</option>
                </select>
              </Field>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {setupStep > 0 && <button onClick={() => setSetupStep(setupStep - 1)} className="flex-1 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm font-bold uppercase tracking-wide">Back</button>}
            {setupStep < 5 && <button onClick={() => setSetupStep(setupStep + 1)} className="flex-1 py-2 rounded bg-amber-500 text-zinc-900 text-sm font-bold uppercase tracking-wide">Next</button>}
            {setupStep === 5 && <button onClick={handleBuildPlan} className="flex-1 py-2 rounded bg-teal-500 text-zinc-900 text-sm font-bold uppercase tracking-wide">Build my plan</button>}
          </div>
        </div>
      </div>
    );
  }

  // ---------- injury manager ----------
  if (profile && showInjuryManager) {
    return (
      <div className="min-h-screen bg-zinc-900 text-stone-100 p-4">
        <style>{`.wheel-scroll::-webkit-scrollbar{display:none}.wheel-scroll{-ms-overflow-style:none;scrollbar-width:none}`}</style>
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-black uppercase tracking-widest">Injuries</h1>
            <button onClick={() => setShowInjuryManager(false)} className="text-sm font-bold text-teal-400 uppercase tracking-wide">Done</button>
          </div>
          <div className="space-y-3">
            {(profile.injuries || []).map((inj, i) => (
              <Card key={i}>
                <div className="flex justify-between items-start mb-2">
                  <select value={inj.area} onChange={e => updateProfileInjury(i, 'area', e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                    {INJURY_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <button onClick={() => removeProfileInjury(i)} className="text-xs text-teal-400 font-bold uppercase tracking-wide">Healed · remove</button>
                </div>
                <select value={inj.status} onChange={e => updateProfileInjury(i, 'status', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs mb-2">
                  <option value="current">Current</option><option value="recurring">Recurring</option><option value="historic">Historic</option>
                </select>
                <p className="text-[11px] text-zinc-500 mb-1">Since {inj.since && durationLabel(inj.since.month, inj.since.year) && <span className="text-amber-500">· {durationLabel(inj.since.month, inj.since.year)} ago</span>}</p>
                <DualWheelPicker
                  leftLabel="month" rightLabel="year"
                  leftOptions={monthOptions()} rightOptions={yearOptions()}
                  leftValue={inj.since?.month} rightValue={inj.since?.year}
                  onLeftChange={v => updateProfileInjurySince(i, 'month', v)} onRightChange={v => updateProfileInjurySince(i, 'year', v)}
                />
                <input placeholder="notes (optional)" value={inj.notes} onChange={e => updateProfileInjury(i, 'notes', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs mt-2" />
              </Card>
            ))}
            {(!profile.injuries || profile.injuries.length === 0) && <p className="text-sm text-zinc-500">No injuries logged.</p>}
            <button onClick={addProfileInjury} className="w-full py-1.5 rounded border border-zinc-700 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1"><Plus size={12} />Add injury</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- profile ----------
  if (profile && showProfile) {
    const liftRecords = [
      { label: 'Squat', value: profile.oneRMs?.squat }, { label: 'Bench', value: profile.oneRMs?.bench },
      { label: 'Deadlift', value: profile.oneRMs?.deadlift }, { label: 'OHP', value: profile.oneRMs?.ohp }
    ];
    const scheduleSummary = WEEKDAYS.filter(d => profile.schedule[d] !== 'rest').map(d => `${d}: ${profile.schedule[d].replace('_', '+')}`);
    return (
      <div className="min-h-screen bg-zinc-900 text-stone-100 p-4">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-black uppercase tracking-widest">Profile</h1>
            <button onClick={() => setShowProfile(false)} className="text-sm font-bold text-teal-400 uppercase tracking-wide">Done</button>
          </div>
          <div className="space-y-3">
            <Card>
              <SectionHeader>About</SectionHeader>
              <div className="grid grid-cols-2 gap-y-1.5 mt-2 text-sm">
                {profile.name && <div className="col-span-2"><span className="text-zinc-500">Name</span> · {profile.name}</div>}
                <div><span className="text-zinc-500">Age</span> · {profile.age}</div>
                <div><span className="text-zinc-500">Weight</span> · {profile.weightLb} lb</div>
                <div><span className="text-zinc-500">Height</span> · {Math.floor(profile.heightIn / 12)}'{profile.heightIn % 12}"</div>
                <div><span className="text-zinc-500">Activity</span> · {profile.activityLevel}</div>
              </div>
            </Card>
            <Card>
              <SectionHeader accent="amber">Main Lift Records</SectionHeader>
              <div className="grid grid-cols-4 gap-2 mt-2 text-center font-mono">
                {liftRecords.map(r => (
                  <div key={r.label}>
                    <div className="text-lg font-bold">{r.value || '—'}</div>
                    <div className="text-[10px] text-zinc-500 uppercase">{r.label}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mt-2">Updates automatically as you log those lifts.</p>
            </Card>
            <Card>
              <SectionHeader accent="teal">Training Setup</SectionHeader>
              <div className="space-y-1.5 mt-2 text-sm">
                <div><span className="text-zinc-500">Mode</span> · {profile.trainingMode}</div>
                {profile.strengthGoal && (
                  <div>
                    <span className="text-zinc-500">Strength goal</span> · {profile.strengthGoal}
                    <p className="text-[11px] text-zinc-500 mt-0.5">Sets which rep ranges and set counts get picked, whether main lifts use reverse pyramid loading, and the load/volume note on each workout.</p>
                  </div>
                )}
                {profile.runGoal && <div><span className="text-zinc-500">Run goal</span> · {profile.runGoal}</div>}
                <div><span className="text-zinc-500">Experience</span> · {profile.experience}</div>
                <div><span className="text-zinc-500">Equipment</span> · {profile.equipment}</div>
                {profile.splitType && <div><span className="text-zinc-500">Split</span> · {splitFamilies[profile.splitType]?.label}</div>}
                {profile.sessionLengthMin && <div><span className="text-zinc-500">Session length</span> · {profile.sessionLengthMin} min</div>}
                {profile.currentWeeklyMileage != null && <div><span className="text-zinc-500">Weekly mileage</span> · {profile.currentWeeklyMileage} mi</div>}
                <div><span className="text-zinc-500">Nutrition goal</span> · {profile.nutritionGoal}</div>
              </div>
            </Card>
            <Card>
              <SectionHeader>Schedule</SectionHeader>
              <div className="mt-2 space-y-1 text-sm text-zinc-300">
                {scheduleSummary.length ? scheduleSummary.map(s => <div key={s}>{s}</div>) : <p className="text-zinc-500">No training days set.</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ---------- main app ----------
  const week = calendar[Math.min(weekIndex, calendar.length - 1)];
  return (
    <div className="min-h-screen bg-zinc-900 text-stone-100 flex flex-col">
      <style>{`.wheel-scroll::-webkit-scrollbar{display:none}.wheel-scroll{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <div className="max-w-md w-full mx-auto flex flex-col min-h-screen">
        <header className="px-4 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black uppercase tracking-widest bg-gradient-to-r from-amber-500 to-teal-400 bg-clip-text text-transparent">Forge</h1>
            <p className="text-[11px] text-zinc-500 font-mono">{formatDate(new Date())}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowProfile(true)} className="text-zinc-500"><User size={18} /></button>
            <div className="relative">
              <button onClick={() => setShowSettingsMenu(!showSettingsMenu)} className="text-zinc-500"><Settings size={18} /></button>
            {showSettingsMenu && (
              <div className="absolute right-0 top-8 z-20 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                <button onClick={() => { setShowSettingsMenu(false); setShowInjuryManager(true); }} className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-700">Manage injuries</button>
                <button onClick={() => { setShowSettingsMenu(false); exportAllData(); }} disabled={exporting} className="w-full text-left px-3 py-2.5 text-sm hover:bg-zinc-700 border-t border-zinc-700">{exporting ? 'Exporting...' : 'Export my data'}</button>
                <button onClick={() => { setShowSettingsMenu(false); setConfirmRestart(true); }} className="w-full text-left px-3 py-2.5 text-sm text-orange-400 hover:bg-zinc-700 border-t border-zinc-700">Restart full setup</button>
              </div>
            )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">
          {tab === 'dashboard' && (
            <>
              <Card>
                <SectionHeader>This week's load</SectionHeader>
                <div className="flex items-end justify-between gap-1 mt-3 h-24">
                  {weekLoad && WEEKDAYS.map(d => {
                    const l = weekLoad[d]; const total = l.strength + l.running;
                    return (
                      <div key={d} className="flex flex-col items-center flex-1 h-full justify-end">
                        <div className="w-full flex flex-col justify-end h-full rounded-sm overflow-hidden bg-zinc-900">
                          {l.strength > 0 && <div className="w-full bg-amber-500" style={{ height: `${(l.strength / maxLoad) * 100}%` }} />}
                          {l.running > 0 && <div className="w-full bg-teal-400" style={{ height: `${(l.running / maxLoad) * 100}%` }} />}
                        </div>
                        <span className="text-[10px] text-zinc-500 mt-1 font-mono">{d}</span>
                        {total >= 5 && <Flame size={10} className="text-orange-500 -mt-0.5" />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-2 text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-sm inline-block" /> Strength</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-teal-400 rounded-sm inline-block" /> Running</span>
                </div>
              </Card>

              <Card>
                <SectionHeader>Today</SectionHeader>
                <div className="mt-3 space-y-3">
                  {todayEntry?.lift && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Dumbbell size={16} className="text-amber-500" /><span className="text-sm">{todayEntry.lift.dayType}</span></div>
                      <button onClick={() => { setTab('calendar'); setWeekIndex(currentWeekIdx); toggleDay(todayEntry); }} className="text-zinc-500"><ChevronRight size={16} /></button>
                    </div>
                  )}
                  {todayEntry?.run && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><Activity size={16} className="text-teal-400" /><span className="text-sm">{todayEntry.run.type} run</span></div>
                      <button onClick={() => { setTab('calendar'); setWeekIndex(currentWeekIdx); toggleDay(todayEntry); }} className="text-zinc-500"><ChevronRight size={16} /></button>
                    </div>
                  )}
                  {todayEntry && !todayEntry.lift && !todayEntry.run && (
                    <p className="text-xs text-zinc-400">{dayMessage(todayEntry.type === 'active_recovery' ? ACTIVE_RECOVERY_MESSAGES : REST_MESSAGES, todayEntry.date)}</p>
                  )}
                </div>
              </Card>

              {macros && (
                <Card>
                  <SectionHeader>Fuel today</SectionHeader>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="font-mono">{foodTotals.kcal} / {macros.targetCals} kcal</span>
                    <button onClick={() => setTab('fuel')} className="text-zinc-500"><ChevronRight size={16} /></button>
                  </div>
                </Card>
              )}
            </>
          )}

          {tab === 'calendar' && (
            <>
              <div className="flex items-center justify-between">
                <button disabled={weekIndex === 0} onClick={() => setWeekIndex(weekIndex - 1)} className={weekIndex === 0 ? 'text-zinc-700' : 'text-zinc-300'}><ChevronLeft size={20} /></button>
                <div className="text-center">
                  <p className="text-sm font-bold">Week {weekIndex + 1} of 4 {week.deload && <span className="text-orange-400">· Deload</span>}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">from {week.monday}</p>
                </div>
                <button disabled={weekIndex === 3} onClick={() => setWeekIndex(weekIndex + 1)} className={weekIndex === 3 ? 'text-zinc-700' : 'text-zinc-300'}><ChevronRight size={20} /></button>
              </div>
              {WEEKDAYS.map(d => {
                const entry = week.days[d];
                const isToday = entry.date === todayStr;
                const isExpanded = expandedDate === entry.date;
                const isLoggable = entry.date <= todayStr;
                const cachedLog = logsByDate[entry.date];
                const dayComplete = (entry.lift || entry.run) && cachedLog && (!entry.lift || cachedLog.liftCompletedAt) && (!entry.run || cachedLog.runCompletedAt);
                return (
                  <Card key={d} className={isToday ? 'border-amber-500' : ''}>
                    <button className="w-full flex items-center justify-between text-left" onClick={() => toggleDay(entry)}>
                      <div>
                        <span className="text-sm font-bold">{d}</span>
                        <span className="text-[11px] text-zinc-500 font-mono ml-2">{entry.display}</span>
                        {isToday && <span className="text-[10px] text-amber-500 uppercase font-bold ml-2">Today</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {dayComplete && <Check size={14} className="text-teal-400" />}
                        {entry.lift && <Dumbbell size={14} className="text-amber-500" />}
                        {entry.run && <Activity size={14} className="text-teal-400" />}
                        {!entry.lift && !entry.run && <span className="text-[11px] text-zinc-600 capitalize">{entry.type.replace('_', ' ')}</span>}
                        <ChevronRight size={14} className={`text-zinc-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-zinc-700 space-y-3">
                        {entry.orderSuggestion && (
                          <div className="bg-zinc-900 rounded-md p-2.5 border border-zinc-700">
                            <p className="text-xs font-bold text-stone-200">Suggested order: {entry.orderSuggestion.order}</p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">{entry.orderSuggestion.reason}</p>
                          </div>
                        )}
                        {entry.lift && entry.run && (
                          <div className="flex gap-2">
                            <button onClick={() => setSessionFocus('lift')} className={`flex-1 py-1.5 rounded text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 ${(sessionFocus || 'lift') === 'lift' ? 'bg-amber-500 text-zinc-900' : 'bg-zinc-900 text-zinc-400 border border-zinc-700'}`}><Dumbbell size={13} />Lift</button>
                            <button onClick={() => setSessionFocus('run')} className={`flex-1 py-1.5 rounded text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 ${sessionFocus === 'run' ? 'bg-teal-500 text-zinc-900' : 'bg-zinc-900 text-zinc-400 border border-zinc-700'}`}><Activity size={13} />Run</button>
                          </div>
                        )}
                        {entry.lift && (!entry.run || (sessionFocus || 'lift') === 'lift') && (
                          <div>
                            <p className="text-xs font-bold text-amber-500 uppercase tracking-wide mb-1.5">{entry.lift.dayType}</p>
                            <p className="text-[11px] text-zinc-400 mb-2">{liftDayPurpose(entry.lift.dayType, profile.strengthGoal)}</p>
                            {!isLoggable ? (
                              <div className="space-y-1.5">
                                {entry.lift.exercises.map(ex => {
                                  const sugg = suggestions[ex.id];
                                  const showSugg = sugg && entry.date > sugg.fromDate;
                                  return (
                                    <div key={ex.id}>
                                      <div className="flex items-center justify-between text-sm">
                                        <span>{ex.name}</span>
                                        <span className="font-mono text-xs text-zinc-400">{ex.sets}x{ex.reps}{ex.weight ? ` @ ${ex.weight}lb` : ''}{!ex.weight ? ` · ${ex.loadNote}` : ''}</span>
                                      </div>
                                      {exerciseNote(ex) && <p className="text-[10px] text-amber-600/80">{exerciseNote(ex)}</p>}
                                      {weightSourceNote(ex) && <p className="text-[10px] text-zinc-600">{weightSourceNote(ex)}</p>}
                                      {showSugg && (
                                        <div className="mt-1 bg-zinc-900 border border-amber-600/40 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                                          <div>
                                            <p className="text-[11px] text-amber-400 font-bold">{sugg.direction === 'increase' ? '↑' : '↓'} Suggested: {sugg.newWeight}lb</p>
                                            <p className="text-[10px] text-zinc-500">{sugg.reason}</p>
                                          </div>
                                          <div className="flex gap-1 shrink-0">
                                            <button onClick={() => applyExerciseSuggestion(ex.id, sugg.newWeight, sugg.fromDate)} className="text-[10px] bg-amber-500 text-zinc-900 rounded px-2 py-1 font-bold uppercase">Apply</button>
                                            <button onClick={() => dismissSuggestion(ex.id)} className="text-[10px] bg-zinc-700 text-zinc-300 rounded px-2 py-1 font-bold uppercase">Dismiss</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {entry.lift.exercises.map(ex => {
                                  const log = dayLog?.lift?.[ex.id];
                                  if (!log) return null;
                                  const displayName = log.swappedName || ex.name;
                                  const allDone = log.sets.every(s => s.done);
                                  const exOpen = expandedExerciseId === ex.id;
                                  if (log.skipped) {
                                    return (
                                      <div key={ex.id} className="bg-zinc-900 rounded-md p-2.5 flex items-center justify-between">
                                        <span className="text-sm text-zinc-500 line-through">{displayName}</span>
                                        <button onClick={() => toggleSkipExercise(ex.id)} className="text-[11px] text-teal-400 font-bold uppercase tracking-wide shrink-0">Undo</button>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={ex.id} className="bg-zinc-900 rounded-md p-2.5">
                                      <button className="w-full flex items-center justify-between text-left" onClick={() => setExpandedExerciseId(exOpen ? null : ex.id)}>
                                        <span className="flex items-center gap-1.5 text-sm">
                                          {log.rpe != null && <Check size={13} className="text-teal-400" />}
                                          {displayName}
                                        </span>
                                        <span className="font-mono text-xs text-zinc-400">{ex.sets}x{ex.reps}{ex.weight ? ` @ ${ex.weight}lb` : ''}</span>
                                      </button>
                                      {suggestions[ex.id] && entry.date > suggestions[ex.id].fromDate && (
                                        <div className="mt-1.5 bg-zinc-800 border border-amber-600/40 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                                          <div>
                                            <p className="text-[11px] text-amber-400 font-bold">{suggestions[ex.id].direction === 'increase' ? '↑' : '↓'} Suggested: {suggestions[ex.id].newWeight}lb</p>
                                            <p className="text-[10px] text-zinc-500">{suggestions[ex.id].reason}</p>
                                          </div>
                                          <div className="flex gap-1 shrink-0">
                                            <button onClick={() => applyExerciseSuggestion(ex.id, suggestions[ex.id].newWeight, suggestions[ex.id].fromDate)} className="text-[10px] bg-amber-500 text-zinc-900 rounded px-2 py-1 font-bold uppercase">Apply</button>
                                            <button onClick={() => dismissSuggestion(ex.id)} className="text-[10px] bg-zinc-700 text-zinc-300 rounded px-2 py-1 font-bold uppercase">Dismiss</button>
                                          </div>
                                        </div>
                                      )}
                                      {exOpen && (
                                        <div className="mt-2.5 pt-2.5 border-t border-zinc-800 space-y-2">
                                          {ex.loadNote && <p className="text-[11px] text-zinc-500">{ex.loadNote}</p>}
                                          {exerciseNote(ex) && <p className="text-[11px] text-amber-500">{exerciseNote(ex)}</p>}
                                          {weightSourceNote(ex) && <p className="text-[11px] text-zinc-500">{weightSourceNote(ex)}</p>}
                                          {log.sets.map((s, si) => {
                                            const rowLabel = setRowLabel(ex, si);
                                            const isLast = si === log.sets.length - 1;
                                            return (
                                              <div key={si}>
                                                <div className="flex items-center gap-2">
                                                  <span className={`text-[10px] w-10 font-mono shrink-0 ${rowLabel.color}`}>{rowLabel.label}</span>
                                                  <input placeholder={ex.weight ? String(ex.weight) : 'lb'} value={s.weight} onChange={e => updateSetLocal(ex.id, si, 'weight', e.target.value)} onBlur={() => handleWeightBlur(ex.id, si, ex)} className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs" />
                                                  <input placeholder="reps" value={s.reps} onChange={e => updateSetLocal(ex.id, si, 'reps', e.target.value)} onBlur={persistCurrentLog} className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs" />
                                                  <button onClick={() => toggleSetDone(ex.id, si, ex.rest)} className={`ml-auto w-6 h-6 rounded border flex items-center justify-center shrink-0 ${s.done ? 'bg-teal-500 border-teal-500' : 'border-zinc-600'}`}>{s.done && <Check size={12} className="text-zinc-900" />}</button>
                                                  {isLast && log.sets.length > 1 && (
                                                    <button onClick={() => removeLastSet(ex.id)} className="text-zinc-600 shrink-0"><X size={13} /></button>
                                                  )}
                                                </div>
                                                {s.pendingRepMatch && (
                                                  <div className="ml-12 mt-1 flex items-center gap-1.5 bg-zinc-800 border border-teal-600/40 rounded px-2 py-1">
                                                    <p className="text-[10px] text-teal-400 flex-1">Match effort? ~{s.pendingRepMatch.suggestedReps} reps at this weight is the same load.</p>
                                                    <button onClick={() => applyRepMatch(ex.id, si, s.pendingRepMatch.suggestedReps)} className="text-[10px] bg-teal-500 text-zinc-900 rounded px-1.5 py-0.5 font-bold shrink-0">Use {s.pendingRepMatch.suggestedReps}</button>
                                                    <button onClick={() => dismissRepMatch(ex.id, si)} className="text-[10px] bg-zinc-700 text-zinc-300 rounded px-1.5 py-0.5 font-bold shrink-0">Keep {s.pendingRepMatch.originalReps}</button>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                          <div className="flex items-center gap-3 flex-wrap">
                                            <button onClick={() => swapToday(ex.id, ex, displayName)} className="text-[11px] text-zinc-500 flex items-center gap-1"><RefreshCw size={11} />Swap exercise</button>
                                            {ex.dropSet === 'occasionally' && log.sets.length === (ex.needsWarmup ? 1 : 0) + ex.sets && (
                                              <button onClick={() => addDropSet(ex)} className="text-[11px] text-amber-500 flex items-center gap-1"><Plus size={11} />Add drop set</button>
                                            )}
                                            <button onClick={() => toggleSkipExercise(ex.id)} className="text-[11px] text-orange-400 flex items-center gap-1"><X size={11} />Remove exercise</button>
                                          </div>
                                          {allDone && (
                                            <div>
                                              <p className="text-[11px] text-zinc-500 mb-1">RPE for this exercise</p>
                                              <div className="flex flex-wrap gap-1">
                                                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                                  <button key={n} onClick={() => setExerciseRpe(ex, n)} className={`w-7 h-7 rounded text-xs font-mono ${log.rpe === n ? 'bg-amber-500 text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}>{n}</button>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {isLoggable && dayLog && (
                              <div className="mt-3 pt-3 border-t border-zinc-700">
                                {liftCompleteMessage && <p className="text-[11px] text-orange-400 mb-1.5">{liftCompleteMessage}</p>}
                                {dayLog.liftCompletedAt ? (
                                  <p className="text-xs text-teal-400 font-bold flex items-center gap-1"><Check size={13} />Lift completed</p>
                                ) : (
                                  <button onClick={() => completeLift(entry)} className="w-full py-2 rounded bg-amber-500 text-zinc-900 text-xs font-bold uppercase tracking-wide">Complete Lift Workout</button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {entry.run && (!entry.lift || sessionFocus === 'run') && (() => {
                          const paces = computePaces(profile);
                          const spec = qualitySpecs[profile.runGoal] || qualitySpecs.general;
                          const prescribedIntervalSec = paces ? spec.intervalMiles * paceStrToMinutes(paces.interval) * 60 : null;
                          const prescribedTempoPaceSec = paces ? paceStrToMinutes(paces.tempo) * 60 : null;
                          const sugg = suggestions[`run-${entry.weekday}`];
                          const showRunSugg = sugg && entry.date > sugg.fromDate;
                          const rawRun = dayLog?.run;
                          const safeRun = rawRun ? {
                            ...rawRun,
                            warmup: rawRun.warmup || { distance: '', time: '' },
                            cooldown: rawRun.cooldown || { distance: '', time: '' },
                            tempo: rawRun.tempo || { distance: '', time: '' },
                            intervals: rawRun.intervals || []
                          } : null;
                          return (
                          <div>
                            <p className="text-xs font-bold text-teal-400 uppercase tracking-wide mb-1.5">{entry.run.type} run</p>
                            <p className="text-[11px] text-zinc-400 mb-2">{runTypePurpose(entry.run.type)}</p>
                            <p className="text-xs text-zinc-300 mb-2">{entry.run.detail}</p>
                            {showRunSugg && (
                              <div className="mb-2 bg-zinc-900 border border-amber-600/40 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-[11px] text-amber-400 font-bold">{sugg.direction === 'increase' ? '↑' : '↓'} Suggested: {sugg.newDistance} mi</p>
                                  <p className="text-[10px] text-zinc-500">{sugg.reason}</p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => applyRunSuggestion(`run-${entry.weekday}`, sugg.newDistance, sugg.fromDate)} className="text-[10px] bg-amber-500 text-zinc-900 rounded px-2 py-1 font-bold uppercase">Apply</button>
                                  <button onClick={() => dismissSuggestion(`run-${entry.weekday}`)} className="text-[10px] bg-zinc-700 text-zinc-300 rounded px-2 py-1 font-bold uppercase">Dismiss</button>
                                </div>
                              </div>
                            )}
                            {isLoggable && safeRun && (
                              <div className="mb-2">
                                <label className="w-full py-1.5 rounded border border-dashed border-zinc-600 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 text-zinc-400 cursor-pointer">
                                  <RefreshCw size={12} />Import Garmin .tcx
                                  <input type="file" accept=".tcx,.xml" onChange={e => handleGarminUpload(e.target.files[0], entry)} className="hidden" />
                                </label>
                                {garminError && <p className="text-[11px] text-orange-400 mt-1">{garminError}</p>}
                                {garminAnalysis && (
                                  <div className="mt-2 bg-zinc-900 border border-teal-600/40 rounded px-2.5 py-2 space-y-1">
                                    {garminAnalysis.map((line, i) => <p key={i} className="text-[11px] text-teal-300">{line}</p>)}
                                    {(safeRun.avgHR || safeRun.maxHR) && <p className="text-[10px] text-zinc-500">avg {safeRun.avgHR || '—'} bpm · max {safeRun.maxHR || '—'} bpm</p>}
                                  </div>
                                )}
                              </div>
                            )}
                            {isLoggable && safeRun && (entry.run.type === 'Quality' || entry.run.type === 'Tempo') && (
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[10px] text-zinc-500 mb-1">Warm-up</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input placeholder="miles" value={safeRun.warmup.distance} onChange={e => updateRunPhase('warmup', 'distance', e.target.value, entry)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                    <input placeholder="time" value={safeRun.warmup.time} onChange={e => updateRunPhase('warmup', 'time', e.target.value, entry)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                  </div>
                                  {actualPaceSeconds(safeRun.warmup.distance, safeRun.warmup.time) && <p className="text-[10px] text-zinc-500 mt-1">{paceFromSeconds(actualPaceSeconds(safeRun.warmup.distance, safeRun.warmup.time))}/mi</p>}
                                </div>
                                {entry.run.type === 'Quality' && (
                                  <div>
                                    <p className="text-[10px] text-zinc-500 mb-1">Intervals ({safeRun.intervals.length}x {spec.intervalMiles}mi)</p>
                                    <div className="space-y-1.5">
                                      {safeRun.intervals.map((iv, i) => {
                                        const actualSec = timeStrToSeconds(iv.time);
                                        const diff = actualSec != null ? paceDiffLabel(actualSec, prescribedIntervalSec) : null;
                                        return (
                                          <div key={i} className="flex items-center gap-2">
                                            <span className="text-[10px] text-zinc-500 w-8 font-mono shrink-0">#{i + 1}</span>
                                            <input placeholder="mm:ss" value={iv.time} onChange={e => updateRunInterval(i, e.target.value, entry)} className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs" />
                                            {diff && <span className={`text-[10px] font-bold ${diff.color}`}>{diff.text}</span>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {entry.run.type === 'Tempo' && (
                                  <div>
                                    <p className="text-[10px] text-zinc-500 mb-1">Tempo portion</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <input placeholder="miles" value={safeRun.tempo.distance} onChange={e => updateRunPhase('tempo', 'distance', e.target.value, entry)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                      <input placeholder="time" value={safeRun.tempo.time} onChange={e => updateRunPhase('tempo', 'time', e.target.value, entry)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                    </div>
                                    {(() => { const actualSec = actualPaceSeconds(safeRun.tempo.distance, safeRun.tempo.time); const diff = actualSec != null ? paceDiffLabel(actualSec, prescribedTempoPaceSec) : null; return actualSec ? (
                                      <p className="text-[10px] mt-1">{paceFromSeconds(actualSec)}/mi{diff && <span className={`ml-1.5 font-bold ${diff.color}`}>{diff.text}</span>}</p>
                                    ) : null; })()}
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] text-zinc-500 mb-1">Cooldown</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <input placeholder="miles" value={safeRun.cooldown.distance} onChange={e => updateRunPhase('cooldown', 'distance', e.target.value, entry)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                    <input placeholder="time" value={safeRun.cooldown.time} onChange={e => updateRunPhase('cooldown', 'time', e.target.value, entry)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                  </div>
                                  {actualPaceSeconds(safeRun.cooldown.distance, safeRun.cooldown.time) && <p className="text-[10px] text-zinc-500 mt-1">{paceFromSeconds(actualPaceSeconds(safeRun.cooldown.distance, safeRun.cooldown.time))}/mi</p>}
                                </div>
                                <div>
                                  <p className="text-[11px] text-zinc-500 mb-1">Effort (RPE)</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                      <button key={n} onClick={() => updateRun('effort', n, entry)} className={`w-7 h-7 rounded text-xs font-mono ${safeRun.effort === n ? 'bg-teal-500 text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}>{n}</button>
                                    ))}
                                  </div>
                                </div>
                                <input placeholder="notes (optional)" value={safeRun.notes} onChange={e => updateRun('notes', e.target.value, entry)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                              </div>
                            )}
                            {isLoggable && safeRun && entry.run.type !== 'Quality' && entry.run.type !== 'Tempo' && (
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <input placeholder="actual miles" value={safeRun.distance} onChange={e => updateRun('distance', e.target.value, entry)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                  <input placeholder="time (mm:ss)" value={safeRun.time} onChange={e => updateRun('time', e.target.value, entry)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                </div>
                                <div>
                                  <p className="text-[11px] text-zinc-500 mb-1">Effort (RPE)</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                      <button key={n} onClick={() => updateRun('effort', n, entry)} className={`w-7 h-7 rounded text-xs font-mono ${safeRun.effort === n ? 'bg-teal-500 text-zinc-900' : 'bg-zinc-800 text-zinc-400'}`}>{n}</button>
                                    ))}
                                  </div>
                                </div>
                                <input placeholder="notes (optional)" value={safeRun.notes} onChange={e => updateRun('notes', e.target.value, entry)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs" />
                                {safeRun.time && <p className="text-[11px] text-teal-400">Logged: {safeRun.distance}mi in {safeRun.time}, RPE {safeRun.effort}</p>}
                              </div>
                            )}
                            {isLoggable && safeRun && (
                              <div className="mt-3 pt-3 border-t border-zinc-700">
                                {runCompleteMessage && <p className="text-[11px] text-orange-400 mb-1.5">{runCompleteMessage}</p>}
                                {dayLog.runCompletedAt ? (
                                  <p className="text-xs text-teal-400 font-bold flex items-center gap-1"><Check size={13} />Run completed</p>
                                ) : (
                                  <button onClick={() => completeRun(entry)} className="w-full py-2 rounded bg-teal-500 text-zinc-900 text-xs font-bold uppercase tracking-wide">Complete Run</button>
                                )}
                              </div>
                            )}
                          </div>
                          );
                        })()}
                        {!entry.lift && !entry.run && (
                          <div className="bg-zinc-900 rounded-md p-3 border border-zinc-700">
                            <p className="text-xs font-bold text-stone-300 uppercase tracking-wide mb-1">{entry.type === 'active_recovery' ? 'Active Recovery' : 'Rest Day'}</p>
                            <p className="text-[11px] text-zinc-400">{dayMessage(entry.type === 'active_recovery' ? ACTIVE_RECOVERY_MESSAGES : REST_MESSAGES, entry.date)}</p>
                          </div>
                        )}
                        {isLoggable && saveError && <p className="text-[11px] text-orange-400">Couldn't save just now — check your connection and try again.</p>}
                      </div>
                    )}
                  </Card>
                );
              })}
            </>
          )}

          {tab === 'fuel' && macros && (
            <>
              <Card>
                <SectionHeader>Daily targets</SectionHeader>
                <div className="grid grid-cols-4 gap-2 mt-3 text-center font-mono">
                  <div><div className="text-lg font-bold">{macros.targetCals}</div><div className="text-[10px] text-zinc-500 uppercase">kcal</div></div>
                  <div><div className="text-lg font-bold text-amber-400">{macros.proteinG}</div><div className="text-[10px] text-zinc-500 uppercase">protein</div></div>
                  <div><div className="text-lg font-bold text-teal-400">{macros.carbG}</div><div className="text-[10px] text-zinc-500 uppercase">carbs</div></div>
                  <div><div className="text-lg font-bold text-stone-300">{macros.fatG}</div><div className="text-[10px] text-zinc-500 uppercase">fat</div></div>
                </div>
                {todayWorkoutCalories > 0 ? (
                  <p className="text-[11px] text-amber-500 mt-2">+{todayWorkoutCalories} kcal added for today's completed training (estimated from bodyweight, volume/RPE, and run distance — mostly flowing into carbs to fuel recovery).</p>
                ) : (
                  <p className="text-[11px] text-zinc-600 mt-2">No completed workout yet today — target reflects rest-day baseline. Complete a session to see this adjust.</p>
                )}
              </Card>
              <Card>
                <SectionHeader>Today's log</SectionHeader>
                <div className="space-y-2 mt-2">
                  {[
                    { label: 'kcal', val: foodTotals.kcal, target: macros.targetCals, color: 'bg-stone-300' },
                    { label: 'protein', val: foodTotals.protein, target: macros.proteinG, color: 'bg-amber-400' },
                    { label: 'carbs', val: foodTotals.carbs, target: macros.carbG, color: 'bg-teal-400' },
                    { label: 'fat', val: foodTotals.fat, target: macros.fatG, color: 'bg-zinc-400' }
                  ].map(row => (
                    <div key={row.label}>
                      <div className="flex justify-between text-[11px] text-zinc-400 font-mono mb-0.5"><span className="uppercase">{row.label}</span><span>{row.val}/{row.target}</span></div>
                      <div className="h-1.5 bg-zinc-900 rounded overflow-hidden"><div className={`h-full ${row.color}`} style={{ width: `${Math.min(100, (row.val / row.target) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1">
                  {todayFood.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-zinc-300">
                      <span>{f.name} <span className="text-zinc-500 font-mono">{f.kcal}kcal</span></span>
                      <button onClick={() => deleteFood(i)} className="text-zinc-600"><X size={12} /></button>
                    </div>
                  ))}
                </div>
                {showFoodForm ? (
                  <div className="mt-3 space-y-2">
                    <input placeholder="food name" value={foodDraft.name} onChange={e => setFoodDraft({ ...foodDraft, name: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm" />
                    <div className="grid grid-cols-4 gap-1.5">
                      <div><p className="text-[9px] text-zinc-500 text-center mb-0.5">kcal</p><WheelPicker value={Number(foodDraft.kcal) || 0} onChange={v => setFoodDraft({ ...foodDraft, kcal: v })} options={numRange(0, 2000, 10)} itemHeight={24} /></div>
                      <div><p className="text-[9px] text-zinc-500 text-center mb-0.5">protein</p><WheelPicker value={Number(foodDraft.protein) || 0} onChange={v => setFoodDraft({ ...foodDraft, protein: v })} options={numRange(0, 200)} itemHeight={24} /></div>
                      <div><p className="text-[9px] text-zinc-500 text-center mb-0.5">carbs</p><WheelPicker value={Number(foodDraft.carbs) || 0} onChange={v => setFoodDraft({ ...foodDraft, carbs: v })} options={numRange(0, 300)} itemHeight={24} /></div>
                      <div><p className="text-[9px] text-zinc-500 text-center mb-0.5">fat</p><WheelPicker value={Number(foodDraft.fat) || 0} onChange={v => setFoodDraft({ ...foodDraft, fat: v })} options={numRange(0, 150)} itemHeight={24} /></div>
                    </div>
                    <button onClick={addFood} className="w-full py-1.5 rounded bg-stone-200 text-zinc-900 text-xs font-bold uppercase tracking-wide">Add</button>
                  </div>
                ) : (
                  <button onClick={() => setShowFoodForm(true)} className="mt-3 w-full py-1.5 rounded border border-zinc-700 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1"><Plus size={12} />Add food</button>
                )}
              </Card>
            </>
          )}

          {tab === 'stats' && (
            <>
              <button onClick={loadHistory} disabled={historyLoading} className="w-full py-1.5 rounded border border-zinc-700 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 text-zinc-400">
                <RefreshCw size={12} />{historyLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              {historyLoading && <p className="text-sm text-zinc-500 text-center py-8">Loading history...</p>}
              {!historyLoading && historyLoaded && (
                <>
                  {runStats && runStats.count > 0 && (
                    <Card>
                      <SectionHeader accent="teal">Running</SectionHeader>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-center font-mono">
                        <div><div className="text-lg font-bold">{runStats.totalDistance}</div><div className="text-[10px] text-zinc-500 uppercase">total mi</div></div>
                        <div><div className="text-lg font-bold text-teal-400">{runStats.avgPace || '—'}</div><div className="text-[10px] text-zinc-500 uppercase">avg pace/mi</div></div>
                        <div><div className="text-lg font-bold">{runStats.count}</div><div className="text-[10px] text-zinc-500 uppercase">runs logged</div></div>
                      </div>
                      {(runStats.avgWarmupPace || runStats.avgCooldownPace) && (
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-700 text-center font-mono">
                          <div><div className="text-sm font-bold text-zinc-300">{runStats.avgWarmupPace || '—'}</div><div className="text-[10px] text-zinc-500 uppercase">avg warm-up pace</div></div>
                          <div><div className="text-sm font-bold text-zinc-300">{runStats.avgCooldownPace || '—'}</div><div className="text-[10px] text-zinc-500 uppercase">avg cooldown pace</div></div>
                        </div>
                      )}
                    </Card>
                  )}
                  <Card>
                    <SectionHeader accent="amber">Lifts</SectionHeader>
                    <div className="mt-2 space-y-1.5">
                      {Object.entries(exerciseStats).sort((a, b) => b[1].count - a[1].count).map(([name, stat]) => (
                        <button key={name} onClick={() => setSelectedExerciseName(name)} className="w-full flex items-center justify-between text-left py-1.5 border-b border-zinc-700 last:border-0">
                          <div>
                            <p className="text-sm">{name}</p>
                            <p className="text-[11px] text-zinc-500">logged {stat.count}x</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-amber-400">{stat.currentOneRM ? `${stat.currentOneRM}lb` : '—'}</span>
                            <ChevronRight size={14} className="text-zinc-600" />
                          </div>
                        </button>
                      ))}
                      {Object.keys(exerciseStats).length === 0 && <p className="text-sm text-zinc-500">No lifts logged yet. If you've completed workouts and still see this, your data may not be saving — check Settings for the "Export my data" option to confirm.</p>}
                    </div>
                  </Card>
                </>
              )}
            </>
          )}
        </main>

        {selectedExerciseName && exerciseStats[selectedExerciseName] && (
          <div className="fixed inset-0 bg-zinc-900 z-30 overflow-y-auto">
            <div className="max-w-md mx-auto p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setSelectedExerciseName(null)} className="text-zinc-400 flex items-center gap-1 text-sm"><ChevronLeft size={16} />Back</button>
              </div>
              <h1 className="text-xl font-black uppercase tracking-wide mb-1">{selectedExerciseName}</h1>
              <p className="text-sm text-zinc-500 mb-4">Logged {exerciseStats[selectedExerciseName].count} times</p>
              <Card className="mb-3">
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono text-amber-400">{exerciseStats[selectedExerciseName].currentOneRM || '—'}lb</div>
                  <div className="text-[10px] text-zinc-500 uppercase">current estimated 1RM</div>
                </div>
              </Card>
              <SectionHeader>History</SectionHeader>
              <div className="mt-2 space-y-2">
                {exerciseStats[selectedExerciseName].history.map((h, i) => (
                  <Card key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono text-zinc-400">{h.date}</span>
                      {h.rpe != null && <span className="text-xs text-teal-400">RPE {h.rpe}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {h.sets.map((s, si) => (
                        <span key={si} className="text-xs font-mono bg-zinc-900 rounded px-2 py-1">{s.weight}lb x{s.reps}</span>
                      ))}
                    </div>
                    {h.oneRM && <p className="text-[11px] text-zinc-500 mt-1.5">Session 1RM: {h.oneRM}lb</p>}
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {confirmRestart && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-30 px-6">
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 max-w-xs w-full">
              <p className="text-sm font-bold mb-1">Restart full setup?</p>
              <p className="text-xs text-zinc-400 mb-4">This erases your current plan and profile. You'll go through onboarding again from scratch.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmRestart(false)} className="flex-1 py-2 rounded bg-zinc-700 text-xs font-bold uppercase tracking-wide">Cancel</button>
                <button onClick={() => { setConfirmRestart(false); setProfile(null); setCalendar(null); setSetupStep(0); setReviewing(false); setShowSplash(true); setHistoryLoaded(false); setExerciseStats({}); setRunStats(null); }} className="flex-1 py-2 rounded bg-orange-500 text-zinc-900 text-xs font-bold uppercase tracking-wide">Yes, restart</button>
              </div>
            </div>
          </div>
        )}
        {timer && (
          <div className="fixed bottom-16 inset-x-0 max-w-md mx-auto bg-amber-500 text-zinc-900 px-4 py-2 flex items-center justify-between font-mono text-sm font-bold z-10">
            <span className="flex items-center gap-2">
              <Timer size={16} />
              {timer.done ? 'Rest done' : `Rest ${Math.floor(timer.secondsLeft / 60)}:${String(timer.secondsLeft % 60).padStart(2, '0')}`}
            </span>
            <button onClick={() => setTimer(null)} className="uppercase text-xs tracking-wide underline">{timer.done ? 'Dismiss' : 'Skip'}</button>
          </div>
        )}
        <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-zinc-800 border-t border-zinc-700 flex justify-around py-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
            { id: 'calendar', icon: CalendarDays, label: 'Plan' },
            { id: 'fuel', icon: UtensilsCrossed, label: 'Fuel' },
            { id: 'stats', icon: BarChart3, label: 'Stats' }
          ].map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'stats' && !historyLoaded && !historyLoading) loadHistory(); }} className={`flex flex-col items-center gap-0.5 px-3 ${tab === t.id ? 'text-stone-100' : 'text-zinc-600'}`}>
              <t.icon size={18} />
              <span className="text-[10px] font-bold uppercase tracking-wide">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}