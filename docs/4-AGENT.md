# 4. Régler l'agent automatique

Tous les réglages de l'agent sont dans `agent/config.json`. Pour le modifier : ouvrez-le dans GitHub, crayon ✏️, modifiez, **Commit changes**. Le passage suivant en tient compte.

## Comment travaille l'agent

À chaque passage :

1. **Recherche** : il lit la page de résultats Bayonne de chaque source activée et repère les liens d'annonces.
2. **Lecture** des fiches jamais vues (40 au maximum par passage) : prix, surface habitable et Carrez, pièces, chambres, DPE et GES (lettre et valeurs, la lettre est calculée si seules les valeurs figurent), parking (nombre et nature : box, garage, sous-sol, couvert, extérieur), étage, ascenseur, charges, taxe foncière, extérieur, état, année, procédure de copropriété, quartier.
3. **Tri** : il écarte ce qui n'est pas un appartement, est hors de Bayonne, déjà vendu, sans prix ou hors de la fourchette de collecte (40–85 m² par défaut, plus large que vos critères pour que vous puissiez les élargir dans l'app). Une page écartée n'est pas relue avant 30 jours.
4. **Doublons** : même surface (±1 m²), même prix (±2 %) et même DPE sur deux sites = un seul bien, l'autre lien est rattaché.
5. **Suivi** : il revisite les annonces déjà connues (30 par passage, les plus anciennes d'abord). Nouveau prix → ajouté à l'historique ; baisse → alerte. Page disparue, redirigée ou « sous compromis » → l'annonce passe en « Retirée ».
6. **Note /10 et critères** avec le même calcul que l'application.
7. **Enregistrement** dans `data/listings.json` et compte rendu dans `data/status.json`, puis alertes.

Les informations lues automatiquement sont marquées « Fiche lue automatiquement : à vérifier » : vérifiez toujours sur l'annonce d'origine avant une visite.

## Respect des sites

- L'agent s'identifie (`MonAgentImmobilier/1.0`), lit `robots.txt` avant toute page et n'ouvre jamais une page interdite.
- Il attend 2,5 secondes entre deux pages d'un même site et ne lit qu'une centaine de pages par passage.
- Si un site refuse l'accès (protection anti-robots), l'agent n'essaie pas de la contourner : la source apparaît « bloquée » dans l'app.
- SeLoger, Leboncoin, Bien'ici et les autres grands portails ne sont pas parcourus : utilisez les liens de recherche de l'app (Réglages → Rechercher à la main), ou leurs propres alertes e-mail.

## Suivre une annonce trouvée ailleurs

Ajoutez son adresse dans `watchUrls` :

```json
"watchUrls": [
  "https://www.etreproprio.com/immobilier-26275766-vente-appartement-62-m-a-bayonne-bayonne",
  "https://www.exemple-agence.fr/annonce/12345"
]
```

L'agent la lira au passage suivant puis suivra son prix, à condition que le site l'autorise.

## Mettre vos critères à jour

Les critères de l'app (Réglages) changent l'affichage immédiatement. Pour que les **alertes** suivent les mêmes critères : Réglages → **Copier pour l'agent**, puis remplacez le bloc `"criteria": { … }` de `config.json` par le texte copié.

Champs : `surfaceMin`/`surfaceMax` (m²), `dpeAllowed` (lettres acceptées), `parkingMin`/`parkingMax`, `priceMax` (null = sans plafond), `bedroomsMin`, `excludeWorks`, `refPriceM2` (prix de référence du m² à Bayonne pour juger le prix), `alertScore` (note déclenchant une alerte).

## Comment est calculée la note /10

| Composante | Points max | Principe |
| --- | --- | --- |
| DPE | 2,5 | A 2,5 · B 2,2 · C 1,6 · D 0,8 · E-G 0 · inconnu 0,5 |
| Prix au m² | 2,5 | maximum à 80 % du prix de référence ou moins, 0 à 130 % ou plus |
| Parking | 2 | nature (box/garage > sous-sol > couvert > extérieur) + bonus 2 places |
| État | 1,5 | neuf 1,5 · excellent 1,4 · bon 1,1 · à rafraîchir 0,6 · travaux 0 |
| Charges | 0,75 | au m² et par an : maximum sous 12 €, 0 au-delà de 30 € |
| Extérieur | 0,5 | terrasse, balcon, loggia ou jardin |
| Malus | — | procédure de copropriété −0,7 · surface hors critères −1 |

Le total est ramené sur 10. Le détail apparaît dans chaque fiche de l'app. Pour changer les pondérations, modifiez `js/scoring.js` (les deux côtés, app et agent, utilisent ce fichier).

## Ajouter une source

Ajoutez un bloc dans `sources` avec l'adresse de la page de résultats et le modèle des liens d'annonces (expression régulière) :

```json
{
  "id": "monagence",
  "name": "Mon agence",
  "enabled": true,
  "searchUrls": ["https://www.monagence.fr/vente/appartements/bayonne"],
  "linkPattern": "^https://www\\.monagence\\.fr/annonce/\\d+$"
}
```

Vérifiez avant que le site l'autorise (conditions d'utilisation et `https://site/robots.txt`).

## Changer les horaires

Dans `.github/workflows/agent.yml`, lignes `cron` (heure UTC : Paris = UTC+1 en hiver, UTC+2 en été). Exemple 4 recherches par jour : `'17 5,9,13,17 * * *'`. Ne descendez pas sous un passage par heure, par respect pour les sites.

## Lancer à la main

Onglet **Actions** → **Agent immobilier** → **Run workflow** : *recherche*, *resume* (résumé quotidien) ou *publier* (republie l'application sans chercher).

## Sur votre ordinateur (facultatif)

```bash
npm install
npm test                    # tests hors ligne de l'agent
npm run agent:test-reseau   # recherche réelle, n'enregistre ni n'alerte rien
npm run agent               # recherche réelle avec enregistrement
NTFY_TOPIC=votre-sujet npm run digest   # tester une alerte
npm run serve               # application sur http://localhost:8080
```
