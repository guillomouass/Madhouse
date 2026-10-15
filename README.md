# MADHOUSE — site de préinscription

Landing page d'une seule page pour **MADHOUSE** (house parties étudiantes, Penang), avec un formulaire de préinscription réservé aux étudiants USM et enregistré dans un **Google Sheet privé** via **Google Apps Script**.

- Frontend : HTML / CSS / JavaScript sans framework, hébergé gratuitement sur **GitHub Pages**.
- Backend : **Google Apps Script** (gratuit), rattaché au Google Sheet.
- Aucun traceur, aucun cookie, aucune police ou ressource tierce chargée par le site.

> ⚠️ **État actuel : pas encore prêt pour une publication publique.** Il reste des actions obligatoires de votre part, listées dans la section [Avant la mise en ligne](#avant-la-mise-en-ligne--checklist).

---

## A. Organisation du dossier

```
MADHOUSE/
├── index.html              Page principale (hero, concept, expérience, formulaire, footer)
├── privacy.html            Notice de confidentialité
├── style.css               Styles (variables de couleurs et polices en haut du fichier)
├── script.js               Animations + formulaire  ← CONFIG.ENDPOINT_URL à renseigner
├── README.md               Ce fichier
├── .gitignore
├── assets/
│   ├── logo.png            Logo officiel (source, non modifié)
│   ├── flyer-1.jpg … flyer-4.jpg   Flyers officiels (sources)
│   ├── logo-web.webp       Logo redimensionné à 480 px pour le web (généré)
│   ├── flyer-1.webp …      Flyers 800 px pour le web (générés)
│   ├── favicon-32.png, icon-180.png   Icônes (générées depuis le logo)
│   ├── og-image.jpg        Image de partage réseaux sociaux 1200×630 (générée)
│   ├── palm.svg            Silhouette de palmes (vert #06301C)
│   └── fonts/              Anton, Barlow Condensed 700, Barlow 400/500/700 (woff2) + licences OFL
├── google-apps-script/
│   └── Code.gs             Backend à copier dans Apps Script
└── tools/
    └── build-images.py     Régénère les fichiers « générés » ci-dessus
```

**Pourquoi des fichiers `.webp` en plus des originaux ?** `logo.png` pèse 1,2 Mo et chaque flyer ~400 Ko : trop lourd pour un téléphone en 4G. Le site affiche des copies **redimensionnées proportionnellement** (aucune déformation, aucun filtre, aucune modification de couleur). Les originaux restent dans `assets/`.

**Si vous remplacez le logo ou un flyer** par un fichier original (même nom), relancez :

```bash
python3 tools/build-images.py
```

(nécessite Pillow : `pip3 install Pillow`).

**Polices** : les fichiers woff2 viennent de Google Fonts (fonts.gstatic.com), sous licence **SIL Open Font License 1.1** (copie dans `assets/fonts/OFL-*.txt`) : usage commercial et auto-hébergement autorisés. Seul le sous-ensemble « latin » est inclus (les noms saisis dans d'autres alphabets s'affichent avec la police système, sans problème).

---

## B. Préparer le Google Sheet

1. Allez sur <https://sheets.google.com> avec le compte Google qui gérera les inscriptions.
2. Créez une **feuille vierge**. Nommez-la par ex. `MADHOUSE – Préinscriptions`.
3. **Ne créez pas l'onglet à la main** : le script le fera pour vous (étape C.4) avec les bonnes colonnes. Si vous préférez le faire à la main : renommez l'onglet `MADHOUSE_REGISTRATIONS` et écrivez en ligne 1, de A à J :

   | A | B | C | D | E | F | G | H | I | J |
   |---|---|---|---|---|---|---|---|---|---|
   | Registration ID | Registration Date | First Name | Last Name | Student Email | Phone Number | USM Student ID | Campus | Consent | Registration Status |

4. **Accès privés** : bouton **Partager** (en haut à droite) →
   - « Accès général » doit être **Limité** (jamais « Tous les utilisateurs disposant du lien »).
   - Ajoutez uniquement les organisateurs qui en ont besoin, de préférence en **Lecteur**.
5. Fuseau horaire : **Fichier → Paramètres → Fuseau horaire** → `(GMT+08:00) Kuala Lumpur`.

> Le site n'a **jamais** accès au Sheet. Seul le script, exécuté sous votre compte, peut y écrire. Il n'existe aucune route pour lire les inscriptions depuis Internet.

---

## C. Installer Google Apps Script

1. Dans le Google Sheet : menu **Extensions → Apps Script**. Un éditeur s'ouvre (projet rattaché au Sheet).
2. Supprimez le contenu de `Code.gs`, puis **copiez-collez tout** le fichier `google-apps-script/Code.gs` de ce projet. Cliquez sur 💾 **Enregistrer**.
3. **Paramètres** (en haut de `Code.gs`, section « PARAMÈTRES ») — vérifiez :
   - `ALLOWED_EMAIL_DOMAINS = ['student.usm.my']` → domaine des e-mails étudiants USM. **À confirmer** (voir [limites](#k-limites-connues)). Doit être identique à `ALLOWED_EMAIL_DOMAINS` dans `script.js`.
   - `REGISTRATION_OPEN = true` → mettez `false` pour fermer les inscriptions.
   - `MAX_SUBMISSIONS_PER_MINUTE = 30` → limite anti-abus globale.
   - Rien d'autre à renseigner : **aucun secret, aucune clé**.
4. **Créer l'onglet** : dans la barre d'outils, choisissez la fonction **`setupSheet`** dans la liste déroulante, puis **Exécuter**.
   - Google demande l'autorisation : **Examiner les autorisations** → choisissez votre compte → si « Google n'a pas validé cette application » s'affiche : **Paramètres avancés → Accéder à … (non sécurisé)** (c'est votre propre script) → **Autoriser**. La permission demandée est « voir, modifier… vos feuilles de calcul » : nécessaire pour écrire les lignes.
   - Le **Journal d'exécution** doit afficher : `OK: tab "MADHOUSE_REGISTRATIONS" ready. Registrations stored: 0. Registration open: true.`
5. Fuseau du script : ⚙️ **Paramètres du projet** → Fuseau horaire `(GMT+08:00) Kuala Lumpur`. Vérifiez aussi que **« Activer l'environnement d'exécution Chrome V8 »** est coché (nécessaire au script).
6. **Déployer** : bouton bleu **Déployer → Nouveau déploiement** →
   - ⚙️ « Sélectionner le type » → **Application Web**.
   - Description : `MADHOUSE v1`.
   - **Exécuter en tant que : Moi** (votre compte — c'est ce qui permet d'écrire dans le Sheet privé).
   - **Qui peut accéder : Tout le monde** (obligatoire : les étudiants n'ont pas de compte Google lié ; « Tout le monde » permet seulement d'*envoyer* une inscription au script, pas de lire le Sheet).
   - **Déployer**, autorisez si demandé.
7. **Copiez l'URL de l'application Web**. Elle a la forme `https://script.google.com/macros/s/AKfy…/exec` (elle se termine par **`/exec`**, pas `/dev`).
8. Test rapide : ouvrez cette URL dans un navigateur. Vous devez voir :
   `{"ok":true,"service":"madhouse-preregistration","open":true}`

### Si le formulaire affiche « Something went wrong on our side »

Le script répond mais n'arrive pas à écrire dans le Sheet. Ouvrez Apps Script → **Exécutions** (menu de gauche) : l'erreur exacte s'y affiche. Causes habituelles :

- **Le projet n'est pas rattaché au Sheet** (créé depuis script.google.com, nom « Projet sans titre »). Solution : ouvrez le Sheet, copiez son ID (dans l'URL : `docs.google.com/spreadsheets/d/<ID>/edit`) et collez-le dans `var SPREADSHEET_ID = '';` **dans l'éditeur Apps Script uniquement** (pas dans le dépôt GitHub). Ou recréez le script via **Extensions → Apps Script**.
- **`setupSheet` n'a pas été exécutée** : l'onglet `MADHOUSE_REGISTRATIONS` n'existe pas.
- **Le déploiement n'utilise pas la dernière version** : Déployer → Gérer les déploiements → ✏️ → Nouvelle version.

### Mettre à jour le backend plus tard

Après toute modification de `Code.gs` : **Déployer → Gérer les déploiements** → ✏️ (crayon) sur le déploiement existant → Version : **Nouvelle version** → **Déployer**.
➡️ L'URL **reste la même** : rien à changer dans le site. (Si vous faites « Nouveau déploiement », vous obtenez une **nouvelle URL** qu'il faudra recopier dans `script.js`.)

---

## D. Connecter le site au backend

Ouvrez `script.js` ; tout en haut :

```js
const CONFIG = {
  ENDPOINT_URL: '',                          // ← collez ici l'URL /exec de l'étape C.7
  ALLOWED_EMAIL_DOMAINS: ['student.usm.my'], // ← identique à Code.gs
  REQUEST_TIMEOUT_MS: 20000,
};
```

Exemple : `ENDPOINT_URL: 'https://script.google.com/macros/s/AKfy…/exec',`

Cette URL n'est **pas un secret** (elle est forcément visible dans le code public) : elle permet seulement d'envoyer une préinscription, qui est revalidée par le serveur.

Tant que `ENDPOINT_URL` est vide, le formulaire affiche « Pre-registration isn't open yet » et **n'envoie rien** (aucune fausse confirmation).

### Comment fonctionne l'envoi (et pourquoi)

GitHub Pages est statique : il ne peut pas écrire dans Google Sheets. Le navigateur envoie donc les données à Apps Script :

- `fetch` en **POST** avec `Content-Type: text/plain` → requête « simple » : **pas de pré-requête CORS** (Apps Script ne sait pas y répondre).
- Apps Script répond par une **redirection 302** vers `script.googleusercontent.com`, qui renvoie le JSON avec `Access-Control-Allow-Origin: *`. Le navigateur suit la redirection et **peut lire la réponse**.
- Le site n'affiche « YOU'RE ON THE LIST! » **que si** le serveur répond `{ ok: true }` **après** avoir écrit la ligne (`SpreadsheetApp.flush()`).
- **Pas de `no-cors`** : ce mode rendrait la réponse illisible et obligerait à afficher une confirmation sans preuve.

---

## E. Tester une préinscription de bout en bout

N'utilisez **jamais** les données d'un vrai étudiant pour tester. Utilisez par ex. :

| Champ | Valeur de test |
|---|---|
| First name | `Test` |
| Last name | `Madhouse` |
| Email | `test.madhouse1@student.usm.my` (adresse fictive) |
| Phone | `+60 12 000 0001` |
| Student ID | `TEST0001` |
| Campus | `Main Campus (Penang)` |
| Consent | coché |

1. En local (avant GitHub Pages) : dans le dossier du projet, lancez
   ```bash
   python3 -m http.server 8000
   ```
   puis ouvrez <http://localhost:8000>.
2. Remplissez le formulaire avec les valeurs ci-dessus (attendez quelques secondes : un envoi en moins de 2 s est refusé comme robot).
3. Cliquez **REGISTER MY INTEREST** → le bouton passe à « Sending… » → « YOU'RE ON THE LIST! » s'affiche.

## F. Vérifier la ligne dans Google Sheets

Ouvrez l'onglet `MADHOUSE_REGISTRATIONS` : une nouvelle ligne contient `MH-XXXXXXXXXX`, la date, les valeurs, `YES`, `PRE-REGISTERED`. Le téléphone doit apparaître avec son `+` et l'ID étudiant avec ses éventuels zéros initiaux.

Ensuite **supprimez les lignes de test** (clic droit sur le numéro de ligne → Supprimer la ligne).

## G. Tester les erreurs

| Test | Résultat attendu |
|---|---|
| Envoyer le formulaire vide | 7 messages d'erreur, focus sur le 1er champ, aucune requête envoyée |
| Email `test@gmail.com` | « Please use your USM student email (@student.usm.my). » |
| Téléphone `0123456789` | « Please start with + and your country code » |
| Case de consentement décochée | « Please tick the box… » |
| Renvoyer exactement la même personne (même email + même ID) | Confirmation + « You were already registered… », **aucune** nouvelle ligne |
| Même email avec un autre ID (ou l'inverse) | « This email address or student ID has already been used… », aucune ligne |
| Couper le Wi-Fi / mode avion puis envoyer | « We couldn't reach our server… », pas de confirmation |
| `REGISTRATION_OPEN = false` + redéployer (nouvelle version) | « Pre-registration is currently closed… » |
| Double-clic rapide sur le bouton | Une seule ligne dans le Sheet |

---

## H. Publier sur GitHub Pages

> Le dossier `MADHOUSE` a été initialisé comme **son propre dépôt git** (`git init`). C'est important : votre dossier personnel (`/Users/guillo`) est lui aussi un dépôt git ; sans dépôt séparé, vous risqueriez de publier tout votre dossier personnel.

1. Sur <https://github.com/new> : nom du dépôt `madhouse` (ou autre), **Public** (GitHub Pages gratuit exige un dépôt public), **sans** README ni .gitignore. **Create repository**.
2. Dans le Terminal, depuis le dossier du projet :
   ```bash
   cd ~/MADHOUSE
   git add .
   git commit -m "MADHOUSE pre-registration site"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/madhouse.git
   git push -u origin main
   ```
   (Remplacez `VOTRE-COMPTE` par votre identifiant GitHub.)
3. Sur GitHub : **Settings → Pages** → « Build and deployment » → Source : **Deploy from a branch** → Branch : **main**, dossier **/ (root)** → **Save**.
4. Après 1 à 2 minutes, l'adresse publique s'affiche en haut de la page Pages, du type `https://VOTRE-COMPTE.github.io/madhouse/`.
5. **Image de partage** : dans `index.html`, remplacez `content="assets/og-image.jpg"` par l'URL complète, ex. `content="https://VOTRE-COMPTE.github.io/madhouse/assets/og-image.jpg"` (Instagram/WhatsApp/Facebook n'acceptent que des URL absolues). Commitez et poussez.
6. Sur votre **téléphone** : ouvrez l'URL, vérifiez l'affichage, faites une préinscription de test (section E), vérifiez la ligne (F), puis supprimez-la.

## I. Mettre à jour le site

Modifiez les fichiers, puis :

```bash
cd ~/MADHOUSE
git add .
git commit -m "Description de la modification"
git push
```

GitHub Pages republie automatiquement en 1 à 2 minutes (pensez à recharger la page sans cache sur téléphone).

---

## J. Confidentialité des données

- Le Sheet reste **Limité** ; partagez-le au minimum de personnes, en lecture si possible.
- Ne téléchargez pas d'exports CSV sur des appareils partagés ; ne collez jamais la liste dans un groupe WhatsApp.
- **Durée de conservation** : la notice indique que les données sont supprimées une fois qu'elles ne sont plus utiles pour l'événement. Fixez une date concrète (par ex. 3 mois après l'événement), notez-la et **supprimez réellement** les lignes à cette date.
- Une personne demande la suppression de ses données ? Supprimez sa ligne et confirmez-lui.
- Pour fermer les inscriptions : `REGISTRATION_OPEN = false` puis redéployer (Gérer les déploiements → Nouvelle version).
- Le script ne journalise **aucune** donnée personnelle (seulement le type d'erreur technique). Le site n'écrit rien dans la console, sauf un avertissement technique si `ENDPOINT_URL` est vide.
- Aucun outil d'analyse ou de publicité n'est installé. N'en ajoutez pas sans mettre à jour la notice.

---

## K. Limites connues

1. **Domaine e-mail à confirmer** : le site n'accepte que `@student.usm.my`. Vérifiez que tous les étudiants visés (y compris postgraduate / campus Engineering et Health) ont bien ce domaine ; sinon ajoutez les autres domaines **dans `script.js` ET `Code.gs`**.
2. **Pas de vérification d'inscription réelle** : un e-mail et un numéro étudiant ne prouvent pas qu'une personne est actuellement inscrite à l'USM. Aucun e-mail de vérification n'est envoyé. Une vérification à l'entrée (carte étudiante) reste nécessaire.
3. **Protection anti-abus limitée** : Apps Script ne donne pas l'adresse IP des visiteurs. Les protections sont : champ piège (honeypot), délai minimum de 2 s, limite globale de 30 inscriptions/minute, verrou anti-doublons. Un attaquant déterminé pourrait saturer cette limite (ce qui bloque temporairement les vrais inscrits) ou envoyer de fausses inscriptions avec des adresses `@student.usm.my` inventées. Pour un événement étudiant, c'est un compromis raisonnable ; ajouter un CAPTCHA (ex. Cloudflare Turnstile, gratuit) serait l'étape suivante si besoin.
4. **Détection de doublon et confidentialité** : le message « déjà utilisé » permet en théorie de savoir qu'une adresse ou un ID figure déjà dans la liste (sans jamais révéler aucune donnée). C'est le compromis choisi pour éviter les doublons.
5. **Quotas Google** (compte gratuit) : Apps Script limite notamment le nombre d'exécutions simultanées (30 par utilisateur). Pour quelques centaines d'inscriptions, c'est largement suffisant ; en cas de pic, le site affiche « try again in a minute ».
6. **Origine des visuels** : le dossier `assets/` n'existait pas ; les visuels ont été recréés à partir des images partagées dans la conversation (1024×1536 pour les flyers, 1254×1254 pour le logo, probablement recompressées). Si vous avez les fichiers originaux haute définition, remplacez `assets/logo.png` et `assets/flyer-N.jpg` puis lancez `python3 tools/build-images.py`.
7. **Compte Instagram** : le lien `https://www.instagram.com/madhouse.penang/` est déduit du nom `@madhouse.penang` et **n'a pas été vérifié**. Ouvrez-le pour confirmer avant le lancement.

---

## Avant la mise en ligne — checklist

- [x] **Adresse e-mail de contact** renseignée dans `privacy.html` : `madhouse.conctact@gmail.com`. ⚠️ Vérifiez l'orthographe (« conctact » avec deux c ?) : si c'est une faute de frappe, corrigez-la dans `privacy.html`.
- [ ] **Backend déployé** (section C) et **URL `/exec` collée** dans `script.js` (section D).
- [ ] **Domaine e-mail confirmé** (`student.usm.my`) dans `script.js` et `Code.gs`.
- [ ] **Lien Instagram vérifié**.
- [ ] Test de bout en bout réussi sur téléphone + ligne de test supprimée (sections E–F).
- [ ] URL absolue de `og:image` dans `index.html` (section H.5).
- [ ] (Recommandé) Originaux haute définition du logo et des flyers.
