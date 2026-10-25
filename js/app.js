// Interface de « Mon Agent Immobilier ».
// Lit data/listings.json (écrit par l'agent) et garde favoris/consultés/critères sur le téléphone.
import {
  scoreBreakdown, unmetCriteria, pricePerM2, lastPriceChange,
  CONDITION_LABELS, PARKING_LABELS, DEFAULT_CRITERIA
} from './scoring.js';
import { store } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const fmtEur = n => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' €';
const fmtNum = (n, d = 0) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n);
const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = s => s ? new Date(s).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const daysAgo = s => s ? (Date.now() - new Date(s).getTime()) / 86400000 : Infinity;

const state = { listings: [], status: null, updatedAt: null, tab: 'dashboard', listMode: 'all', sort: 'score' };

/* ---------- Données ---------- */
async function loadData({ silent } = {}) {
  const btn = $('#refresh-btn');
  btn.classList.add('spin');
  try {
    const [l, s] = await Promise.all([
      fetch('data/listings.json?t=' + Date.now(), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('data/status.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    state.listings = l.listings || [];
    state.updatedAt = l.updatedAt;
    state.status = s;
    enrich();
    if (!silent) toast('Données à jour');
  } catch (e) {
    toast('Hors ligne : affichage des dernières données connues');
  } finally {
    btn.classList.remove('spin');
    render();
  }
}

function enrich() {
  const c = store.criteria;
  for (const l of state.listings) {
    const b = scoreBreakdown(l, c);
    l._score = b.score;
    l._parts = b.parts;
    l._ppm = pricePerM2(l);
    l._unmet = unmetCriteria(l, c);
    l._perfect = l._unmet.length === 0;
    l._drop = lastPriceChange(l);
    const ref = store.prevVisit ? new Date(store.prevVisit) : null;
    l._new = !l.seed && l.status === 'active' && (ref ? new Date(l.firstSeen) >= new Date(ref.toISOString().slice(0, 10)) : daysAgo(l.firstSeen) <= 3);
  }
}

const active = () => state.listings.filter(l => l.status === 'active' && !l.duplicateOf);

/* ---------- Rendu commun ---------- */
function scoreClass(s) { return s >= store.criteria.alertScore ? '' : s >= 5.5 ? 'mid' : 'low'; }
function dpeBadge(l) {
  const d = (l.dpe || '').toUpperCase();
  return d ? `<span class="dpe dpe-${d}" title="DPE ${d}">${d}</span>` : `<span class="dpe dpe-x" title="DPE inconnu">?</span>`;
}
function parkingText(p) {
  if (!p || p.count == null) return 'Parking ?';
  if (!p.count) return 'Sans parking';
  return `${p.count} pl. · ${PARKING_LABELS[p.type] || 'nature ?'}`;
}
const heart = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

function card(l) {
  const fav = store.favs.has(l.id);
  const seen = !!store.seen[l.id];
  const tags = [];
  if (l._new) tags.push('<span class="chip red">Nouveau</span>');
  if (l._drop && l._drop.diff < 0) tags.push(`<span class="chip green">Baisse ${fmtNum(l._drop.pct, 1)} %</span>`);
  if (l._perfect) tags.push('<span class="chip green">Correspond</span>');
  else if (l.status === 'active') tags.push(`<span class="chip amber" title="${esc(l._unmet.join(', '))}">${esc(l._unmet[0])}</span>`);
  if (l.status !== 'active') tags.push(`<span class="chip">${l.status === 'sold' ? 'Vendu / compromis' : 'Retirée'}</span>`);
  return `
  <article class="card ${seen ? 'seen' : ''}" data-id="${esc(l.id)}" role="button" tabindex="0" aria-label="${esc(l.title)}">
    <div class="card-top">
      <div>
        <div class="price num">${fmtEur(l.price)}</div>
        <div class="ppm num">${fmtNum(l.surface, 2)} m² · ${fmtEur(l._ppm)}/m²</div>
      </div>
      <div class="score ${scoreClass(l._score)}" title="Note d'intérêt"><div><b class="num">${fmtNum(l._score, 1)}</b><small>/10</small></div></div>
    </div>
    <p class="card-title">${esc(l.title)}</p>
    <div class="meta">
      ${dpeBadge(l)}
      <span class="chip">${esc(parkingText(l.parking))}</span>
      <span class="chip">${l.bedrooms ?? '?'} ch.</span>
      ${l.quartier ? `<span class="chip">${esc(l.quartier)}</span>` : ''}
    </div>
    ${tags.length ? `<div class="meta">${tags.join('')}</div>` : ''}
    <div class="card-foot">
      <span>${esc(l.source)}${seen ? ' · consulté' : ''}</span>
      <button class="fav-btn ${fav ? 'on' : ''}" data-fav="${esc(l.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${heart}</button>
    </div>
  </article>`;
}

function cards(list, empty) {
  return list.length ? `<div class="cards grid2">${list.map(card).join('')}</div>` : `<div class="empty">${empty}</div>`;
}

function statusBanner() {
  const s = state.status;
  if (!s || !s.lastRun) {
    return `<div class="status warn"><span class="dot"></span><span>Agent automatique pas encore lancé · données du ${fmtDate(state.updatedAt)}</span></div>`;
  }
  const late = daysAgo(s.lastRun) > 1;
  return `<div class="status ${late ? 'warn' : 'ok'}"><span class="dot"></span><span>Dernière recherche ${fmtDateTime(s.lastRun)} · ${s.stats?.new ?? 0} nouvelle(s)</span></div>`;
}

/* ---------- Vues ---------- */
function renderDashboard() {
  const act = active();
  const perfect = act.filter(l => l._perfect).sort((a, b) => b._score - a._score);
  const fresh = act.filter(l => l._new).sort((a, b) => b._score - a._score);
  const drops = act.filter(l => l._drop && l._drop.diff < 0);
  const best = [...perfect].slice(0, 3);
  const avg = perfect.length ? Math.round(perfect.reduce((s, l) => s + l._ppm, 0) / perfect.length) : null;

  view.innerHTML = `
    ${statusBanner()}
    <div class="kpis">
      <div class="kpi"><b class="num">${perfect.length}</b><span>correspondent</span></div>
      <div class="kpi"><b class="num">${fresh.length}</b><span>nouvelles</span></div>
      <div class="kpi"><b class="num">${avg ? fmtNum(avg / 1000, 1) + 'k' : '—'}</b><span>€/m² moyen</span></div>
    </div>

    <div class="section"><h2>Meilleures opportunités</h2><button class="more" data-goto="list:perfect">Tout voir</button></div>
    ${cards(best, 'Aucun bien ne remplit tous vos critères pour le moment.')}

    <div class="section"><h2>Nouvelles annonces</h2>${fresh.length ? '<button class="more" data-goto="list:new">Tout voir</button>' : ''}</div>
    ${cards(fresh.slice(0, 4), store.prevVisit ? 'Rien de nouveau depuis votre dernière visite.' : 'Les nouvelles annonces détectées par l’agent apparaîtront ici.')}

    ${drops.length ? `<div class="section"><h2>Baisses de prix</h2></div>${cards(drops, '')}` : ''}
  `;
}

function applyFilters(list) {
  const f = store.filters;
  return list.filter(l => {
    if (f.priceMax && l.price > f.priceMax) return false;
    if (f.surfaceMin && (l.surface ?? 0) < f.surfaceMin) return false;
    if (f.surfaceMax && (l.surface ?? 999) > f.surfaceMax) return false;
    if (f.dpe?.length && !f.dpe.includes((l.dpe || '').toUpperCase())) return false;
    if (f.quartier && l.quartier !== f.quartier) return false;
    if (f.parkingMin && (l.parking?.count ?? 0) < f.parkingMin) return false;
    if (f.parkingClosed && !['box', 'garage', 'souterrain'].includes(l.parking?.type)) return false;
    if (f.bedroomsMin && (l.bedrooms ?? 0) < f.bedroomsMin) return false;
    if (f.condition?.length && !f.condition.includes(l.condition || 'inconnu')) return false;
    return true;
  });
}
const filterCount = () => {
  const f = store.filters; let n = 0;
  for (const k of ['priceMax', 'surfaceMin', 'surfaceMax', 'quartier', 'parkingMin', 'parkingClosed', 'bedroomsMin']) if (f[k]) n++;
  if (f.dpe?.length) n++; if (f.condition?.length) n++;
  return n;
};

const SORTS = {
  score: (a, b) => b._score - a._score,
  price: (a, b) => a.price - b.price,
  ppm: (a, b) => (a._ppm ?? 1e9) - (b._ppm ?? 1e9),
  recent: (a, b) => String(b.firstSeen).localeCompare(String(a.firstSeen)),
  surface: (a, b) => (b.surface ?? 0) - (a.surface ?? 0)
};

function renderList() {
  const modes = { all: 'Toutes', perfect: 'Correspondent', new: 'Nouvelles', unseen: 'Non consultées', archived: 'Retirées' };
  let list = state.listMode === 'archived' ? state.listings.filter(l => l.status !== 'active') : active();
  if (state.listMode === 'perfect') list = list.filter(l => l._perfect);
  if (state.listMode === 'new') list = list.filter(l => l._new);
  if (state.listMode === 'unseen') list = list.filter(l => !store.seen[l.id]);
  list = applyFilters(list).sort(SORTS[state.sort]);
  const n = filterCount();
  view.innerHTML = `
    <div class="seg" role="tablist">${Object.entries(modes).map(([k, v]) => `<button data-mode="${k}" class="${state.listMode === k ? 'active' : ''}">${v}</button>`).join('')}</div>
    <div class="toolbar">
      <select id="sort" aria-label="Trier">
        <option value="score">Trier : meilleure note</option><option value="price">Prix croissant</option>
        <option value="ppm">Prix au m² croissant</option><option value="recent">Plus récentes</option><option value="surface">Plus grandes</option>
      </select>
      <button class="filter-btn" id="open-filters">Filtres${n ? `<span class="count">${n}</span>` : ''}</button>
    </div>
    <p class="hint">${list.length} annonce(s)</p>
    ${cards(list, 'Aucune annonce avec ces filtres.')}
  `;
  $('#sort').value = state.sort;
}

function renderFavorites() {
  const list = state.listings.filter(l => store.favs.has(l.id)).sort(SORTS.score);
  view.innerHTML = `<p class="hint">Vos favoris restent enregistrés sur ce téléphone.</p>${cards(list, 'Touchez le cœur d’une annonce pour la garder ici.')}`;
}

function repoInfo() {
  const h = location.hostname;
  if (!h.endsWith('github.io')) return null;
  const owner = h.split('.')[0];
  const repo = location.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
  return { owner, repo, base: `https://github.com/${owner}/${repo}` };
}

function searchLinks() {
  const c = store.criteria;
  const q = encodeURIComponent;
  const g = site => `https://www.google.com/search?q=${q(`site:${site} appartement vente Bayonne ${c.surfaceMin}..${c.surfaceMax} m² parking`)}`;
  return [
    ['SeLoger', 'https://www.seloger.com/immobilier/achat/immo-bayonne-64/bien-appartement/commodite-parking/'],
    ['Leboncoin', `https://www.leboncoin.fr/recherche?category=9&locations=Bayonne_64100&real_estate_type=2&square=${c.surfaceMin}-${c.surfaceMax}${c.priceMax ? '&price=min-' + c.priceMax : ''}`],
    ["Bien'ici", `https://www.bienici.com/recherche/achat/bayonne-64100/appartement?surface-min=${c.surfaceMin}&surface-max=${c.surfaceMax}${c.priceMax ? '&prix-max=' + c.priceMax : ''}`],
    ['Logic-Immo', 'https://www.logic-immo.com/recherche-immo/vente/appartement/piece-3/nouvelle-aquitaine/bayonne-64100/ad08fr26620'],
    ['PAP (via Google)', g('pap.fr')],
    ['Figaro Immobilier (via Google)', g('immobilier.lefigaro.fr')],
    ['Green-Acres (via Google)', g('green-acres.fr')],
    ['Foncia', 'https://fr.foncia.com/achat/bayonne-64100/appartement'],
    ['ParuVendu', 'https://www.paruvendu.fr/immobilier/vente/appartement/bayonne-64100/'],
    ['FNAIM', 'https://www.fnaim.fr/liste-annonces-immobilieres/17-acheter-appartement-bayonne-64100.htm']
  ];
}

function renderSettings() {
  const c = store.criteria;
  const r = repoInfo();
  const s = state.status;
  const dpePills = ['A', 'B', 'C', 'D', 'E'].map(d => `<button type="button" class="pill ${c.dpeAllowed.includes(d) ? 'on' : ''}" data-dpe="${d}">${d}</button>`).join('');
  view.innerHTML = `
    <div class="section"><h2>Mes critères</h2></div>
    <form class="form card-plain" id="criteria-form">
      <div class="row2">
        <div class="field"><label for="c-smin">Surface min (m²)</label><input id="c-smin" type="number" inputmode="numeric" value="${c.surfaceMin}"></div>
        <div class="field"><label for="c-smax">Surface max (m²)</label><input id="c-smax" type="number" inputmode="numeric" value="${c.surfaceMax}"></div>
      </div>
      <div class="field"><span>DPE acceptés</span><div class="pills" id="c-dpe">${dpePills}</div></div>
      <div class="row2">
        <div class="field"><label for="c-pmin">Places de parking min</label><input id="c-pmin" type="number" inputmode="numeric" min="0" max="3" value="${c.parkingMin}"></div>
        <div class="field"><label for="c-pmax">Places max</label><input id="c-pmax" type="number" inputmode="numeric" min="0" max="5" value="${c.parkingMax ?? ''}"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="c-price">Budget max (€)</label><input id="c-price" type="number" inputmode="numeric" placeholder="Aucun" value="${c.priceMax ?? ''}"></div>
        <div class="field"><label for="c-bed">Chambres min</label><input id="c-bed" type="number" inputmode="numeric" placeholder="Indifférent" value="${c.bedroomsMin ?? ''}"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="c-ref">Prix de référence (€/m²)</label><input id="c-ref" type="number" inputmode="numeric" value="${c.refPriceM2}"></div>
        <div class="field"><label for="c-alert">Note « très intéressant »</label><input id="c-alert" type="number" step="0.5" min="0" max="10" value="${c.alertScore}"></div>
      </div>
      <label class="switch"><span>Exclure les biens avec gros travaux</span><input type="checkbox" id="c-works" ${c.excludeWorks ? 'checked' : ''}></label>
      <div class="btn-row">
        <button type="button" class="btn secondary" id="reset-criteria">Valeurs d'origine</button>
        <button type="submit" class="btn primary">Enregistrer</button>
      </div>
      <p class="hint">Ces critères changent immédiatement les notes et la mention « Correspond » dans l'application. Pour que l'agent automatique utilise les mêmes critères dans ses alertes, ${r ? `<a href="${r.base}/edit/main/agent/config.json" target="_blank" rel="noopener">modifiez sa configuration</a>` : 'modifiez <code>agent/config.json</code>'} (bouton « Copier pour l'agent » ci-dessous).</p>
      <button type="button" class="btn secondary" id="copy-criteria">Copier pour l'agent</button>
    </form>

    <div class="section"><h2>Agent automatique</h2></div>
    <div class="card-plain">
      ${s && s.lastRun ? `<p><b>Dernière recherche :</b> ${fmtDateTime(s.lastRun)}</p><p>${esc(s.message || '')}</p>
        <div class="src">${(s.sources || []).map(x => `<div><span>${esc(x.name)}</span><span>${esc(x.result)}</span></div>`).join('')}</div>`
        : `<p>${esc(s?.message || 'L’agent n’a pas encore tourné.')}</p>`}
      ${r ? `<div class="btn-row"><a class="btn secondary" href="${r.base}/actions" target="_blank" rel="noopener">Historique</a><a class="btn secondary" href="${r.base}/actions/workflows/agent.yml" target="_blank" rel="noopener">Lancer</a></div>` : '<p class="hint">Une fois l’application en ligne sur GitHub Pages, des raccourcis vers l’agent apparaîtront ici.</p>'}
    </div>

    <div class="section"><h2>Alertes sur le téléphone</h2></div>
    <div class="card-plain">
      <p>Les alertes arrivent via l’application gratuite <b>ntfy</b> (notifications push) et/ou par <b>e-mail</b>. Elles sont envoyées par l’agent, même quand cette application est fermée.</p>
      <div class="field"><label for="ntfy-topic">Votre sujet ntfy (pour vous abonner)</label><input id="ntfy-topic" type="text" autocomplete="off" autocapitalize="off" placeholder="ex. bayonne-immo-7f3k9q" value="${esc(store.prefs.ntfyTopic || '')}"></div>
      <div class="btn-row">
        <button type="button" class="btn secondary" id="gen-topic">Générer un nom</button>
        <a class="btn primary" id="ntfy-open" href="#" target="_blank" rel="noopener">S'abonner</a>
      </div>
      <p class="hint">Activer ou couper les alertes, le résumé quotidien ou les alertes de baisse : ${r ? `<a href="${r.base}/edit/main/agent/config.json" target="_blank" rel="noopener">section « notifications » de la configuration</a>` : 'section <code>notifications</code> de <code>agent/config.json</code>'}.</p>
    </div>

    <div class="section"><h2>Rechercher à la main</h2></div>
    <p class="hint">Ces sites n’autorisent pas la lecture automatique : l’agent ne les parcourt pas, voici les recherches toutes prêtes.</p>
    <div class="linklist" style="margin-top:10px">${searchLinks().map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)}</a>`).join('')}</div>

    <div class="section"><h2>Sauvegarde</h2></div>
    <div class="btn-row">
      <button class="btn secondary" id="export-btn">Exporter</button>
      <button class="btn secondary" id="import-btn">Importer</button>
    </div>
    <p class="hint">Exporte favoris, biens consultés, notes et critères (utile pour changer de téléphone).</p>
    <p class="hint" style="margin-top:18px">Mon Agent Immobilier · données du ${fmtDateTime(state.updatedAt)}</p>
  `;
  syncNtfyLink();
}
function syncNtfyLink() {
  const t = ($('#ntfy-topic')?.value || '').trim();
  const a = $('#ntfy-open');
  if (!a) return;
  a.href = t ? `https://ntfy.sh/${encodeURIComponent(t)}` : 'https://ntfy.sh/';
}

/* ---------- Fiche détaillée ---------- */
function historyChart(h) {
  if (!h || h.length < 2) return '<p class="hint">Un seul prix relevé pour l’instant : l’historique se construit à chaque passage de l’agent.</p>';
  const W = 320, H = 90, P = 8;
  const prices = h.map(p => p.price), min = Math.min(...prices), max = Math.max(...prices);
  const x = i => P + (i * (W - 2 * P)) / (h.length - 1);
  const y = v => max === min ? H / 2 : H - P - ((v - min) * (H - 2 * P)) / (max - min);
  const pts = h.map((p, i) => `${x(i)},${y(p.price)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Historique des prix">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    ${h.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.price)}" r="3.5" fill="var(--accent)"/>`).join('')}
  </svg>
  <ul>${[...h].reverse().map(p => `<li class="num">${fmtDate(p.date)} : ${fmtEur(p.price)}</li>`).join('')}</ul>`;
}

function openDetail(id) {
  const l = state.listings.find(x => x.id === id);
  if (!l) return;
  store.markSeen(id);
  const fav = store.favs.has(id);
  const facts = [
    ['Prix', fmtEur(l.price)], ['Prix au m²', fmtEur(l._ppm)],
    ['Surface habitable', `${fmtNum(l.surface, 2)} m²${l.surfaceCarrez ? ` (Carrez ${fmtNum(l.surfaceCarrez, 2)})` : ''}`],
    ['Pièces / chambres', `${l.rooms ?? '?'} / ${l.bedrooms ?? '?'}`],
    ['DPE', l.dpe ? `${l.dpe}${l.dpeKwh ? ` · ${l.dpeKwh} kWh/m²/an` : ''}` : 'Non communiqué'],
    ['GES', l.ges ? `${l.ges}${l.gesKg ? ` · ${l.gesKg} kg CO₂` : ''}` : 'Non communiqué'],
    ['Parking', parkingText(l.parking)], ['Étage', `${l.floor ?? '—'}${l.elevator === true ? ' · ascenseur' : l.elevator === false ? ' · sans ascenseur' : ''}`],
    ['Charges', l.charges ? fmtEur(l.charges) + '/an' : 'Non communiqué'], ['Taxe foncière', l.taxeFonciere ? fmtEur(l.taxeFonciere) : 'Non communiqué'],
    ['État', CONDITION_LABELS[l.condition] || 'Non précisé'], ['Construction', l.year ?? '—'],
    ['Extérieur', l.exterior || '—'], ['Quartier', l.quartier || 'Non précisé'],
    ['Détecté le', fmtDate(l.firstSeen)], ['Vérifié le', fmtDate(l.lastChecked)]
  ];
  const sheet = $('#sheet');
  sheet.innerHTML = `
    <div class="grabber"></div>
    <div class="sheet-head">
      <div><p class="eyebrow">${esc(l.source)}</p><h2 id="sheet-title">${esc(l.title)}</h2></div>
      <button class="close-btn" id="close-sheet" aria-label="Fermer">×</button>
    </div>
    <div class="meta" style="margin-top:10px">
      ${l._perfect ? '<span class="chip green">Correspond à vos critères</span>' : l._unmet.map(u => `<span class="chip amber">${esc(u)}</span>`).join('')}
      ${l.procedure ? '<span class="chip red">Procédure en copropriété</span>' : ''}
    </div>
    <div class="facts">${facts.map(([k, v], i) => `<div class="fact ${i >= facts.length - 4 && i < facts.length - 2 ? 'wide' : ''}"><span>${k}</span><b class="num">${esc(v)}</b></div>`).join('')}</div>
    ${l.parking?.detail ? `<div class="block"><h3>Stationnement</h3><p style="margin:0">${esc(l.parking.detail)}</p></div>` : ''}
    <div class="block"><h3>Note d’intérêt : ${fmtNum(l._score, 1)}/10</h3>
      ${l._parts.map(p => `<div class="bar ${p.value < 0 ? 'neg' : ''}"><span>${p.label}</span><i><em style="width:${p.max ? Math.max(0, p.value / p.max) * 100 : 100}%"></em></i><span class="num">${p.value < 0 ? '' : ''}${fmtNum(p.value, 1)}</span></div>`).join('')}
    </div>
    ${l.weaknesses?.length ? `<div class="block"><h3>Points faibles</h3><ul>${l.weaknesses.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    <div class="block history"><h3>Historique du prix</h3>${historyChart(l.priceHistory)}</div>
    <div class="block"><h3>Mes notes</h3><textarea id="note" placeholder="Visite, questions à poser, impressions…">${esc(store.notes[id] || '')}</textarea></div>
    <a class="btn primary" href="${esc(l.url)}" target="_blank" rel="noopener">Voir l’annonce originale ↗</a>
    <div class="btn-row">
      <button class="btn secondary" id="sheet-fav">${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}</button>
      <button class="btn secondary" id="sheet-unseen">Marquer non lu</button>
    </div>
  `;
  sheet.hidden = false; $('#sheet-backdrop').hidden = false;
  sheet.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  $('#close-sheet').onclick = closeSheet;
  $('#note').oninput = e => store.setNote(id, e.target.value.trim());
  $('#sheet-fav').onclick = () => { const on = store.toggleFav(id); $('#sheet-fav').textContent = on ? 'Retirer des favoris' : 'Ajouter aux favoris'; toast(on ? 'Ajouté aux favoris' : 'Retiré des favoris'); };
  $('#sheet-unseen').onclick = () => { store.unmarkSeen(id); closeSheet(); toast('Marqué comme non lu'); };
}
function closeSheet() {
  $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true;
  document.body.style.overflow = '';
  render();
}

/* ---------- Filtres ---------- */
function openFilters() {
  const f = store.filters;
  const quartiers = [...new Set(state.listings.map(l => l.quartier).filter(Boolean))].sort();
  const conds = Object.entries(CONDITION_LABELS);
  const sheet = $('#sheet');
  sheet.innerHTML = `
    <div class="grabber"></div>
    <div class="sheet-head"><h2 id="sheet-title">Filtres</h2><button class="close-btn" id="close-sheet" aria-label="Fermer">×</button></div>
    <form class="form" id="filter-form" style="margin-top:14px">
      <div class="field"><label for="f-price">Prix maximum (€)</label><input id="f-price" type="number" inputmode="numeric" placeholder="Indifférent" value="${f.priceMax ?? ''}"></div>
      <div class="row2">
        <div class="field"><label for="f-smin">Surface min</label><input id="f-smin" type="number" inputmode="numeric" value="${f.surfaceMin ?? ''}"></div>
        <div class="field"><label for="f-smax">Surface max</label><input id="f-smax" type="number" inputmode="numeric" value="${f.surfaceMax ?? ''}"></div>
      </div>
      <div class="field"><span>DPE</span><div class="pills" id="f-dpe">${['A', 'B', 'C', 'D', 'E'].map(d => `<button type="button" class="pill ${(f.dpe || []).includes(d) ? 'on' : ''}" data-v="${d}">${d}</button>`).join('')}</div></div>
      <div class="field"><label for="f-q">Quartier</label><select id="f-q"><option value="">Tous</option>${quartiers.map(q => `<option ${f.quartier === q ? 'selected' : ''}>${esc(q)}</option>`).join('')}</select></div>
      <div class="row2">
        <div class="field"><label for="f-park">Places de parking min</label><input id="f-park" type="number" inputmode="numeric" min="0" value="${f.parkingMin ?? ''}"></div>
        <div class="field"><label for="f-bed">Chambres min</label><input id="f-bed" type="number" inputmode="numeric" min="0" value="${f.bedroomsMin ?? ''}"></div>
      </div>
      <label class="switch"><span>Parking fermé ou en sous-sol uniquement</span><input type="checkbox" id="f-closed" ${f.parkingClosed ? 'checked' : ''}></label>
      <div class="field"><span>État du bien</span><div class="pills" id="f-cond">${conds.map(([k, v]) => `<button type="button" class="pill ${(f.condition || []).includes(k) ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</div></div>
      <div class="btn-row"><button type="button" class="btn secondary" id="f-reset">Effacer</button><button type="submit" class="btn primary">Appliquer</button></div>
    </form>`;
  sheet.hidden = false; $('#sheet-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#close-sheet').onclick = closeSheet;
  sheet.querySelectorAll('.pills .pill').forEach(p => p.onclick = () => p.classList.toggle('on'));
  $('#f-reset').onclick = () => { store.setFilters({}); closeSheet(); };
  $('#filter-form').onsubmit = e => {
    e.preventDefault();
    const num = id => { const v = $(id).value; return v === '' ? null : Number(v); };
    store.setFilters({
      priceMax: num('#f-price'), surfaceMin: num('#f-smin'), surfaceMax: num('#f-smax'),
      dpe: [...sheet.querySelectorAll('#f-dpe .on')].map(b => b.dataset.v),
      quartier: $('#f-q').value || null, parkingMin: num('#f-park'), bedroomsMin: num('#f-bed'),
      parkingClosed: $('#f-closed').checked,
      condition: [...sheet.querySelectorAll('#f-cond .on')].map(b => b.dataset.v)
    });
    closeSheet();
  };
}

/* ---------- Navigation et événements ---------- */
const TITLES = { dashboard: 'Tableau de bord', list: 'Annonces', favorites: 'Favoris', settings: 'Réglages' };
function render() {
  $('#page-title').textContent = TITLES[state.tab];
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  ({ dashboard: renderDashboard, list: renderList, favorites: renderFavorites, settings: renderSettings })[state.tab]();
}
function go(tab, mode) {
  state.tab = tab;
  if (mode) state.listMode = mode;
  render();
  window.scrollTo({ top: 0 });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (b) go(b.dataset.tab);
});
$('#refresh-btn').onclick = () => loadData();
$('#sheet-backdrop').onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
window.addEventListener('scroll', () => $('.topbar').classList.toggle('scrolled', scrollY > 4), { passive: true });

view.addEventListener('click', async e => {
  const fav = e.target.closest('[data-fav]');
  if (fav) { e.stopPropagation(); const on = store.toggleFav(fav.dataset.fav); toast(on ? 'Ajouté aux favoris' : 'Retiré des favoris'); render(); return; }
  const c = e.target.closest('.card[data-id]');
  if (c) return openDetail(c.dataset.id);
  const g = e.target.closest('[data-goto]');
  if (g) { const [tab, mode] = g.dataset.goto.split(':'); return go(tab, mode); }
  const m = e.target.closest('[data-mode]');
  if (m) { state.listMode = m.dataset.mode; return render(); }
  if (e.target.id === 'open-filters') return openFilters();
  const dp = e.target.closest('[data-dpe]');
  if (dp) { dp.classList.toggle('on'); return; }
  if (e.target.id === 'reset-criteria') { store.resetCriteria(); enrich(); render(); return toast('Critères d’origine rétablis'); }
  if (e.target.id === 'copy-criteria') {
    const c = store.criteria;
    const txt = JSON.stringify({ surfaceMin: c.surfaceMin, surfaceMax: c.surfaceMax, dpeAllowed: c.dpeAllowed, parkingMin: c.parkingMin, parkingMax: c.parkingMax, priceMax: c.priceMax, bedroomsMin: c.bedroomsMin, excludeWorks: c.excludeWorks, refPriceM2: c.refPriceM2, alertScore: c.alertScore }, null, 2);
    try { await navigator.clipboard.writeText(`"criteria": ${txt}`); toast('Critères copiés : collez-les dans config.json'); }
    catch { prompt('Copiez ce texte :', txt); }
    return;
  }
  if (e.target.id === 'gen-topic') {
    const t = 'bayonne-immo-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join('');
    $('#ntfy-topic').value = t; store.setPrefs({ ntfyTopic: t }); syncNtfyLink();
    return toast('Nom généré : utilisez le même dans GitHub');
  }
  if (e.target.id === 'export-btn') {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'mon-agent-immobilier-sauvegarde.json' });
    a.click(); return;
  }
  if (e.target.id === 'import-btn') {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json' });
    inp.onchange = async () => { try { store.importAll(await inp.files[0].text()); enrich(); render(); toast('Sauvegarde importée'); } catch { toast('Fichier illisible'); } };
    inp.click();
  }
});
view.addEventListener('change', e => {
  if (e.target.id === 'sort') { state.sort = e.target.value; render(); }
});
view.addEventListener('input', e => {
  if (e.target.id === 'ntfy-topic') { store.setPrefs({ ntfyTopic: e.target.value.trim() }); syncNtfyLink(); }
});
view.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card[data-id]')) { e.preventDefault(); openDetail(e.target.dataset.id); }
});
view.addEventListener('submit', e => {
  if (e.target.id !== 'criteria-form') return;
  e.preventDefault();
  const num = (id, d) => { const v = $(id).value; return v === '' ? d : Number(v); };
  store.setCriteria({
    surfaceMin: num('#c-smin', DEFAULT_CRITERIA.surfaceMin), surfaceMax: num('#c-smax', DEFAULT_CRITERIA.surfaceMax),
    dpeAllowed: [...document.querySelectorAll('#c-dpe .on')].map(b => b.dataset.dpe),
    parkingMin: num('#c-pmin', 0), parkingMax: num('#c-pmax', null), priceMax: num('#c-price', null),
    bedroomsMin: num('#c-bed', null), refPriceM2: num('#c-ref', DEFAULT_CRITERIA.refPriceM2),
    alertScore: num('#c-alert', DEFAULT_CRITERIA.alertScore), excludeWorks: $('#c-works').checked
  });
  enrich(); render(); toast('Critères enregistrés');
});

/* ---------- Démarrage ---------- */
store.touchVisit();
render();
loadData({ silent: true });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadData({ silent: true }); });
