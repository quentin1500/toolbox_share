# ADR 0005 : Persistance de la session OIDC dans le navigateur

Date : 2026-10-26. Statut : Accepte avec accord explicite des responsables.

## Contexte

L'ADR 0002 conservait les access tokens et ID tokens en memoire. Tout rechargement
de page demandait donc une nouvelle connexion, meme si le token n'avait pas expire.
Les responsables ont explicitement autorise une evolution pour garder la session
apres rechargement. Le frontend demeure statique et l'API reste Apps Script.

## Decision

Utiliser le `userStore` local de `oidc-client-ts` pour persister la session OIDC
dans `localStorage`. Au demarrage, recharger l'utilisateur OIDC, verifier les
claims d'identite deja controles par `public/auth.js` et refuser toute session
dont l'access token ou l'ID token est expire. Le nonce est compare a l'etat
transitoire lors du callback initial ; cet etat n'etant pas persiste par
`oidc-client-ts`, la reprise recontrole les claims conserves puis laisse le
backend verifier cryptographiquement l'access token. Une session valide est
reprise et l'inventaire est recharge depuis le backend.

Le stockage OIDC est enveloppe afin de retirer `refresh_token` de chaque
representation utilisateur avant son ecriture. Aucun `offline_access` n'est
demande et aucun refresh token n'est utilise ; a expiration de l'access token,
la session locale est effacee et une nouvelle authentification est requise.
L'etat temporaire PKCE, nonce et state continue d'utiliser `sessionStorage`.
La deconnexion supprime l'utilisateur persiste localement, sans pretendre fermer
la session SSO du fournisseur.

L'interface affiche l'adresse de compte confirmee par la reponse du backend dans
un menu de compte qui propose la deconnexion. Les jetons restent exclus des URLs,
des logs et des requetes de navigation ; l'access token ne va au serveur que
dans le corps JSON du POST defini par ADR 0003.

## Consequences

La commodite de reprise de session implique que l'access token et l'ID token
soient accessibles au JavaScript de l'origine dans `localStorage`. Ce choix
n'est pas une protection contre une XSS : tout script malveillant execute sur
l'origine peut lire les jetons. La prevention XSS, les dependances locales, le
rendu des donnees utilisateur via `textContent` et une CSP compatible restent
importants. Le stockage ne doit jamais contenir de refresh token.

Cette decision ne cree pas de session serveur ni de cookie `HttpOnly; Secure` ;
elle conserve le modele de bearer token cote client et les controles JWT serveur
existants. Toute evolution vers un cookie de session serveur necessitera un ADR
et un changement d'architecture backend distincts.

Voir aussi [ADR 0002](0002-authentification.md), le [fonctionnement](../fonctionnel.md),
la [securite](../securite.md) et le [guide de deploiement](../deploiement.md).
