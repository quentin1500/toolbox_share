# ADR 0001 : Frontend statique et configuration publique

Date : 2026-10-23. Statut : Accepte (socle initial).

## Contexte

Le frontend doit etre heberge sur GitHub Pages, sans npm et sans dependances
d'interface lourdes. Le navigateur ne peut pas conserver un secret OAuth.

## Decision

Servir uniquement `public/`, en HTML/CSS/JS classique, avec chemins relatifs pour
supporter les Pages de projet. Utiliser Python standard uniquement pour generer
`public/config.js`, servir les fichiers localement et preparer le deploiement.
Les bibliotheques d'authentification et les icones sont vendorees et versionnees.

`.env.local` est ignore par Git. Les variables GitHub de l'environnement
`github-pages` fournissent les memes valeurs au workflow. Les secrets GitHub
peuvent masquer une valeur dans les journaux, PAS dans les fichiers publies.
Ne jamais configurer de `client_secret` : le client OIDC est public.
La generation n'exporte qu'une liste explicite de cles publiques. Sans
configuration locale, une demonstration en memoire est disponible. En production,
le workflow exige une configuration complete.

## Consequences

Aucun bundler ni gestionnaire de paquets necessaire. Les mises a jour des
bibliotheques restent manuelles et doivent faire l'objet d'une veille securite.
Un serveur HTTP local est requis pour OIDC ; l'ouverture par `file://` n'est pas
supportee. Les valeurs publiees restent visibles de tous.