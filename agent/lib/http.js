// Accès réseau poli : un seul User-Agent identifiable, respect de robots.txt,
// pause entre deux requêtes vers le même site, délai maximum par requête.
import { isAllowedByRobots } from './robots.js';

const robotsCache = new Map();   // origine -> texte robots.txt (ou null)
const lastHit = new Map();       // hôte -> horodatage de la dernière requête
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function createHttp({ userAgent, delayMs = 2500, timeoutMs = 20000 }) {
  async function raw(url) {
    const host = new URL(url).host;
    const wait = (lastHit.get(host) || 0) + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, {
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': userAgent, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9' }
      });
    } finally { clearTimeout(t); }
  }

  async function robotsFor(url) {
    const origin = new URL(url).origin;
    if (!robotsCache.has(origin)) {
      let txt = null;
      try {
        const r = await raw(origin + '/robots.txt');
        txt = r.ok ? await r.text() : '';      // 404 = aucune restriction déclarée
      } catch { txt = null; }                  // injoignable : on s'abstient
      robotsCache.set(origin, txt);
    }
    return robotsCache.get(origin);
  }

  /** Renvoie { ok, status, url, html, reason }. Ne contacte jamais une page interdite par robots.txt. */
  async function get(url) {
    const robots = await robotsFor(url);
    if (robots === null) return { ok: false, status: 0, url, reason: 'robots.txt injoignable' };
    if (!isAllowedByRobots(robots, url, userAgent)) return { ok: false, status: 0, url, reason: 'interdit par robots.txt' };
    try {
      const r = await raw(url);
      const html = await r.text();
      if (r.status === 403 || r.status === 429) return { ok: false, status: r.status, url: r.url, reason: 'accès refusé par le site' };
      return { ok: r.ok, status: r.status, url: r.url, html, reason: r.ok ? '' : 'HTTP ' + r.status };
    } catch (e) {
      return { ok: false, status: 0, url, reason: e.name === 'AbortError' ? 'délai dépassé' : 'erreur réseau' };
    }
  }

  return { get };
}
