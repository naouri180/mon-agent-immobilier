#!/usr/bin/env node
// Point d'entrée de l'agent.
//   node agent/run.js            → recherche + alertes
//   node agent/run.js --digest   → résumé quotidien uniquement
//   node agent/run.js --dry-run  → recherche sans écrire ni notifier (pour tester)
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadJson, saveJson } from './lib/db.js';
import { createHttp } from './lib/http.js';
import { runAgent, decorate } from './lib/pipeline.js';
import { buildMessages, buildDigest, deliver } from './lib/notify.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  config: join(root, 'agent/config.json'),
  listings: join(root, 'data/listings.json'),
  ignored: join(root, 'data/ignored.json'),
  status: join(root, 'data/status.json')
};
const args = new Set(process.argv.slice(2));
const env = process.env;

function appUrl() {
  if (env.APP_URL) return env.APP_URL;
  const repo = env.GITHUB_REPOSITORY;           // « propriétaire/dépôt », fourni par GitHub Actions
  if (!repo) return null;
  const [owner, name] = repo.split('/');
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${name}/` : `https://${owner}.github.io/${name}/`;
}

function parisDate(d = new Date()) {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ
}

async function main() {
  const config = await loadJson(P.config, null);
  if (!config) throw new Error('agent/config.json introuvable ou invalide');
  const data = await loadJson(P.listings, { listings: [] });

  if (args.has('--digest')) {
    if (!config.notifications?.dailyDigest) return console.log('Résumé quotidien désactivé dans config.json');
    const active = decorate(data.listings.filter(l => l.status === 'active' && !l.duplicateOf), config.criteria);
    const digest = buildDigest(active, { appUrl: appUrl() });
    const report = await deliver([{ ...digest, appUrl: appUrl() }], { config, env, subject: digest.title });
    console.log(digest.body + '\n\n' + (report.join(' · ') || 'rien à envoyer'));
    return;
  }

  const ignored = await loadJson(P.ignored, {});
  const http = createHttp({
    userAgent: config.userAgent, delayMs: config.limits?.delayBetweenRequestsMs, timeoutMs: config.limits?.timeoutMs
  });
  const out = await runAgent({ config, data, ignored, http, today: parisDate(), nowIso: new Date().toISOString(), log: console.log });
  console.log(out.status.message);
  for (const s of out.status.sources) console.log(`  · ${s.name} : ${s.result}`);

  if (args.has('--dry-run')) {
    console.log('\n(--dry-run) Nouvelles :', out.events.added.map(l => `${l.price} € ${l.surface} m² ${l.dpe} ${l.url}`));
    return;
  }

  const msgs = config.notifications?.enabled === false ? [] : buildMessages({
    hot: config.notifications?.newListing === false ? [] : out.events.hot,
    drops: config.notifications?.priceDrop === false ? [] : out.events.drops
  }, { appUrl: appUrl() });
  const report = await deliver(msgs, { config, env, subject: `Mon Agent Immobilier : ${msgs.length} alerte(s)` });
  if (report.length) { out.status.notifications = report; console.log('Alertes : ' + report.join(' · ')); }

  await saveJson(P.listings, out.data);
  await saveJson(P.ignored, out.ignored);
  await saveJson(P.status, out.status);
}

main().catch(e => { console.error('Échec de l’agent :', e); process.exit(1); });
