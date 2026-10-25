// Moteur de notation partagé entre l'application (navigateur) et l'agent (Node).
// Aucune dépendance : ce fichier est importé tel quel des deux côtés.

export const DEFAULT_CRITERIA = {
  city: 'Bayonne',
  surfaceMin: 50,
  surfaceMax: 70,
  dpeAllowed: ['A', 'B', 'C'],
  parkingMin: 1,
  parkingMax: 2,
  priceMax: null,          // null = pas de plafond
  bedroomsMin: null,
  excludeWorks: true,      // exclut les biens "gros travaux"
  refPriceM2: 4300,        // prix de référence au m² à Bayonne, utilisé pour juger le prix
  alertScore: 7.5          // note à partir de laquelle un bien est "très intéressant"
};

const DPE_POINTS = { A: 2.5, B: 2.2, C: 1.6, D: 0.8, E: 0, F: 0, G: 0 };
const PARKING_QUALITY = { box: 1, garage: 1, souterrain: 0.85, couvert: 0.7, exterieur: 0.5, inconnu: 0.4 };
const CONDITION_POINTS = { neuf: 1.5, excellent: 1.4, bon: 1.1, rafraichir: 0.6, travaux: 0, inconnu: 0.6 };
const MAX_RAW = 2.5 + 2.5 + 2 + 1.5 + 0.75 + 0.5;

export const CONDITION_LABELS = {
  neuf: 'Neuf / récent', excellent: 'Excellent', bon: 'Bon état',
  rafraichir: 'Rafraîchissement', travaux: 'Travaux', inconnu: 'Non précisé'
};
export const PARKING_LABELS = {
  box: 'Box fermé', garage: 'Garage', souterrain: 'Sous-sol', couvert: 'Couvert',
  exterieur: 'Extérieur', inconnu: 'Nature inconnue'
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function pricePerM2(l) {
  return l && l.price && l.surface ? Math.round(l.price / l.surface) : null;
}

/** Détail de la note : chaque composante avec sa valeur, pour l'afficher et l'expliquer. */
export function scoreBreakdown(l, criteria = DEFAULT_CRITERIA) {
  const c = { ...DEFAULT_CRITERIA, ...criteria };
  const parts = [];

  const dpe = (l.dpe || '').toUpperCase();
  parts.push({ key: 'dpe', label: 'DPE', value: dpe in DPE_POINTS ? DPE_POINTS[dpe] : 0.5, max: 2.5 });

  const ppm = pricePerM2(l);
  let pricePts = 1;
  if (ppm) pricePts = clamp(2.5 * (1.3 - ppm / c.refPriceM2) / 0.5, 0, 2.5);
  parts.push({ key: 'prix', label: 'Prix au m²', value: pricePts, max: 2.5 });

  const pk = l.parking || {};
  const count = pk.count || 0;
  let parkPts = 0;
  if (count > 0) parkPts = Math.min(2, (PARKING_QUALITY[pk.type] ?? 0.4) * 1.5 + (count >= 2 ? 0.5 : 0));
  parts.push({ key: 'parking', label: 'Parking', value: parkPts, max: 2 });

  parts.push({ key: 'etat', label: 'État', value: CONDITION_POINTS[l.condition] ?? 0.6, max: 1.5 });

  let chargesPts = 0.35;
  if (l.charges && l.surface) chargesPts = clamp(0.75 * (30 - l.charges / l.surface) / 18, 0, 0.75);
  parts.push({ key: 'charges', label: 'Charges', value: chargesPts, max: 0.75 });

  parts.push({ key: 'exterieur', label: 'Extérieur', value: l.exterior ? 0.5 : 0, max: 0.5 });

  let penalty = 0;
  if (l.procedure) penalty += 0.7;
  if (l.surface && (l.surface < c.surfaceMin || l.surface > c.surfaceMax)) penalty += 1;
  if (penalty) parts.push({ key: 'malus', label: 'Malus (procédure, surface)', value: -penalty, max: 0 });

  const raw = parts.reduce((s, p) => s + p.value, 0);
  const score = Math.round(clamp((raw / MAX_RAW) * 10, 0, 10) * 10) / 10;
  return { score, parts };
}

export function score(l, criteria) {
  return scoreBreakdown(l, criteria).score;
}

/** Liste des critères non remplis (vide = correspond parfaitement). */
export function unmetCriteria(l, criteria = DEFAULT_CRITERIA) {
  const c = { ...DEFAULT_CRITERIA, ...criteria };
  const miss = [];
  if (l.status && l.status !== 'active') miss.push('plus en vente');
  if (c.city && l.city && l.city.toLowerCase() !== c.city.toLowerCase()) miss.push('hors ' + c.city);
  if (!l.surface) miss.push('surface inconnue');
  else if (l.surface < c.surfaceMin || l.surface > c.surfaceMax) miss.push('surface hors fourchette');
  const dpe = (l.dpe || '').toUpperCase();
  if (!dpe) miss.push('DPE inconnu');
  else if (c.dpeAllowed?.length && !c.dpeAllowed.includes(dpe)) miss.push('DPE ' + dpe);
  const count = l.parking?.count;
  if (count == null) miss.push('parking non confirmé');
  else if (count < (c.parkingMin ?? 0)) miss.push('pas de parking');
  else if (c.parkingMax && count > c.parkingMax) miss.push('trop de places');
  if (c.priceMax && l.price > c.priceMax) miss.push('au-dessus du budget');
  if (c.bedroomsMin && (l.bedrooms ?? 0) < c.bedroomsMin) miss.push('chambres');
  if (c.excludeWorks && l.condition === 'travaux') miss.push('travaux');
  return miss;
}

export function isPerfectMatch(l, criteria) {
  return unmetCriteria(l, criteria).length === 0;
}

/** Dernière variation de prix (négative = baisse), ou null. */
export function lastPriceChange(l) {
  const h = l.priceHistory || [];
  if (h.length < 2) return null;
  const a = h[h.length - 2].price, b = h[h.length - 1].price;
  if (!a || !b || a === b) return null;
  return { from: a, to: b, diff: b - a, pct: Math.round(((b - a) / a) * 1000) / 10, date: h[h.length - 1].date };
}
