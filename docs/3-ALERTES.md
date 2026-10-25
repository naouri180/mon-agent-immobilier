# 3. Recevoir les alertes sur le téléphone

L'agent envoie trois types de messages :

- **Nouvelle opportunité** : une nouvelle annonce remplit tous vos critères et atteint la note « très intéressant » (7,5/10 par défaut).
- **Baisse de prix** sur une annonce qui correspond à vos critères.
- **Résumé quotidien** vers 6h45 : les 5 meilleures annonces et le nombre de nouveautés.

## Pourquoi ntfy plutôt que les notifications de l'application ?

Depuis iOS 16.4, une application web ajoutée à l'écran d'accueil peut recevoir des notifications, mais il faut un serveur qui garde en mémoire l'abonnement de votre téléphone et signe chaque envoi. GitHub Pages ne sait héberger que des pages fixes : ce serveur n'existe pas ici. La solution retenue, gratuite et fiable, est **ntfy**, une application de notifications qui reçoit directement les messages de l'agent. L'e-mail est proposé en complément ou à la place.

## Option A — Notifications push avec ntfy (recommandé, 5 minutes)

1. Installez **ntfy** depuis l'App Store (gratuit).
2. Dans Mon Agent Immobilier : **Réglages** → *Alertes sur le téléphone* → **Générer un nom**. Notez ce nom (ex. `bayonne-immo-7f3k9q`) : il sert de mot de passe, ne le partagez pas.
3. Dans ntfy : **+** → saisissez exactement ce nom → **Subscribe**. Autorisez les notifications quand l'iPhone le demande.
4. Sur GitHub, dans votre dépôt : **Settings** → **Secrets and variables** → **Actions** → **New repository secret** :
   - Name : `NTFY_TOPIC`
   - Secret : le même nom → **Add secret**.
5. Test : **Actions** → **Agent immobilier** → **Run workflow** → **resume**. Le résumé arrive sur l'iPhone en moins d'une minute.

## Option B — Alertes par e-mail (exemple avec Gmail)

1. Activez la validation en deux étapes sur votre compte Google, puis créez un **mot de passe d'application** : https://myaccount.google.com/apppasswords (nom : « Agent immo »). Copiez les 16 caractères.
2. Sur GitHub, ajoutez ces secrets (même écran que ci-dessus) :

| Name | Valeur |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | votre adresse Gmail |
| `SMTP_PASS` | le mot de passe d'application (16 caractères, sans espaces) |
| `MAIL_TO` | l'adresse qui reçoit les alertes (facultatif : par défaut, la même) |

3. Testez avec **Run workflow** → **resume**.

Autres fournisseurs : utilisez leurs paramètres SMTP (Outlook : `smtp-mail.outlook.com`, port `587`).

## Activer ou couper les alertes

Ouvrez `agent/config.json` dans GitHub (Réglages de l'app → lien « section notifications », ou onglet Code), cliquez sur le crayon ✏️, modifiez puis **Commit changes** :

```json
"notifications": {
  "enabled": true,        // false = plus aucune alerte
  "newListing": true,     // nouvelles opportunités
  "priceDrop": true,      // baisses de prix
  "dailyDigest": true,    // résumé quotidien
  "channels": { "ntfy": true, "email": true }
}
```

(Les commentaires `//` ci-dessus sont explicatifs : ne les recopiez pas dans le fichier.)

Pour couper temporairement le son sans toucher à la configuration, mettez simplement l'abonnement en sourdine dans ntfy.
