// Stockage local (sur le téléphone) : favoris, biens consultés, critères, notes perso.
// Ces données restent dans Safari/l'app installée : elles ne quittent jamais l'appareil.
import { DEFAULT_CRITERIA } from './scoring.js';

const K = {
  favs: 'mai.favs', seen: 'mai.seen', criteria: 'mai.criteria', notes: 'mai.notes',
  lastVisit: 'mai.lastVisit', prevVisit: 'mai.prevVisit', filters: 'mai.filters', prefs: 'mai.prefs'
};

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible : on continue sans */ }
}

export const store = {
  favs: new Set(read(K.favs, [])),
  seen: read(K.seen, {}),
  notes: read(K.notes, {}),
  criteria: { ...DEFAULT_CRITERIA, ...read(K.criteria, {}) },
  filters: read(K.filters, {}),
  prefs: { hideUnmatched: false, ...read(K.prefs, {}) },
  prevVisit: read(K.prevVisit, null),

  toggleFav(id) {
    this.favs.has(id) ? this.favs.delete(id) : this.favs.add(id);
    write(K.favs, [...this.favs]);
    return this.favs.has(id);
  },
  markSeen(id) { this.seen[id] = new Date().toISOString(); write(K.seen, this.seen); },
  unmarkSeen(id) { delete this.seen[id]; write(K.seen, this.seen); },
  setNote(id, text) { if (text) this.notes[id] = text; else delete this.notes[id]; write(K.notes, this.notes); },
  setCriteria(c) { this.criteria = { ...DEFAULT_CRITERIA, ...c }; write(K.criteria, this.criteria); },
  resetCriteria() { this.criteria = { ...DEFAULT_CRITERIA }; write(K.criteria, {}); },
  setFilters(f) { this.filters = f; write(K.filters, f); },
  setPrefs(p) { this.prefs = { ...this.prefs, ...p }; write(K.prefs, this.prefs); },

  /** Note la visite : la précédente sert à repérer les annonces apparues depuis. */
  touchVisit() {
    const last = read(K.lastVisit, null);
    const today = new Date().toISOString().slice(0, 10);
    if (last && last.slice(0, 10) !== today) { write(K.prevVisit, last); this.prevVisit = last; }
    write(K.lastVisit, new Date().toISOString());
  },

  exportAll() {
    return JSON.stringify({ favs: [...this.favs], seen: this.seen, notes: this.notes, criteria: this.criteria }, null, 2);
  },
  importAll(json) {
    const d = JSON.parse(json);
    if (d.favs) { this.favs = new Set(d.favs); write(K.favs, d.favs); }
    if (d.seen) { this.seen = d.seen; write(K.seen, d.seen); }
    if (d.notes) { this.notes = d.notes; write(K.notes, d.notes); }
    if (d.criteria) this.setCriteria(d.criteria);
  }
};
