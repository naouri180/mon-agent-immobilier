// Base de données : de simples fichiers JSON versionnés dans le dépôt GitHub.
// Chaque passage de l'agent est un commit : l'historique complet reste consultable et réversible.
import { readFile, writeFile } from 'node:fs/promises';

export async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}
export async function saveJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

export function canonicalUrl(u) {
  const x = new URL(u);
  x.hash = ''; x.search = '';
  x.hostname = x.hostname.toLowerCase();
  return x.href.replace(/\/$/, '');
}

/** Identifiant stable : site + numéro d'annonce trouvé dans l'URL. */
export function makeId(url) {
  const u = new URL(url);
  const site = u.hostname.replace(/^www\.|^fr\./, '').split('.')[0];
  const num = u.pathname.match(/(\d{5,})/g)?.pop() || u.pathname.replace(/[^a-z0-9]+/gi, '-').slice(-40);
  return `${site}-${num}`;
}

/**
 * Doublon probable entre deux sites : même surface (±1 m²), même prix (±2 %)
 * et, si connus des deux côtés, même DPE.
 */
export function looksDuplicate(a, b) {
  if (!a.price || !b.price || !a.surface || !b.surface) return false;
  if (Math.abs(a.surface - b.surface) > 1) return false;
  if (Math.abs(a.price - b.price) / Math.max(a.price, b.price) > 0.02) return false;
  if (a.dpe && b.dpe && a.dpe !== b.dpe) return false;
  if (a.dpeKwh && b.dpeKwh && Math.abs(a.dpeKwh - b.dpeKwh) > 2) return false;
  return true;
}

/** Ajoute un relevé de prix si le prix a changé ; renvoie la variation éventuelle. */
export function recordPrice(listing, price, date) {
  if (!price) return null;
  listing.priceHistory ||= [];
  const last = listing.priceHistory.at(-1);
  if (!last) { listing.priceHistory.push({ date, price }); return null; }
  if (last.price === price) return null;
  listing.priceHistory.push({ date, price });
  listing.price = price;
  return { from: last.price, to: price, diff: price - last.price };
}
