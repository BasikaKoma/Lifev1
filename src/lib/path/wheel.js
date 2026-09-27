export const LIFE_WHEEL_AREAS = [
  {
    id: 'body',
    label: 'Σώμα και ενέργεια',
    short: 'Σώμα',
    hint: 'Ύπνος, κίνηση, διατροφή, αντοχή μέσα στη μέρα',
    color: '#34d399',
  },
  {
    id: 'mind',
    label: 'Ψυχική κατάσταση',
    short: 'Ψυχή',
    hint: 'Διάθεση, άγχος, σταθερότητα, τρόπος που αντιμετωπίζεις τις δύσκολες μέρες',
    color: '#a78bfa',
  },
  {
    id: 'relationship',
    label: 'Σχέση',
    short: 'Σχέση',
    hint: 'Χρόνος και ουσιαστική επαφή με τη σύζυγό σου',
    color: '#fb7185',
  },
  {
    id: 'people',
    label: 'Φίλοι και οικογένεια',
    short: 'Άνθρωποι',
    hint: 'Επαφή, υποστήριξη, κοινωνική ζωή',
    color: '#fbbf24',
  },
  {
    id: 'work',
    label: 'Εργασία',
    short: 'Εργασία',
    hint: 'Αν οι επιχειρήσεις προχωρούν με τρόπο που αντέχεις',
    color: '#38bdf8',
  },
  {
    id: 'money',
    label: 'Οικονομική ασφάλεια',
    short: 'Χρήματα',
    hint: 'Ρευστότητα, υποχρεώσεις, αίσθηση ελέγχου',
    color: '#4ade80',
  },
  {
    id: 'meaning',
    label: 'Νόημα και εξέλιξη',
    short: 'Νόημα',
    hint: 'Lifeffect, μάθηση, διαλογισμός, δημιουργία',
    color: '#c084fc',
  },
  {
    id: 'rest',
    label: 'Ξεκούραση και χαρά',
    short: 'Χαρά',
    hint: 'Ελεύθερος χρόνος, καταδύσεις, πράγματα χωρίς επαγγελματικό σκοπό',
    color: '#fb923c',
  },
];

export const WORK_WHEEL_AREAS = [
  { id: 'symphon', label: 'Symphon', short: 'Symphon', hint: 'Προχωρά, σε στηρίζει, ή ζητάει παραπάνω χρόνο;', color: '#38bdf8' },
  { id: 'market', label: 'Market Portal', short: 'Market', hint: 'Προχωρά, σε στηρίζει, ή ζητάει παραπάνω χρόνο;', color: '#fbbf24' },
  { id: 'nobelle', label: 'Nobelle', short: 'Nobelle', hint: 'Προχωρά, σε στηρίζει, ή ζητάει παραπάνω χρόνο;', color: '#fb7185' },
];

export function clampWheelScore(value) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < 1 || rounded > 10) return null;
  return rounded;
}

function scoreMap(areas, raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(areas.map((area) => [area.id, clampWheelScore(source[area.id])]));
}

export function normalizeWheel(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const note = source.note == null ? '' : String(source.note);
  return {
    scores: scoreMap(LIFE_WHEEL_AREAS, source.scores),
    businesses: scoreMap(WORK_WHEEL_AREAS, source.businesses),
    note,
    updatedAt: source.updatedAt || source.updated_at || null,
  };
}

export function wheelHasContent(wheel) {
  if (!wheel) return false;
  const values = [
    ...Object.values(wheel.scores || {}),
    ...Object.values(wheel.businesses || {}),
  ];
  if (values.some((value) => value != null)) return true;
  return Boolean(String(wheel.note || '').trim());
}

export function lowestWheelAreas(areas, scores, ceiling = 6) {
  const scored = areas
    .map((area) => ({ ...area, score: clampWheelScore(scores?.[area.id]) }))
    .filter((area) => area.score != null)
    .sort((a, b) => a.score - b.score);
  if (!scored.length) return [];
  const low = scored.filter((area) => area.score <= ceiling);
  return low.length ? low : [scored[0]];
}
