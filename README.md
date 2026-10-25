# Mon Agent Immobilier

Application personnelle (PWA installable sur iPhone) + agent automatique qui recherche, vérifie, note et suit les appartements à vendre à Bayonne, et vous alerte sur votre téléphone.

Tout fonctionne **gratuitement** avec un compte GitHub : GitHub Pages héberge l'application, GitHub Actions fait tourner l'agent 3 fois par jour, et la base de données est un fichier JSON enregistré dans le dépôt à chaque passage.

## Ce qu'il faut faire, dans l'ordre

1. **Mettre en ligne** (≈ 15 min, sans rien installer) → [docs/1-MISE-EN-LIGNE.md](docs/1-MISE-EN-LIGNE.md)
2. **Installer sur l'iPhone** (2 min) → [docs/2-IPHONE.md](docs/2-IPHONE.md)
3. **Activer les alertes** ntfy et/ou e-mail (10 min) → [docs/3-ALERTES.md](docs/3-ALERTES.md)
4. **Régler l'agent** (critères, sources, horaires) → [docs/4-AGENT.md](docs/4-AGENT.md)

## Ce qui marche, et ce qui reste à configurer

| Fonction | État |
| --- | --- |
| Application iPhone : tableau de bord, liste, filtres (prix, surface, DPE, quartier, parking, chambres, état), tri, fiche détaillée, note /10 expliquée, favoris, biens consultés, notes perso, historique des prix, mode sombre, hors connexion | **Opérationnel** dès la mise en ligne |
| Modification des critères dans l'app (notes et « Correspond » recalculés aussitôt) | **Opérationnel** |
| 8 annonces vérifiées de la recherche du 25/10/2026 préchargées | **Opérationnel** |
| Agent : recherche sur Foncia, ParuVendu, FNAIM, Capifrance + suivi d'URL ajoutées à la main, dédoublonnage, vérification des critères, détection des baisses de prix et des ventes, base de données | **Code prêt et testé hors ligne**. Fonctionne dès la mise en ligne sur GitHub ; chaque site peut toutefois refuser l'accès (voir ci-dessous) |
| Planification 3 fois par jour + résumé quotidien | **Actif automatiquement** une fois le dépôt GitHub créé |
| Notifications push (application ntfy) | **À configurer** : 1 secret GitHub (`NTFY_TOPIC`) |
| Alertes e-mail | **À configurer** : 4 secrets SMTP (ex. Gmail + mot de passe d'application) |
| SeLoger, Leboncoin, Bien'ici, Logic-Immo, PAP, Figaro, Green-Acres | **Non parcourus automatiquement** (leurs conditions ou protections l'interdisent). L'app fournit des liens de recherche prêts à l'emploi, et vous pouvez faire suivre n'importe quelle annonce trouvée chez eux en collant son URL dans `watchUrls` |

**Point de vigilance honnête.** Le code d'extraction a été testé sur des pages reproduisant la structure réelle des sites, mais pas sur les sites en direct (mon environnement de travail n'y a pas accès). L'agent respecte `robots.txt` et s'arrête si un site refuse l'accès ; le résultat par source s'affiche dans l'app (Réglages → Agent automatique) après chaque passage. Après le premier passage, regardez ce bloc : une source « bloquée » ne produira rien, et c'est normal.

## Architecture

```
mon-agent-immobilier/
├── index.html, css/, js/app.js     ← Interface (PWA)
├── js/store.js                     ← Stockage local : favoris, consultés, notes, critères (sur le téléphone)
├── js/scoring.js                   ← Notation /10 et vérification des critères (partagé app + agent)
├── manifest.webmanifest, sw.js, icons/  ← Installation iPhone et mode hors connexion
├── data/listings.json              ← Base de données des annonces (écrite par l'agent)
├── data/status.json                ← Compte rendu du dernier passage
├── agent/run.js                    ← Moteur de recherche (point d'entrée)
├── agent/lib/extract.js            ← Lecture des fiches (prix, surface, DPE, parking…)
├── agent/lib/pipeline.js           ← Recherche → vérification → doublons → prix → événements
├── agent/lib/http.js, robots.js    ← Accès réseau poli, respect de robots.txt
├── agent/lib/notify.js             ← Notifications (ntfy, e-mail)
├── agent/config.json               ← Vos réglages d'agent
└── .github/workflows/agent.yml     ← Planificateur + publication du site
```

## Essayer sur l'ordinateur (facultatif)

Avec Node.js 20 ou plus : `npm install`, puis `npm run serve` et ouvrez http://localhost:8080. `npm test` lance les tests de l'agent, `npm run agent:test-reseau` fait une recherche réelle sans rien enregistrer.

## Confidentialité

Le dépôt GitHub doit être **public** pour bénéficier de GitHub Pages gratuitement : la liste des annonces (informations publiques) y est donc visible. Vos favoris, notes et critères restent sur votre téléphone, et vos identifiants (ntfy, e-mail) sont des **secrets GitHub** chiffrés, jamais écrits dans le code.
