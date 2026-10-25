// Cœur de l'agent : recherche → vérification → dédoublonnage → suivi des prix → événements.
// Ne fait aucune entrée/sortie fichier : tout est passé en paramètre (testable hors ligne).
import { extractListing, extractLinks } from './extract.js';
import { canonicalUrl, makeId, looksDuplicate, recordPrice } from './db.js';
import { scoreBreakdown, unmetCriteria, pricePerM2 } from '../../js/scoring.js';

const RETRY_IGNORED_AFTER_DAYS = 30;
const FILLABLE = ['rooms', 'bedrooms', 'dpe', 'dpeKwh', 'ges', 'gesKg', 'floor', 'elevator', 'charges', 'taxeFonciere', 'exterior', 'year', 'quartier', 'surfaceCarrez'];

function weaknessesFor(l, criteria) {
  const w = [];
  if (l.dpeDerived) w.push('Lettre DPE déduite des valeurs kWh/CO₂');
  if (!l.dpe) w.push('DPE non trouvé dans l’annonce');
  if (l.parking?.uncertain || l.parking?.count == null) w.push('Parking non confirmé');
  else if (l.parking?.type === 'inconnu') w.push('Nature du parking non précisée');
  if (l.procedure) w.push('Procédure en cours dans la copropriété');
  if (l.charges && l.surface && l.charges / l.surface > 28) w.push('Charges élevées');
  const ppm = pricePerM2(l);
  if (ppm && ppm > criteria.refPriceM2 * 1.2) w.push('Prix au m² élevé');
  if (l.condition === 'inconnu') w.push('État non précisé');
  w.push('Fiche lue automatiquement : à vérifier sur l’annonce');
  return w;
}

export function decorate(listings, criteria) {
  for (const l of listings) {
    l._score = scoreBreakdown(l, criteria).score;
    l._perfect = unmetCriteria(l, criteria).length === 0;
  }
  return listings;
}

export async function runAgent({ config, data, ignored = {}, http, today, nowIso, log = () => {} }) {
  const listings = data.listings || [];
  const limits = config.limits || {};
  const collect = config.collect || {};
  const sourcesReport = [];
  const events = { added: [], hot: [], drops: [], removed: [] };
  const stats = { pagesFetched: 0, new: 0, priceDrops: 0, removed: 0, duplicates: 0, rejected: 0, rechecked: 0 };

  // Index des URL déjà connues (y compris celles des doublons sur d'autres sites)
  const known = new Map();
  for (const l of listings) for (const u of [l.url, ...(l.altUrls || [])]) known.set(canonicalUrl(u), l);

  // 1. Pages de résultats → liens d'annonces
  const candidates = [];
  for (const src of config.sources || []) {
    if (!src.enabled) { sourcesReport.push({ name: src.name, result: 'désactivée' }); continue; }
    let found = 0, problem = '';
    for (const su of src.searchUrls || []) {
      const res = await http.get(su);
      stats.pagesFetched++;
      if (!res.ok) { problem = res.reason; continue; }
      const links = extractLinks(res.html, res.url || su, src.linkPattern);
      found += links.length;
      for (const u of links) candidates.push({ url: u, source: src.name });
    }
    sourcesReport.push({ name: src.name, result: problem && !found ? `bloquée : ${problem}` : `${found} annonce(s) listée(s)` });
    log(`${src.name} : ${found} lien(s)${problem ? ' (' + problem + ')' : ''}`);
  }
  for (const u of config.watchUrls || []) candidates.push({ url: u, source: 'Suivi manuel' });

  // 2. Nouvelles annonces : lecture de la fiche et vérification
  const fresh = [];
  const seenNow = new Set();
  for (const c of candidates) {
    const key = canonicalUrl(c.url);
    if (known.has(key) || seenNow.has(key)) continue;
    const ig = ignored[key];
    if (ig && (Date.parse(today) - Date.parse(ig.date)) / 864e5 < RETRY_IGNORED_AFTER_DAYS) continue;
    seenNow.add(key);
    fresh.push(c);
  }
  for (const c of fresh.slice(0, limits.maxDetailPagesPerRun ?? 40)) {
    const key = canonicalUrl(c.url);
    const res = await http.get(c.url);
    stats.pagesFetched++;
    if (!res.ok) {
      if (res.status === 404 || res.status === 410) ignored[key] = { reason: 'introuvable', date: today };
      continue;
    }
    const ex = extractListing(res.html, c.url);
    let reject = null;
    if (!ex.isApartment) reject = 'pas un appartement';
    else if (collect.requireCity && ex.city?.toLowerCase() !== collect.requireCity) reject = 'hors secteur';
    else if (ex.sold) reject = 'déjà vendu / sous compromis';
    else if (!ex.price) reject = 'prix introuvable';
    else if (ex.surface && (ex.surface < (collect.surfaceMin ?? 0) || ex.surface > (collect.surfaceMax ?? 1e9))) reject = `surface ${ex.surface} m² hors collecte`;
    if (reject) { ignored[key] = { reason: reject, date: today }; stats.rejected++; continue; }

    const { isApartment, sold, ...fields } = ex;
    const listing = {
      id: makeId(c.url), source: c.source, ...fields, url: c.url, status: 'active', verified: false,
      firstSeen: today, lastSeen: today, lastChecked: today, priceHistory: [{ date: today, price: ex.price }]
    };
    listing.weaknesses = weaknessesFor(listing, config.criteria);

    const dup = listings.find(o => o.status === 'active' && looksDuplicate(o, listing));
    if (dup) {
      dup.altUrls = [...new Set([...(dup.altUrls || []), c.url])];
      dup.duplicates = [...new Set([...(dup.duplicates || []), new URL(c.url).hostname.replace(/^www\./, '')])];
      known.set(key, dup);
      stats.duplicates++;
      continue;
    }
    if (listings.some(o => o.id === listing.id)) listing.id += '-' + listings.length;
    listings.push(listing);
    known.set(key, listing);
    events.added.push(listing);
    stats.new++;
  }

  // 3. Re-vérification des annonces suivies (prix, statut) — les plus anciennes d'abord
  const addedIds = new Set(events.added.map(l => l.id));
  const toCheck = listings
    .filter(l => l.status === 'active' && !l.duplicateOf && !addedIds.has(l.id) && l.lastChecked !== today)
    .sort((a, b) => String(a.lastChecked).localeCompare(String(b.lastChecked)))
    .slice(0, limits.maxRechecksPerRun ?? 30);
  for (const l of toCheck) {
    const res = await http.get(l.url);
    stats.pagesFetched++;
    if (res.status === 404 || res.status === 410) {
      l.status = 'removed'; l.removedOn = today; events.removed.push(l); stats.removed++; continue;
    }
    if (!res.ok) { l.lastCheckProblem = res.reason; continue; }
    const moved = res.url && canonicalUrl(res.url) !== canonicalUrl(l.url) && makeId(res.url) !== makeId(l.url);
    if (moved) { l.status = 'removed'; l.removedOn = today; events.removed.push(l); stats.removed++; continue; }
    const ex = extractListing(res.html, l.url);
    l.lastChecked = today; l.lastSeen = today; delete l.lastCheckProblem;
    stats.rechecked++;
    if (ex.sold) { l.status = 'sold'; l.removedOn = today; events.removed.push(l); stats.removed++; continue; }
    for (const k of FILLABLE) if (l[k] == null && ex[k] != null) l[k] = ex[k];
    if ((l.parking?.count == null || l.parking?.uncertain) && ex.parking?.count) l.parking = ex.parking;
    const change = recordPrice(l, ex.price, today);
    if (change && change.diff < 0) { events.drops.push({ listing: l, change }); stats.priceDrops++; }
  }

  // 4. Notes et événements à signaler
  decorate(listings, config.criteria);
  events.hot = events.added.filter(l => l._perfect && l._score >= config.criteria.alertScore);
  events.drops = events.drops.filter(d => d.listing._perfect);

  const clean = listings.map(({ _score, _perfect, ...rest }) => rest);
  const blocked = sourcesReport.filter(s => s.result.startsWith('bloquée')).length;
  const status = {
    lastRun: nowIso, mode: 'search',
    message: `${stats.new} nouvelle(s) annonce(s), ${stats.priceDrops} baisse(s) de prix, ${stats.removed} retirée(s). ${stats.rechecked} annonce(s) revérifiée(s)${blocked ? `, ${blocked} source(s) bloquée(s)` : ''}.`,
    sources: sourcesReport, stats
  };
  return { data: { updatedAt: nowIso, listings: clean }, decorated: listings, ignored, status, events };
}
