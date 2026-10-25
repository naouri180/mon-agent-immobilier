# 1. Mettre l'application en ligne (gratuit, ≈ 15 minutes)

Tout se fait dans le navigateur, sans rien installer. Résultat : une adresse du type `https://VOTRE-PSEUDO.github.io/mon-agent-immobilier/` accessible même ordinateur éteint, et un agent qui tourne tout seul.

## Étape 1 — Créer un compte GitHub

Allez sur https://github.com/signup et créez un compte gratuit. Votre **pseudo** fera partie de l'adresse de l'application.

## Étape 2 — Créer le dépôt

1. En haut à droite : **+** → **New repository**.
2. Repository name : `mon-agent-immobilier`.
3. Cochez **Public** (obligatoire pour GitHub Pages gratuit).
4. Ne cochez rien d'autre, puis **Create repository**.

## Étape 3 — Envoyer les fichiers

1. Décompressez l'archive ZIP sur votre ordinateur.
2. Sur la page du dépôt vide, cliquez sur le lien **uploading an existing file**.
3. Ouvrez le dossier `mon-agent-immobilier` décompressé, sélectionnez **tout son contenu** (pas le dossier lui-même) et glissez-le dans la page.
4. En bas, **Commit changes**.

**Important : le dossier `.github` est caché.** Sur Mac, affichez-le dans le Finder avec `Cmd + Maj + .` avant de sélectionner ; sur Windows, Explorateur → Affichage → Éléments masqués. Vérifiez ensuite que le dépôt contient bien `.github/workflows/agent.yml`. S'il manque :
1. **Add file** → **Create new file**.
2. Nom du fichier : `.github/workflows/agent.yml` (tapez les `/`, GitHub crée les dossiers).
3. Collez le contenu du fichier `agent.yml` de l'archive (ouvrez-le avec un éditeur de texte), puis **Commit changes**.

## Étape 4 — Autoriser l'agent à enregistrer ses résultats

**Settings** (onglet du dépôt) → **Actions** → **General** → section *Workflow permissions* → cochez **Read and write permissions** → **Save**.

## Étape 5 — Activer la publication du site

**Settings** → **Pages** → *Build and deployment* → Source : **GitHub Actions**.

## Étape 6 — Premier lancement

1. Onglet **Actions**. Si GitHub demande de confirmer l'activation des workflows, acceptez.
2. À gauche : **Agent immobilier** → bouton **Run workflow** → Que faire ? **publier** → **Run workflow**.
3. Attendez la coche verte (1 à 2 minutes). Cliquez sur l'exécution : le lien de l'application apparaît dans la case *deploy*.
4. Relancez ensuite **Run workflow** avec **recherche** : c'est le premier vrai passage de l'agent.

Votre application est à : `https://VOTRE-PSEUDO.github.io/mon-agent-immobilier/`

## Ensuite, tout est automatique

- Recherches à 6h17, 11h17 et 16h17 (heure de Paris en hiver ; une heure plus tard en été). GitHub peut les décaler de quelques minutes.
- Résumé quotidien vers 6h45.
- Chaque passage enregistre la base de données dans le dépôt (onglet **Code** → `data/listings.json`) puis republie l'application.

## Si quelque chose ne marche pas

- **Croix rouge dans Actions** : cliquez dessus, ouvrez l'étape en rouge ; le message est en français pour l'agent. Erreur sur *deploy* : refaites l'étape 5. Erreur « Permission denied » à l'enregistrement : refaites l'étape 4.
- **Page 404** juste après la première publication : attendez 2 minutes et rechargez.
- **GitHub a désactivé les recherches planifiées** (après 60 jours sans activité, ce qui ne devrait pas arriver puisque l'agent enregistre régulièrement) : Actions → Agent immobilier → **Enable workflow**.
- **Coût** : rien. Un dépôt public dispose de minutes GitHub Actions gratuites ; un passage de l'agent dure 2 à 5 minutes.
