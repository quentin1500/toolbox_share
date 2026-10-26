# ADR 0002 : Authentification OIDC et PKCE

Date : 2026-10-23. Statut : Accepte (socle initial ; decision de stockage
remplacee par ADR 0005).

## Contexte

OAuth autorise des appels API ; OIDC ajoute l'authentification. Reimplementer
state, nonce, PKCE et le traitement des callbacks augmente le risque d'erreur.

## Decision

Utiliser `oidc-client-ts` 3.3.0 uniquement pour l'authentification : client public,
Authorization Code, PKCE S256, `state` et `nonce`, sans implicit flow ni secret
client. L'application fournit un nonce aleatoire (`crypto.randomUUID`) a chaque
connexion et le conserve dans les donnees du state gere par la bibliotheque.
Le module local `auth.js` compare explicitement ce nonce a celui du profil issu
de l'ID token et controle `iss`, `aud`, `azp`, `sub`, `exp`, `iat` et `nbf` au
retour, car la distribution 3.3.0 ne garantit pas ces controles a elle seule.
La comparaison de l'issuer ignore un slash final (certains fournisseurs, dont
Supabase, l'omettent dans le jeton).
L'ID token est recu directement du token endpoint de confiance via HTTPS ; le
frontend ne revendique pas une verification de signature locale de cet ID token.
Le fournisseur
doit exposer discovery et token endpoint accessibles par
CORS depuis les origines du frontend.

Initialement, les access tokens et ID tokens restaient en memoire via
`InMemoryWebStorage`. Cette decision de stockage est remplacee par ADR 0005 ;
les autres decisions OIDC de cet ADR restent en vigueur.
Seul l'etat transitoire de connexion (state, nonce, code_verifier, URL de retour)
est place en `sessionStorage` pour survivre a la redirection, puis consomme par la
bibliotheque. L'URL est nettoyee des codes et erreurs apres callback. Les etats
abandonnes sont purges avant une nouvelle connexion.

Ne pas demander `offline_access`. Aucun renouvellement automatique. Si le
fournisseur renvoie tout de meme un refresh token, il est ignore : jamais utilise
ni conserve par l'application. L'emission peut etre desactivee si le fournisseur
le permet. A expiration, une nouvelle connexion est requise (la session SSO du
fournisseur peut la simplifier). La decision initiale de stockage en memoire a
ete remplacee par ADR 0005 : un token non expire survit au rechargement. La
deconnexion efface la session locale, pas la session SSO ni les jetons deja emis.

Le backend recoit exclusivement l'access token, jamais l'ID token. Configurer une
audience API distincte du client pour eviter leur confusion. Demander uniquement
les scopes OIDC standard `openid email profile`, sans scope applicatif dedie.
L'access token doit etre un JWT RS256 ou ES256 avec `kid`, `iss`, `sub`, `aud`, `exp`,
`email` et `email_verified: true` (voir ADR 0003 pour l'assouplissement configurable). Le claim `scope` n'est pas requis ni utilise pour
autoriser le CRUD personnel : toute identite valide pour l'audience API gere
uniquement son propre espace. Un fournisseur ne donnant que des jetons
opaques ou un e-mail dans l'ID token n'est pas compatible sans configuration ou
nouvelle decision approuvee.

## Consequences

Les fournisseurs ne sont pas interchangeables sans configuration : le parametre
`audience` est optionnel (par exemple Auth0) ; avec Keycloak, utiliser des mappers
de claims et d'audience et laisser le parametre vide. La version livree ne
depend pas d'un fournisseur particulier. Un vrai test de connexion reste requis.
Voir ADR 0005 pour les consequences securite du stockage persistant dans le navigateur.