# Mise en place et exploitation

## 1. Fournisseur d'identite

1. Creer un client **public SPA**, Authorization Code et PKCE S256 obligatoire.
   Desactiver implicit flow et client secret ; desactiver les refresh tokens si possible
   (sinon ils sont ignores par l'application).
2. Declarer les URL de retour exactes : `http://localhost:8000/` et
   `https://ORGANISATION.github.io/DEPOT/`. Autoriser ces origines pour discovery
   et token endpoint (CORS). Ne pas utiliser de wildcard pour les redirections.
3. Creer une audience API distincte de l'identifiant client, par exemple
   `toolbox-api`. Autoriser uniquement les scopes OIDC `openid email profile` ;
   aucun scope applicatif personnalise n'est necessaire.
4. Configurer l'access token **JWT RS256 ou ES256** avec `kid`, `iss`, `sub`, `aud`, `exp`,
   `email` et `email_verified: true`. Le claim `scope` n'est pas requis. La signature doit
   utiliser une cle RSA d'au moins 2048 bits. Ne pas simplement ajouter l'e-mail
   a l'ID token. Ne pas forcer artificiellement `email_verified` a vrai.
5. Relever l'issuer EXACT (y compris slash final) et le `jwks_uri` de sa discovery
   `/.well-known/openid-configuration`. Utiliser les URL HTTPS canoniques sans
   redirection pour JWKS. Le script ne derive pas cette URL du JWT.
6. Configurer une courte duree d'access token (par exemple 5 a 15 minutes).
   Verifier que le fournisseur garantit la maitrise et la non-reattribution des
   e-mails ; sinon suspendre l'ouverture et revoir ADR 0004.

Avec Auth0, `OIDC_AUDIENCE` transmet le parametre `audience` ; des actions/mappers
peuvent etre necessaires pour les claims de l'access token. Avec Keycloak,
configurer les mappers d'audience et d'e-mail verifie ; laisser
`OIDC_AUDIENCE` vide si le fournisseur ne supporte pas ce parametre. La valeur
`OIDC_AUDIENCE` cote script reste toujours obligatoire.

Supabase (OAuth server) : issuer `https://<ref>.supabase.co/auth/v1` SANS slash
final ; JWKS `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` (cles
asymetriques ES256 a activer) ; `aud` de l'access token = `authenticated`, a
renseigner dans `OIDC_AUDIENCE` cote script, `OIDC_AUDIENCE` vide dans `.env.local` ;
l'access token ne porte pas `email_verified` a la racine : definir
`OIDC_REQUIRE_EMAIL_VERIFIED=false` cote script ET activer la confirmation d'e-mail
obligatoire dans Supabase Auth.
Google Sign-In fournit habituellement des access tokens opaques et n'est donc
pas directement compatible avec ce contrat. Ne pas envoyer l'ID token a la place.

## 2. Google Sheets et Apps Script

1. Creer un classeur prive. Ne pas le publier sur le Web ni le partager avec les
   utilisateurs du site. Relever son ID entre `/d/` et `/edit`.
2. Dans Extensions > Apps Script, creer un projet lie au classeur. Copier
   `backend/Code.gs` dans un fichier Code et `backend/vendor/jsrsasign.gs` dans
   un fichier jsrsasign. La bibliotheque est enveloppee dans `jwtLibrary_` : ne
   pas remplacer par la distribution navigateur brute.
3. Dans les parametres du projet, afficher le manifeste `appsscript.json` et le
   remplacer par `backend/appsscript.json`. Le moteur doit etre V8.
4. Dans Proprietes du script, definir :

| Propriete | Exemple / origine |
| --- | --- |
| `SPREADSHEET_ID` | ID du classeur prive |
| `OIDC_ISSUER` | `https://identity.example.com/` exact |
| `OIDC_AUDIENCE` | `toolbox-api`, jamais le client SPA |
| `OIDC_JWKS_URI` | URL HTTPS fixe du JWKS fournie par discovery |
| `OIDC_REQUIRE_EMAIL_VERIFIED` | Optionnelle ; `false` uniquement si le jeton n'a pas `email_verified` (voir Supabase) |

5. Deployer > Nouveau deploiement > Application Web. Executer en tant que
   **vous-meme**, acces **Tout le monde**, y compris anonyme. Autoriser les scopes
   Sheets et requetes externes. Seul le proprietaire autorise les scopes Google ;
   les utilisateurs du site ne doivent jamais avoir a se connecter a Google.
6. Relever l'URL de production se terminant par `/exec`, pas `/dev`. La renseigner
   dans `API_URL`. Un appel invalide doit retourner du JSON `ok:false`, pas une
   page de connexion Google. Les onglets personnels seront crees automatiquement.
7. Faire la recette navigateur ci-dessous AVANT publication. Certaines politiques
   Workspace interdisent les web apps anonymes ; ne pas contourner cette regle.

Un classeur neuf peut garder son onglet initial vide. Le code ne le supprime pas.
Les lignes personnelles ont deux colonnes `id` et `tool_json` ; ne pas modifier
manuellement leur schema. Ne jamais y stocker de tokens.

## 3. Configuration locale

```powershell
Copy-Item .env.example .env.local
```

Modifier les valeurs du fichier ignore :

| Variable | Valeur |
| --- | --- |
| `OIDC_AUTHORITY` | Issuer HTTPS exact du fournisseur |
| `OIDC_CLIENT_ID` | ID du client public SPA |
| `OIDC_SCOPE` | `openid email profile` uniquement |
| `OIDC_AUDIENCE` | Parametre audience si accepte par le fournisseur, sinon vide |
| `API_URL` | URL Apps Script `/exec` |
| `APP_URL` | URL exacte de callback, ex. `http://localhost:8000/` |

Format : `CLE=valeur`, une par ligne, commentaires sur des lignes commencant par
`#`. Les guillemets simples/doubles autour d'une valeur sont facultatifs ; pas
d'interpolation `${...}` ni de commandes shell. Les variables d'environnement
prennent priorite sur le fichier. Seules les cles du tableau sont exportees.

```powershell
python scripts/serve.py
```

Pour un autre port, modifier aussi `APP_URL` et les redirections chez le fournisseur.
Le serveur ne lie que `127.0.0.1`. Ne pas utiliser `python -m http.server` depuis
la racine du depot, afin de ne pas exposer les fichiers de configuration prives.

## 4. GitHub Pages

1. Creer/pousser le depot sur GitHub avec une branche `main`. Aucun commit ni push
   n'est effectue automatiquement par cet assistant.
2. Settings > Pages > Source : **GitHub Actions**.
3. Dans Settings > Environments, creer/configurer `github-pages`, limiter les
   branches autorisees et ajouter les six variables publiques du tableau precedent.
   `APP_URL` vaut `https://ORGANISATION.github.io/DEPOT/` avec slash final.
   Elles peuvent aussi etre renseignees en secrets du meme nom : le workflow donne
   priorite aux variables puis aux secrets. Elles seront publiques dans le site.
4. Dans le fournisseur, declarer cette URL exacte de callback et l'origine
   `https://ORGANISATION.github.io` pour CORS.
5. Pousser sur `main` ou lancer manuellement le workflow Pages depuis `main`.
   Les tests s'executent d'abord ; la generation de configuration exige les
   valeurs obligatoires. Seul `public/` est envoye dans l'artefact Pages.
6. Verifier le resultat du workflow et effectuer la recette sur l'URL publiee.

Une pull request execute les tests sans lire les secrets ni deployer. Ne jamais
ajouter `.env.local` ou `public/config.js` au suivi Git. Ne pas y mettre de secret
client, meme temporairement. GitHub Pages n'offre pas de serveur pour le cacher.

## 5. Recette obligatoire avant ouverture

- Connexion avec le vrai fournisseur : code + PKCE S256, pas de refresh token,
  callback nettoye, aucun token dans URL ou logs. Dans le stockage du navigateur,
  verifier la presence de la session OIDC sans refresh token.
- Depuis l'origine Pages, verifier un POST Apps Script lisible apres redirection
  vers `script.googleusercontent.com`. Ne pas essayer de corriger avec `no-cors`.
- Avec deux comptes, creer/modifier/supprimer et verifier l'isolation des onglets.
  Tenter un UUID du premier compte avec le second : `NOT_FOUND`.
- Verifier refus d'un JWT expire, falsifie, d'un autre issuer/audience ou sans
   e-mail verifie ; verifier aussi le refus d'un ID token.
- Verifier que les seuls scopes demandes sont `openid email profile` et que
   l'access token est accepte meme sans claim `scope`, si les autres controles
   sont valides.
- Verifier qu'un rechargement reprend la session avant expiration, puis que
  l'expiration exige une nouvelle connexion et efface la session locale. Verifier
  la deconnexion, le refus du consentement, un callback sans etat local et les
  erreurs reseau. Le menu de compte doit montrer l'adresse complete, sans
  troncature et avec retour a la ligne si necessaire, et ne proposer que la
  deconnexion, y compris sur smartphone.
- Inspecter le stockage OIDC du navigateur : aucun refresh token ne doit etre
  conserve. Le choix `localStorage` expose les bearer tokens a tout script execute
  sur l'origine ; proteger l'origine contre les XSS et ne jamais journaliser les
  valeurs de stockage.
- Appliquer [la liste de securite](securite.md) et ne pas ouvrir si les e-mails
  peuvent etre reattribues, sans decision de migration d'identite.

Cette recette externe n'est pas automatisee par les tests locaux : elle exige
vos comptes, votre fournisseur et votre deploiement Google.

## 6. Maintenance

### Mise a jour du script

Remplacer uniquement les fichiers concernes dans l'editeur Google. Deployer >
Gerer les deploiements > Modifier > Nouvelle version. Conserver le meme ID de
deploiement pour ne pas changer `API_URL`. Une simple sauvegarde du script ne met
pas a jour `/exec`. Conserver une version precedente pour un retour arriere.

### Sauvegardes et incidents

Utiliser l'historique et des copies privees du classeur, limitees aux responsables.
Sauvegarder avant migration. Ne pas activer de logs contenant les corps de requete,
les jetons ou les informations personnelles. Observer les quotas et echecs dans
Apps Script. En cas de compromission, desactiver le deploiement public, revoquer
les sessions chez le fournisseur et verifier les donnees. Les access tokens
deja emis restent valides jusqu'a expiration sauf retrait de cle ; le cache JWKS
peut alors retarder de cinq minutes la prise en compte du retrait.

### Changement d'e-mail / suppression de compte

Verifier hors bande l'identite du demandeur. Suspendre les ecritures (desactiver
le deploiement), faire une copie privee du classeur, calculer SHA-256 de l'ancien
et du nouvel e-mail normalises, puis renommer l'onglet `u_<ancien hash>` en
`u_<nouveau hash>`. Ne pas ecraser un onglet cible deja existant : une fusion
necessite une verification manuelle des UUID et du proprietaire. Retablir le
deploiement et tester avec le nouveau JWT. Pour une suppression, retirer l'onglet
et appliquer votre politique de conservation aux copies et historiques Google.

### Limites connues

Petits collectifs uniquement : pas de pagination, d'anti-abus, de resolution de
conflits ou de garantie transactionnelle multi-requetes. L'endpoint anonyme peut
consommer des quotas meme avec des jetons invalides. Aucun appel ne doit etre
automatiquement rejoue apres un timeout de mutation. Une evolution vers proxy,
base dediee ou identite `iss/sub` exige un ADR approuve.