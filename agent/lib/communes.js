// Communes autour de Bayonne : code postal, coordonnées approximatives (centre-bourg),
// et « search: true » pour celles où l'agent consulte les pages de résultats des sites.
// La distance est calculée à vol d'oiseau depuis le centre de Bayonne.

export const CENTER = { name: 'Bayonne', lat: 43.4929, lon: -1.4748 };

export const COMMUNES = [
  ['Bayonne', '64100', 43.4929, -1.4748, true],
  ['Anglet', '64600', 43.4850, -1.5160, true],
  ['Biarritz', '64200', 43.4832, -1.5586, true],
  ['Boucau', '64340', 43.5236, -1.4870, true],
  ['Tarnos', '40220', 43.5410, -1.4610, true],
  ["Saint-Pierre-d'Irube", '64990', 43.4770, -1.4580, true],
  ['Mouguerre', '64990', 43.4680, -1.4180, true],
  ['Villefranque', '64990', 43.4370, -1.4560, false],
  ['Lahonce', '64990', 43.4840, -1.3920, false],
  ['Urcuit', '64990', 43.4890, -1.3380, false],
  ['Bassussarry', '64200', 43.4420, -1.4950, false],
  ['Arcangues', '64200', 43.4310, -1.5220, false],
  ['Arbonne', '64210', 43.4320, -1.5500, false],
  ['Bidart', '64210', 43.4380, -1.5910, true],
  ['Ahetze', '64210', 43.4040, -1.5710, false],
  ['Guéthary', '64210', 43.4230, -1.6100, true],
  ['Saint-Jean-de-Luz', '64500', 43.3880, -1.6630, true],
  ['Ciboure', '64500', 43.3850, -1.6680, true],
  ['Urrugne', '64122', 43.3630, -1.6990, true],
  ['Hendaye', '64700', 43.3590, -1.7740, true],
  ['Ascain', '64310', 43.3450, -1.6200, false],
  ['Saint-Pée-sur-Nivelle', '64310', 43.3560, -1.5500, false],
  ['Ustaritz', '64480', 43.3970, -1.4560, true],
  ['Larressore', '64480', 43.3700, -1.4400, false],
  ['Jatxou', '64480', 43.3880, -1.4290, false],
  ['Halsou', '64480', 43.3780, -1.4170, false],
  ['Cambo-les-Bains', '64250', 43.3590, -1.4010, true],
  ['Espelette', '64250', 43.3400, -1.4470, false],
  ['Itxassou', '64250', 43.3290, -1.4040, false],
  ['Souraïde', '64310', 43.3420, -1.4760, false],
  ['Hasparren', '64240', 43.3840, -1.3050, true],
  ['Briscous', '64240', 43.4590, -1.3370, false],
  ['Urt', '64240', 43.4920, -1.2930, false],
  ['Bardos', '64520', 43.4730, -1.2040, false],
  ['Guiche', '64520', 43.5250, -1.2070, false],
  ['Ondres', '40440', 43.5640, -1.4450, true],
  ['Labenne', '40530', 43.5950, -1.4250, true],
  ['Saint-Martin-de-Seignanx', '40390', 43.5440, -1.3870, true],
  ['Saint-André-de-Seignanx', '40390', 43.5590, -1.3520, false],
  ['Saint-Martin-de-Hinx', '40390', 43.5830, -1.2680, false],
  ['Orx', '40230', 43.6020, -1.3700, false],
  ['Capbreton', '40130', 43.6420, -1.4320, true],
  ['Soorts-Hossegor', '40150', 43.6650, -1.3970, true],
  ['Angresse', '40150', 43.6550, -1.3730, false],
  ['Bénesse-Maremne', '40230', 43.6360, -1.3580, false],
  ['Saint-Vincent-de-Tyrosse', '40230', 43.6600, -1.3060, true],
  ['Seignosse', '40510', 43.6900, -1.3740, true]
].map(([name, cp, lat, lon, search]) => ({ name, cp, lat, lon, search, slug: slugify(name) }));

export function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function distanceKm(a, b = CENTER) {
  const R = 6371, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export const communesWithin = km => COMMUNES.filter(c => distanceKm(c) <= km);

// Motif de recherche d'une commune dans un texte : « Anglet », « anglet-64600 », « Saint Jean de Luz »…
const patterns = COMMUNES.map(c => {
  const words = slugify(c.name).split('-').map(w => w.replace(/e/g, '[eéèêë]').replace(/a/g, '[aàâ]').replace(/i/g, '[iïî]').replace(/c/g, '[cç]').replace(/u/g, '[uùû]'));
  return { c, re: new RegExp(`(^|[^a-zà-ÿ])${words.join("[-\\s'’]*")}(?![a-zà-ÿ])`, 'i') };
});

/**
 * Trouve la commune d'une annonce. Ordre de confiance : adresse de la page, titre, puis texte.
 * Dans le texte, « Commune (code postal) » l'emporte, car les annonces citent souvent Bayonne comme repère.
 */
export function findCommune({ url = '', title = '', text = '' }) {
  const byCp = (s) => {
    for (const m of s.matchAll(/([A-Za-zÀ-ÿ'’ -]{3,40})\s*\(?\s*(?<!\d)(\d{5})(?!\d)\s*\)?/g)) {
      const cands = COMMUNES.filter(c => c.cp === m[2]);
      if (cands.length === 1) return cands[0];
      const hit = cands.find(c => patterns.find(p => p.c === c).re.test(m[1]));
      if (hit) return hit;
    }
    return null;
  };
  const byName = (s) => {
    let best = null, at = Infinity;
    for (const { c, re } of patterns) {
      const m = s.match(re);
      // les noms longs d'abord à position égale (« Saint-Jean-de-Luz » plutôt que « Luz »)
      if (m && (m.index < at || (m.index === at && c.name.length > best.name.length))) { best = c; at = m.index; }
    }
    return best;
  };
  const path = decodeURIComponent(url.replace(/^https?:\/\/[^/]+/, '')).replace(/[_/]/g, ' ');
  return byCp(path) || byName(path) || byCp(title) || byName(title) || byCp(text.slice(0, 4000)) || byName(text.slice(0, 1500)) || null;
}
