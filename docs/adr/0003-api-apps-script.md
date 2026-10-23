# ADR 0003 : API Apps Script et verification JWT

Date : 2026-10-23. Statut : Accepte (socle initial).

## Contexte

Apps Script n'offre pas une API native complete de verification JWT/JWKS ni un
controle general des reponses CORS/OPTIONS et des en-tetes HTTP. ContentService
redirige les reponses vers `script.googleusercontent.com`.

## Decision

Utiliser `doPost`, JSON transporte en `text/plain;charset=UTF-8`, sans en-tete
Authorization ni cookies, pour eviter les requetes preflight. Le jeton est dans
le corps, jamais dans l'URL ; `fetch` suit les redirections et lit le JSON en mode
CORS. Ne pas utiliser JSONP, `no-cors` ou un GET pour les mutations. La reponse
applicative contient `ok`, `data` ou un code `error`, car les codes HTTP ne sont
pas librement pilotables par ContentService.

Executer le web app en tant que proprietaire et autoriser l'acces anonyme Google :
l'authentification reelle est la verification du bearer token, a chaque appel.
Ne jamais partager la feuille avec les utilisateurs de l'application.

Utiliser jsrsasign 11.1.4 vendore avec un adaptateur sans DOM, strictement pour
la verification RS256. Verifier la signature avec le JWKS fixe dans les proprietes
du script, l'algorithme, le `kid`, `iss`, `aud`, `exp`, `nbf`/`iat` s'ils existent,
et l'e-mail verifie. Algorithmes acceptes : RS256 (cle RSA) et ES256 (cle EC P-256),
la famille de cle devant correspondre a l'algorithme de l'en-tete. L'e-mail verifie
est requis (`email_verified: true`) sauf si la propriete `OIDC_REQUIRE_EMAIL_VERIFIED`
vaut `false` : option reservee aux fournisseurs qui n'emettent pas ce claim
(Supabase) et qui imposent la confirmation de l'e-mail avant toute connexion.
Aucun scope applicatif ni claim `scope` n'est exige pour le
CRUD personnel ; le frontend demande seulement `openid email profile`.
Ne pas suivre de `jku`, `x5u` ou URL de cle
fournie par le jeton. La cle doit etre RSA et autorisee pour la verification.
Mettre le JWKS en cache cinq minutes et le recharger en cas de `kid` inconnu.
Une cle conservee en cache peut rester acceptee cinq minutes apres retrait.

## Consequences

Le transport inter-origines doit etre teste sur le VRAI deploiement Google, dans
les navigateurs cibles. Les politiques Workspace ou un ecran Google de connexion
peuvent l'empecher. En cas d'echec, suspendre le deploiement et faire approuver
un ADR de proxy ou une autre architecture ; ne pas retirer les controles.

La surface publique reste exposee aux abus et quotas Google. Pas de protection
anti-DDoS ni de revocation immediate dans cette version. Aucun jeton ni corps de
requete ne doit etre journalise. Les mutations ont un verrou global pour eviter
les corruptions ; le dernier enregistrement gagne. Pas de reessai automatique
apres un timeout : la mutation peut avoir ete executee.