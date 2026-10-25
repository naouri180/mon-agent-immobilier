// Lecture minimale de robots.txt (groupes User-agent, Allow/Disallow, jokers * et $).
// Règle appliquée : le motif le plus long l'emporte ; à égalité, Allow l'emporte.

export function isAllowedByRobots(robotsTxt, url, userAgent = '*') {
  if (!robotsTxt) return true;
  const groups = parse(robotsTxt);
  const ua = userAgent.toLowerCase().split('/')[0];
  const group = groups.find(g => g.agents.some(a => a !== '*' && ua.includes(a)))
    || groups.find(g => g.agents.includes('*'));
  if (!group) return true;
  const u = new URL(url);
  const path = u.pathname + u.search;
  let best = null;
  for (const rule of group.rules) {
    if (!rule.path) continue;
    if (matches(rule.path, path)) {
      if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
    }
  }
  return best ? best.allow : true;
}

function parse(txt) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const clean = line.replace(/#.*/, '').trim();
    const m = clean.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'disallow') cur.rules.push({ allow: false, path: val });
      if (key === 'allow') cur.rules.push({ allow: true, path: val });
    }
  }
  return groups;
}

function matches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + body + (anchored ? '$' : '')).test(path);
}
