// Tests hors ligne : extraction, robots.txt, notation, et un passage complet de l'agent
// sur des pages simulées (nouvelle annonce, doublon, baisse de prix, annonce vendue).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractListing, extractLinks, dpeFromValues } from '../lib/extract.js';
import { isAllowedByRobots } from '../lib/robots.js';
import { runAgent } from '../lib/pipeline.js';
import { buildMessages, buildDigest } from '../lib/notify.js';
import { score, isPerfectMatch, DEFAULT_CRITERIA, lastPriceChange } from '../../js/scoring.js';

const fx = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('extraction : fiche de type Foncia (DPE dans les images, biens similaires ignorés)', () => {
  const l = extractListing(fx('foncia-detail.html'), 'https://fr.foncia.com/achat/bayonne-64100/appartement/00828770.htm');
  assert.equal(l.price, 249000);
  assert.equal(l.surface, 57.31);
  assert.equal(l.dpe, 'B');
  assert.equal(l.dpeKwh, 105);
  assert.equal(l.ges, 'A');
  assert.equal(l.bedrooms, 2);
  assert.equal(l.charges, 1008);
  assert.equal(l.procedure, false);
  assert.equal(l.elevator, true);
  assert.equal(l.parking.count, 1);
  assert.equal(l.parking.type, 'couvert');
  assert.equal(l.year, 2011);
  assert.equal(l.city, 'Bayonne');
  assert.ok(l.isApartment);
  assert.equal(l.sold, false);
});

test('extraction : DPE donné seulement en valeurs (type Capifrance) → lettre calculée', () => {
  const l = extractListing(fx('capifrance-detail.html'), 'https://www.capifrance.fr/fr/immobilier/vente/appartement/bayonne/appartement-a-vendre-3-pieces-bayonne-64/117218');
  assert.equal(l.price, 225000);
  assert.equal(l.surface, 62);
  assert.equal(l.surfaceCarrez, 61.55);
  assert.equal(l.dpe, 'C');
  assert.equal(l.dpeDerived, true);
  assert.equal(l.ges, 'C');
  assert.equal(l.parking.count, 1);
  assert.equal(l.parking.type, 'souterrain');
  assert.equal(l.taxeFonciere, 877);
  assert.equal(l.charges, 1000);
  assert.equal(l.quartier, 'Habas La Plaine');
  assert.equal(l.condition, 'excellent');
});

test('extraction : fiche de type ParuVendu (surface erronée « 1 m² » dans le titre)', () => {
  const l = extractListing(fx('paruvendu-detail.html'), 'https://www.paruvendu.fr/immobilier/vente/appartement/1295247715A1KIVHAP000');
  assert.equal(l.price, 325000);
  assert.equal(l.surface, 60);
  assert.equal(l.dpe, 'B');
  assert.equal(l.dpeKwh, 31);
  assert.equal(l.parking.count, 2, 'double place, le parking visiteur ne compte pas');
  assert.equal(l.parking.type, 'box');
  assert.equal(l.charges, 881);
  assert.equal(l.taxeFonciere, 1360);
  assert.equal(l.procedure, false);
  assert.equal(l.bedrooms, 2);
  assert.equal(l.quartier, 'Arrousets');
  assert.equal(l.year, 2022);
});

test('extraction : annonce sous compromis repérée', () => {
  const l = extractListing(fx('sold-detail.html'), 'https://www.capifrance.fr/fr/immobilier/vente/appartement/bayonne/t3/448818');
  assert.equal(l.sold, true);
});

test('liens : seules les fiches appartement du bon site sont gardées, sans doublon', () => {
  const links = extractLinks(fx('foncia-search.html'), 'https://fr.foncia.com/achat/bayonne-64100/appartement',
    '^https://fr\\.foncia\\.com/achat/bayonne-64100/appartement/\\d+\\.htm$');
  assert.deepEqual(links.sort(), [
    'https://fr.foncia.com/achat/bayonne-64100/appartement/00828770.htm',
    'https://fr.foncia.com/achat/bayonne-64100/appartement/00999999.htm'
  ]);
});

test('DPE : seuils 2021, la plus défavorable des deux étiquettes', () => {
  assert.equal(dpeFromValues(62, 10), 'B');
  assert.equal(dpeFromValues(105, 3), 'B');
  assert.equal(dpeFromValues(60, 40), 'D');
  assert.equal(dpeFromValues(190, null), 'D');
});

test('robots.txt : règles respectées', () => {
  const r = 'User-agent: *\nDisallow: /recherche\nAllow: /recherche/public\nDisallow: /*?q=\n\nUser-agent: BadBot\nDisallow: /';
  assert.equal(isAllowedByRobots(r, 'https://x.fr/annonce/1', 'MonAgentImmobilier/1.0'), true);
  assert.equal(isAllowedByRobots(r, 'https://x.fr/recherche?a=1', 'MonAgentImmobilier/1.0'), false);
  assert.equal(isAllowedByRobots(r, 'https://x.fr/recherche/public/1', 'MonAgentImmobilier/1.0'), true);
  assert.equal(isAllowedByRobots(r, 'https://x.fr/liste?q=bayonne', 'MonAgentImmobilier/1.0'), false);
  assert.equal(isAllowedByRobots('User-agent: *\nDisallow: /', 'https://x.fr/a', 'MonAgentImmobilier/1.0'), false);
});

test('notation : les biens de la recherche initiale sont classés de façon cohérente', () => {
  const data = JSON.parse(readFileSync(new URL('../../data/listings.json', import.meta.url), 'utf8'));
  for (const l of data.listings) {
    const s = score(l, DEFAULT_CRITERIA);
    assert.ok(s >= 0 && s <= 10, `${l.id} : ${s}`);
    assert.ok(isPerfectMatch(l, DEFAULT_CRITERIA), `${l.id} devrait correspondre aux critères`);
  }
  const by = id => score(data.listings.find(l => l.id === id), DEFAULT_CRITERIA);
  assert.ok(by('capifrance-117218') > by('fnaim-53014705'), 'moins cher au m² et meilleur état devant');
  assert.equal(isPerfectMatch({ ...data.listings[0], dpe: 'E' }, DEFAULT_CRITERIA), false);
  assert.equal(isPerfectMatch({ ...data.listings[0], parking: { count: 0 } }, DEFAULT_CRITERIA), false);
});

test('agent complet : nouvelle annonce, doublon inter-sites, baisse de prix, vente, robots', async () => {
  const today = '2026-10-26';
  const foncia = fx('foncia-detail.html');
  const pages = {
    'https://fr.foncia.com/achat/bayonne-64100/appartement': fx('foncia-search.html'),
    // l'annonce déjà connue revient avec un prix en baisse
    'https://fr.foncia.com/achat/bayonne-64100/appartement/00828770.htm': foncia.replaceAll('249000', '239000').replace('249&nbsp;000', '239&nbsp;000'),
    // nouvelle annonce : le bien ParuVendu, publié aussi chez Foncia (doublon)
    'https://fr.foncia.com/achat/bayonne-64100/appartement/00999999.htm': fx('paruvendu-detail.html'),
    'https://www.paruvendu.fr/immobilier/vente/appartement/bayonne-64100/': '<a href="/immobilier/vente/appartement/1295247715A1KIVHAP000">x</a>',
    'https://www.paruvendu.fr/immobilier/vente/appartement/1295247715A1KIVHAP000': fx('paruvendu-detail.html'),
    'https://www.capifrance.fr/fr/immobilier/vente/appartement/bayonne/t3/448818': fx('sold-detail.html')
  };
  const http = { get: async url => url.startsWith('https://www.fnaim.fr')
    ? { ok: false, status: 0, url, reason: 'interdit par robots.txt' }
    : pages[url] ? { ok: true, status: 200, url, html: pages[url] } : { ok: false, status: 404, url, reason: 'HTTP 404' } };

  const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
  config.watchUrls = [];
  config.sources = config.sources.filter(s => ['foncia', 'paruvendu', 'fnaim'].includes(s.id));
  config.limits.delayBetweenRequestsMs = 0;
  const data = { listings: [
    { id: 'foncia-00828770', source: 'Foncia', url: 'https://fr.foncia.com/achat/bayonne-64100/appartement/00828770.htm', city: 'Bayonne',
      price: 249000, surface: 57.31, bedrooms: 2, dpe: 'B', parking: { count: 1, type: 'couvert' }, condition: 'bon', exterior: 'Terrasse',
      status: 'active', firstSeen: '2026-10-25', lastChecked: '2026-10-25', priceHistory: [{ date: '2026-10-25', price: 249000 }] },
    { id: 'capifrance-448818', source: 'Capifrance', url: 'https://www.capifrance.fr/fr/immobilier/vente/appartement/bayonne/t3/448818', city: 'Bayonne',
      price: 275000, surface: 67, dpe: 'B', parking: { count: 1, type: 'souterrain' }, status: 'active', firstSeen: '2026-10-20', lastChecked: '2026-10-20',
      priceHistory: [{ date: '2026-10-20', price: 275000 }] }
  ] };

  const out = await runAgent({ config, data, ignored: {}, http, today, nowIso: today + 'T06:17:00Z' });
  const L = out.data.listings;

  assert.equal(out.events.added.length, 1, 'une seule nouvelle annonce, le doublon est fusionné');
  assert.equal(out.status.stats.duplicates, 1);
  const added = out.events.added[0];
  assert.ok(added.altUrls?.length === 1, 'l’URL du doublon est rattachée');
  assert.equal(added.verified, false);

  const known = L.find(l => l.id === 'foncia-00828770');
  assert.equal(known.price, 239000);
  assert.deepEqual(known.priceHistory.map(p => p.price), [249000, 239000]);
  assert.equal(out.events.drops.length, 1);
  assert.equal(lastPriceChange(known).diff, -10000);

  assert.equal(L.find(l => l.id === 'capifrance-448818').status, 'sold');
  assert.ok(out.status.sources.find(s => s.name === 'FNAIM').result.startsWith('bloquée'));
  assert.ok(!L.some(l => '_score' in l), 'les champs calculés ne sont pas enregistrés');

  // Deuxième passage le même jour : rien de nouveau, pas de doublon recréé
  const again = await runAgent({ config, data: out.data, ignored: out.ignored, http, today, nowIso: today + 'T11:17:00Z' });
  assert.equal(again.events.added.length, 0);
  assert.equal(again.data.listings.length, L.length);

  const msgs = buildMessages({ hot: out.events.hot, drops: out.events.drops }, { appUrl: 'https://moi.github.io/app/' });
  assert.ok(msgs.some(m => m.title.startsWith('Baisse de prix')));
  const digest = buildDigest(out.decorated.filter(l => l.status === 'active'), { appUrl: 'https://moi.github.io/app/' });
  assert.match(digest.body, /correspondent/);
});
