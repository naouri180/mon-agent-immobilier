// Notifications : push via ntfy (application gratuite iPhone/Android) et e-mail via SMTP.
// Tous les identifiants viennent de variables d'environnement (secrets GitHub), jamais du code.

const fmt = n => new Intl.NumberFormat('fr-FR').format(n);

function lineFor(l) {
  const park = l.parking?.count ? `${l.parking.count} pl.` : 'parking ?';
  return `${fmt(l.price)} € · ${l.surface} m² · DPE ${l.dpe || '?'} · ${park} · ${String(l._score).replace(".", ",")}/10`;
}

export function buildMessages(events, { appUrl }) {
  const msgs = [];
  for (const l of events.hot) {
    msgs.push({
      title: `Nouvelle opportunité : ${l.city && l.city !== 'Bayonne' ? l.city : (l.quartier || 'Bayonne')} (${String(l._score).replace(".", ",")}/10)`,
      body: `${lineFor(l)}\n${l.title || ''}`, url: l.url, tags: ['house', 'sparkles'], priority: 4
    });
  }
  for (const { listing: l, change } of events.drops) {
    const pct = Math.round((change.diff / change.from) * 1000) / 10;
    msgs.push({
      title: `Baisse de prix ${pct} % : ${l.city && l.city !== 'Bayonne' ? l.city : (l.quartier || 'Bayonne')}`,
      body: `${fmt(change.from)} € → ${fmt(change.to)} €\n${lineFor(l)}`, url: l.url, tags: ['chart_with_downwards_trend'], priority: 4
    });
  }
  return msgs.map(m => ({ ...m, appUrl }));
}

export function buildDigest(listings, { appUrl, sinceHours = 24 }) {
  const since = Date.now() - sinceHours * 3600e3;
  const top = listings.filter(l => l._perfect).sort((a, b) => b._score - a._score).slice(0, 5);
  const fresh = listings.filter(l => new Date(l.firstSeen).getTime() >= since - 86400e3 / 2);
  const lines = [
    `${top.length} bien(s) correspondent à vos critères. Les meilleurs :`,
    ...top.map((l, i) => `${i + 1}. ${lineFor(l)}${l.city && l.city !== 'Bayonne' ? ' · ' + l.city : (l.quartier ? ' · ' + l.quartier : '')}\n   ${l.url}`),
    '',
    fresh.length ? `${fresh.length} nouvelle(s) annonce(s) depuis hier.` : 'Pas de nouvelle annonce depuis hier.',
    appUrl ? `\nOuvrir l'application : ${appUrl}` : ''
  ];
  return { title: 'Résumé quotidien – Mon Agent Immobilier', body: lines.join('\n'), url: appUrl, tags: ['newspaper'], priority: 3 };
}

async function sendNtfy(msg, env) {
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
  const r = await fetch(server, {
    method: 'POST', headers,
    body: JSON.stringify({
      topic: env.NTFY_TOPIC, title: msg.title, message: msg.body, tags: msg.tags, priority: msg.priority,
      click: msg.url || msg.appUrl || undefined,
      actions: msg.appUrl ? [{ action: 'view', label: 'Ouvrir l’app', url: msg.appUrl }] : undefined
    })
  });
  if (!r.ok) throw new Error('ntfy HTTP ' + r.status);
}

async function sendEmail(msgs, env, subject) {
  const { default: nodemailer } = await import('nodemailer');
  const t = nodemailer.createTransport({
    host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 465), secure: Number(env.SMTP_PORT || 465) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
  const text = msgs.map(m => `${m.title}\n${m.body}${m.url ? '\n' + m.url : ''}`).join('\n\n———\n\n');
  await t.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to: env.MAIL_TO || env.SMTP_USER, subject, text });
}

/** Envoie les messages sur les canaux configurés. Renvoie un compte rendu lisible. */
export async function deliver(msgs, { config, env, subject, log = console.log }) {
  const n = config.notifications || {};
  const report = [];
  if (!msgs.length) return report;
  if (!n.enabled) { report.push('alertes désactivées dans config.json'); return report; }

  if (n.channels?.ntfy) {
    if (!env.NTFY_TOPIC) report.push('ntfy non configuré (secret NTFY_TOPIC absent)');
    else {
      let ok = 0;
      for (const m of msgs) { try { await sendNtfy(m, env); ok++; } catch (e) { log('ntfy : ' + e.message); } }
      report.push(`ntfy : ${ok}/${msgs.length} envoyée(s)`);
    }
  }
  if (n.channels?.email) {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) report.push('e-mail non configuré (secrets SMTP absents)');
    else {
      try { await sendEmail(msgs, env, subject); report.push('e-mail envoyé'); }
      catch (e) { report.push('e-mail en échec : ' + e.message); }
    }
  }
  return report;
}
