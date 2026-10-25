// Extraction des caractéristiques d'une annonce à partir de sa page HTML.
// Approche générique (données structurées JSON-LD, balises meta, puis texte de la page),
// pour fonctionner sur plusieurs sites sans dépendre d'une mise en page précise.
// Règle : une information introuvable reste null, jamais devinée.

import { findCommune, distanceKm } from './communes.js';

const QUARTIERS = [
  'Habas La Plaine', 'Polo Beyris', 'Grand Bayonne', 'Petit Bayonne', 'Hauts de Bayonne', 'Saint-Esprit', 'Saint Esprit',
  'Saint-Léon', 'Saint Léon', 'Saint-Étienne', 'Saint Etienne', 'Saint-Bernard', 'Saint-André', 'Saint-Frédéric',
  'Sainte-Croix', 'Arrousets', 'Arroussets', 'Marracq', 'Mousserolles', 'Séqué', 'Belharra', 'Lachepaillet', 'Arènes',
  'Citadelle', 'Balichon', 'Lahubiague', 'Habas', 'Beyris', 'Laharie', 'Caradoc', 'Lycée Cassin'
];

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à',
  acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', Eacute: 'É', rsquo: '’',
  laquo: '«', raquo: '»', sup2: '²', euro: '€', deg: '°', hellip: '…', ndash: '–', mdash: '—' };

export function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n] ?? m);
}

/** Texte lisible de la page (attributs alt/title inclus, car certains sites y mettent le DPE). */
export function pageText(html) {
  let h = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|footer|select|aside|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<img\b[^>]*?\balt="([^"]*)"[^>]*>/gi, ' $1 ');
  h = h.replace(/<(br|p|div|li|tr|h[1-6]|section|article|td|th|dd|dt)\b[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  return decode(h).replace(/[   ]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Coupe la page avant les blocs « biens similaires » qui fausseraient l'extraction. */
export function mainText(text, h1) {
  // Le contenu utile commence au titre de l'annonce : on ignore menus et bandeaux placés avant.
  if (h1) {
    const at = text.indexOf(h1.slice(0, 40));
    if (at > 0) text = text.slice(at);
  }
  const cut = text.search(/\n(biens similaires|annonces similaires|ventes similaires|vous aimerez aussi|ces biens peuvent|autres biens|d'autres annonces|nos autres biens|biens à découvrir)/i);
  return cut > 400 ? text.slice(0, cut) : text;
}

function meta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return c ? decode(c).trim() : null;
}

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { out.push(o); if (o['@graph']) walk(o['@graph']); } };
      walk(j);
    } catch { /* JSON-LD mal formé : ignoré */ }
  }
  return out;
}

const toNum = s => {
  if (s == null) return null;
  const n = Number(String(s).replace(/[\s.](?=\d{3}\b)/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export function parsePrice(s) {
  if (!s) return null;
  for (const m of s.matchAll(/(?<![\w²,.])(\d{1,3}(?:[\s.]\d{3})+|\d{5,7})(?:[.,]\d{2})?\s*(?:€|euros?|EUR)/gi)) {
    const n = toNum(m[1]);
    if (n >= 30000 && n <= 3000000) return n;
  }
  return null;
}

export function parseSurface(s) {
  if (!s) return null;
  for (const m of s.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*m(?:²|2\b|ètres? carrés)/gi)) {
    const n = toNum(m[1]);
    if (n >= 15 && n <= 500) return n;
  }
  return null;
}

/* Seuils du DPE (méthode en vigueur depuis le 1er juillet 2021, logements métropole). */
const E_TH = [[70, 'A'], [110, 'B'], [180, 'C'], [250, 'D'], [330, 'E'], [420, 'F']];
const G_TH = [[6, 'A'], [11, 'B'], [30, 'C'], [50, 'D'], [70, 'E'], [100, 'F']];
const letterFor = (v, th) => (th.find(([max]) => v <= max) || [0, 'G'])[1];
export function dpeFromValues(kwh, kg) {
  if (kwh == null) return null;
  const e = letterFor(kwh, E_TH);
  if (kg == null) return e;
  const g = letterFor(kg, G_TH);
  return e > g ? e : g;   // la classe retenue est la plus défavorable des deux
}
export const gesFromValue = kg => kg == null ? null : letterFor(kg, G_TH);

function findDpe(t) {
  const L = '([A-G])(?![a-zé])';
  const out = { dpe: null, dpeKwh: null, ges: null, gesKg: null, dpeDerived: false };
  const pats = [
    new RegExp(`classe (?:d['’])?[ée]nergie\\s*:?\\s*${L}`, 'i'),
    new RegExp(`(?:DPE|diagnostic de performance [ée]nerg[ée]tique)\\s*:?\\s*(?:classe\\s*)?${L}`, 'i'),
    new RegExp(`[ée]tiquette [ée]nergie\\s*:?\\s*${L}`, 'i'),
    new RegExp(`(?:^|\\n)${L}\\s*\\n\\s*classe [ée]nergie`, 'i')
  ];
  for (const p of pats) { const m = t.match(p); if (m) { out.dpe = m[1].toUpperCase(); break; } }
  const gp = [
    new RegExp(`(?:GES|classe climat|gaz à effet de serre|classe climat\\s*/\\s*GES)\\s*:?\\s*${L}`, 'i'),
    new RegExp(`(?:^|\\n)${L}\\s*\\n\\s*(?:indice d['’])?[ée]missions? de gaz`, 'i')
  ];
  for (const p of gp) { const m = t.match(p); if (m) { out.ges = m[1].toUpperCase(); break; } }
  const k = t.match(/(\d{1,3}(?:[.,]\d)?)\s*kWh(?:EP)?\s*\/\s*m/i);
  if (k) out.dpeKwh = toNum(k[1]);
  const g = t.match(/(\d{1,3}(?:[.,]\d)?)\s*kg\s*(?:éq)?\s*CO\s*[2₂]/i);
  if (g) out.gesKg = toNum(g[1]);
  if (!out.dpe && out.dpeKwh != null) { out.dpe = dpeFromValues(out.dpeKwh, out.gesKg); out.dpeDerived = true; }
  if (!out.ges && out.gesKg != null) out.ges = gesFromValue(out.gesKg);
  return out;
}

const WORDS = { un: 1, une: 1, deux: 2, double: 2, trois: 3, quatre: 4 };
function findParking(t) {
  t = t.replace(/parking\s*\/\s*garage|garage\s*\/\s*parking/gi, 'parking');   // libellé générique des fiches, pas une nature de place
  const lower = t.toLowerCase();
  const optional = /(parking|place|garage|box)[^.\n]{0,40}(en sus|en option|non compris|en supplément|possibilit[ée] d['’]acqu)/i.test(t);
  const re = /(\d|un|une|deux|trois|double)?\s*(?:places? de (?:parking|stationnement)|stationnements?|parkings?|garages?|box(?:es)?|emplacements? de stationnement)\b[^.\n]{0,60}/gi;
  let count = 0, hits = [];
  for (const m of t.matchAll(re)) {
    const s = m[0].toLowerCase();
    if (/visiteurs?|aisé|facile|public|à proximité|dans la rue|commun|partag|vélo|deux-roues|motos?|en sus|en option/.test(s) && !/privati|privé|sécuris|sous-sol|ferm|couvert/.test(s)) continue;
    hits.push(s);
    const w = m[1]?.toLowerCase();
    const n = w ? (WORDS[w] ?? Number(w)) : 1;
    count = Math.max(count, n);
  }
  if (/deux (?:places|emplacements|stationnements|parkings)|2 (?:places|parkings|stationnements)|double (?:place|stationnement)|2 places de parking/i.test(t)) count = Math.max(count, 2);
  if (!hits.length) return optional ? { count: null, type: 'inconnu', detail: 'Parking proposé en option' } : { count: 0, type: null, detail: null, uncertain: true };
  const all = hits.join(' ');
  let type = 'inconnu';
  if (/box|garage ferm|ferm/.test(all)) type = 'box';
  else if (/garage/.test(all)) type = 'garage';
  else if (/sous-sol|sous sol|souterrain/.test(all)) type = 'souterrain';
  else if (/couvert/.test(all)) type = 'couvert';
  else if (/ext[ée]rieur|a[ée]rien/.test(all)) type = 'exterieur';
  if (optional && !/inclu/.test(lower)) return { count: null, type, detail: 'Parking peut-être en option : à vérifier' };
  return { count, type, detail: hits[0].replace(/\s+/g, ' ').trim().slice(0, 120) };
}

function findCondition(t) {
  if (/\b(VEFA|programme neuf|logement neuf|appartement neuf|livraison (?:prévue )?(?:au |en )?\d|frais de notaire réduits)\b/i.test(t)) return 'neuf';
  if (/(travaux à prévoir|à rénover|rénovation complète|gros travaux|à rafraîchir entièrement)/i.test(t)) return 'travaux';
  if (/(rafraîchissement|rafraichissement|à rafraîchir|petits travaux|touche de fraîcheur)/i.test(t)) return 'rafraichir';
  if (/(parfait état|excellent état|aucuns? travaux|sans travaux|clé en main|prêt à vivre|état irréprochable)/i.test(t)) return 'excellent';
  if (/(très bon état|bon état)/i.test(t)) return 'bon';
  return 'inconnu';
}

function money(t, labelRe) {
  const m = t.match(new RegExp(labelRe + `[^\\d]{0,40}(\\d{1,2}[\\s.]?\\d{3}|\\d{2,4})(?:[.,]\\d{1,2})?\\s*(?:€|euros?|EUR)?\\s*(\\/\\s*mois|par mois|mensuel)?`, 'i'));
  if (!m) return null;
  let n = toNum(m[1]);
  if (m[2]) n *= 12;
  return n && n > 50 && n < 20000 ? Math.round(n) : null;
}

/** Extrait un objet annonce (partiel) d'une page. */
export function extractListing(html, url) {
  const text = pageText(html);
  const head = (meta(html, 'og:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const title = decode(decode(head)).replace(/\s+/g, ' ').trim();   // certains sites encodent deux fois (&amp;euro;)
  const h1 = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ') || '').replace(/\s+/g, ' ').trim();
  const main = mainText(text, h1);
  const desc = decode(meta(html, 'og:description') || meta(html, 'description') || '');
  const top = [title, h1, desc].join('\n');

  // Données structurées si présentes
  let ldPrice = null, ldSurface = null, ldRooms = null;
  for (const o of jsonLd(html)) {
    const offers = Array.isArray(o.offers) ? o.offers[0] : o.offers;
    if (!ldPrice && offers?.price) ldPrice = toNum(offers.price);
    if (!ldSurface && o.floorSize?.value) ldSurface = toNum(o.floorSize.value);
    if (!ldRooms && o.numberOfRooms) ldRooms = toNum(o.numberOfRooms?.value ?? o.numberOfRooms);
  }

  const price = ldPrice || parsePrice(top) || parsePrice(main.match(/prix[^\n]{0,80}/i)?.[0]) || parsePrice(main.slice(0, 4000));
  const habitable = toNum(main.match(/surface habitable\s*:?\s*(\d{2,3}(?:[.,]\d{1,2})?)/i)?.[1]);
  const carrez = toNum(main.match(/(?:surface\s*)?(?:loi\s*)?carrez\s*:?\s*(\d{2,3}(?:[.,]\d{1,2})?)/i)?.[1]
    ?? main.match(/(\d{2,3}(?:[.,]\d{1,2})?)\s*m²\s*(?:\(\s*)?(?:loi\s*)?carrez/i)?.[1]);
  const surface = habitable || ldSurface || parseSurface(top) || carrez || parseSurface(main.slice(0, 3000));

  const rooms = ldRooms || toNum((top + '\n' + main).match(/(\d)\s*pi[èe]ces?/i)?.[1]) || toNum(top.match(/\bT(\d)\b/)?.[1]);
  const bedM = main.match(/(?:nombre de |nb )chambres?(?:\s*\(s\))?\s*:?\s*(\d)/i) || main.match(/\b(\d|une?|deux|trois|quatre)\s+(?:belles?\s+|grandes?\s+)?chambres?/i);
  const bedrooms = bedM ? (WORDS[bedM[1].toLowerCase()] ?? toNum(bedM[1])) : null;

  const floorM = main.match(/(rez-de-jardin|rez-de-chaussée|rez de jardin|rez de chaussée|dernier étage|\d{1,2}\s*(?:er|e|ème|eme)\s*(?:et dernier\s*)?étage(?:\s*sur\s*\d{1,2})?)/i);
  const elevator = /sans ascenseur/i.test(main) ? false : /ascenseur/i.test(main) ? true : null;

  const charges = money(main, '(?:charges? (?:de copropriété|annuelles?|courantes)|montant moyen (?:annuel )?(?:de la quote-part )?(?:de |des )?charges)');
  const taxeFonciere = money(main, 'taxe fonci[èe]re');
  const yearM = main.match(/(?:construit(?:e)? en|construction\s*:?|année de construction\s*:?|résidence (?:récente )?(?:de|achevée en|\()|datant de)\s*(19[5-9]\d|20[0-3]\d)/i);
  const extM = main.match(/[^.\n]{0,25}\b(terrasses?|balcons?|jardin(?:et)?|loggia)\b[^.\n]{0,45}/i);

  let procedure = null;
  if (/pas de procédure|procédure en cours\s*:?\s*(non\b|nc\b|aucune|pas\b)/i.test(main)) procedure = false;
  else if (/procédure en cours/i.test(main)) procedure = true;

  const soldRe = /(sous compromis|trop tard|offre accept[ée]e|bien vendu|déjà vendu|(?:^|\n)\s*vendu\s*(?:\n|$))/i;
  const titleSold = /\bvendu\b(?!\s*(?:lou|meubl|avec|en |libre|occup))/i.test(title + ' ' + h1);
  const sold = titleSold || soldRe.test(desc) || soldRe.test(main.slice(0, 2000));

  const commune = findCommune({ url, title: title + ' ' + h1, text: main });
  const quartier = commune?.name !== 'Bayonne' ? null : QUARTIERS.find(q => new RegExp(`\\b${q.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i').test(main.slice(0, 6000))) || null;
  const isApartment = /appartement|\bT[1-6]\b|\bF[1-6]\b|studio|duplex/i.test(top + ' ' + url);

  return {
    url, title: title || h1 || null, price, surface,
    surfaceCarrez: carrez && carrez !== surface ? carrez : null,
    rooms, bedrooms,
    ...findDpe(main),
    parking: findParking(main),
    floor: floorM ? floorM[1].replace(/\s+/g, ' ') : null, elevator,
    charges, taxeFonciere,
    exterior: extM ? extM[0].trim().replace(/\s+/g, ' ') : null,
    condition: findCondition(main), year: toNum(yearM?.[1]), procedure,
    quartier: quartier ? quartier.replace(/^Arroussets$/, 'Arrousets').replace('Saint Esprit', 'Saint-Esprit').replace('Saint Léon', 'Saint-Léon') : null,
    city: commune?.name ?? null,
    postalCode: commune?.cp ?? null,
    distanceKm: commune ? distanceKm(commune) : null,
    isApartment, sold
  };
}

/** Liens d'annonces présents dans une page de résultats. */
export function extractLinks(html, baseUrl, pattern) {
  const re = new RegExp(pattern);
  const out = new Set();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(decode(m[1]), baseUrl);
      u.search = ''; u.hash = '';
      if (re.test(u.href)) out.add(u.href);
    } catch { /* lien invalide */ }
  }
  return [...out];
}
