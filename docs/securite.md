# Securite et verification

## Frontieres de confiance

Le navigateur est non fiable. Le serveur ne fait confiance qu'au JWT signe par
les cles du fournisseur configure, avec issuer, audience API, dates
valides et e-mail verifie. L'email, le sous-ensemble de donnees visible et l'onglet
ne sont jamais choisis par le client. `sub` doit etre present, mais l'isolation
actuelle reste indexee par l'e-mail selon ADR 0004.

Les editeurs du classeur et du projet Apps Script sont privilegies : limiter
strictement ces acces. L'URL de l'API n'est pas un secret, ni une autorisation.
La politique CORS n'est pas une authentification : un attaquant hors navigateur
peut toujours appeler l'API. La validation des bearer tokens reste obligatoire.

## Mesures presentes

- PKCE S256 et state geres par une bibliotheque OIDC versionnee. Nonce aleatoire
  fourni par l'application et compare au profil de l'ID token, avec controles
  explicites d'issuer, d'audience, d'azp et des dates dans `public/auth.js`.
- Aucun secret client, aucun token dans les URLs, les logs ou localStorage.
- Access token en memoire, expiration serveur stricte, aucune confiance dans une
  simple lecture base64 des claims. Pas de refresh token demande.
- RS256 et ES256 uniquement ; refus de `none`, des en-tetes critiques et des mauvaises
  cles ; JWKS distant fixe en configuration, sans redirection ni URL dans le JWT.
- Audience API distincte du client pour refuser l'ID token, meme sans claim `scope`.
- Seuls `openid email profile` sont demandes. Ces scopes d'identite ne sont pas
  des permissions metier ; aucun scope applicatif ni claim `scope` n'est requis.
  Toute identite valide pour l'audience API accede uniquement a son inventaire.
- E-mail verifie requis ; operations limitees a l'onglet derive cote serveur.
  Avec `OIDC_REQUIRE_EMAIL_VERIFIED=false`, la garantie repose sur le fournisseur :
  il doit imposer la confirmation de l'e-mail avant la connexion et ne pas laisser
  l'utilisateur modifier le claim `email`. Ne jamais se fier a `user_metadata`.
- Validation serveur des longueurs/types/enumerations et corps limite a 20 000
  caracteres. Cette limite est applicative, pas une limite au niveau reseau.
- Affichage par `textContent` et formulaires, pas d'injection HTML depuis les
  champs utilisateur ; stockage des champs dans du JSON, pas dans des formules.
- Verrou Apps Script couvrant lecture/ecriture ; erreurs generiques sans stack.
- Referrer-Policy no-referrer, dependances locales et perimetre de publication
  limite a `public/`. Pas de donnees de demonstration sauvegardees.

## Risques residuels

Pas de revocation immediate ni de protection anti-DDoS : quotas Google et surface
publique restent des limites. Une XSS active peut lire les jetons en memoire.
Une deconnexion locale ne revoque pas le bearer token et ne ferme pas le SSO.
Le cache JWKS retarde le retrait d'une cle de cinq minutes maximum en situation
normale ; un `kid` inconnu peut provoquer des requetes supplementaires au JWKS.
Le frontal n'impose pas de CSP : en ajouter une stricte et compatible avec les
endpoints du fournisseur choisi constitue un durcissement a valider avant ouverture.
Le navigateur peut perdre des champs non enregistres au rechargement/expiration.

Un e-mail reattribue peut exposer l'espace historique au nouveau titulaire.
Ce risque est bloquant pour une ouverture si le fournisseur ne garantit pas la
non-reattribution : faire approuver et implementer une identite `iss/sub` avant
de passer en production dans ce contexte. L'index SHA-256 n'anonymise pas un e-mail.

## Tests automatises

`tests/backend.test.cjs` execute la bibliotheque jsrsasign reelle avec des tokens
signes par une cle de test RSA 2048, et des services Google simules. Il couvre
CRUD, tentative d'acces croise, signature d'une autre cle, expiration absente ou
depassee, mauvais issuer/audience, e-mail absent/non verifie, `nbf` futur,
algorithme interdit, cle inconnue, en-tete critique, validation et erreurs.
Il verifie egalement le succes avec les scopes OIDC standard ou sans claim
`scope`, ainsi que le refus d'une audience client meme en l'absence de ce claim.

`tests/auth.test.cjs` utilise la distribution OIDC reelle pour verifier la requete
code, S256, le lien challenge/verifier, les scopes, state/nonce et le stockage
temporaire, puis l'echange du code, la consommation du state et le refus d'un
state inconnu ou d'un nonce incorrect. `tests/test_config.py` verifie la liste blanche des variables, leur
priorite, le refus d'URL de transport non autorisees et la limitation des scopes
a `openid email profile`.

Les services Google simules ne reproduisent pas le moteur Sheets, les politiques
Workspace ni CORS. Les tests OIDC locaux ne prouvent pas la configuration d'un
fournisseur reel. Suivre la recette du guide de deploiement, avec deux comptes.

## Recette visuelle et fonctionnelle locale

Verifier a 1440 px et 390 px (et a 320 px minimum), sans debordement horizontal,
images chargees, modales utilisables au clavier, focus visible et controles
accessibles. Tester ajout, edition, suppression annulee/confirmee, recherche sans
resultat, filtres combines et caracteres HTML affiches comme texte. Le mode
demonstration doit toujours etre distingue de l'espace connecte.