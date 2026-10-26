# Decisions d'architecture

Les choix initiaux ci-dessous concretisent le besoin de `prompt.txt`. Le statut
« Accepte (socle initial) » designe le socle livre, a faire relire avant mise en
production. Toute evolution ou contradiction ulterieure exige l'accord des
responsables avant implementation, un nouvel ADR et la mise a jour des documents
fonctionnels correspondants. Les alternatives identifiees ne sont pas adoptees
automatiquement.

| ADR | Decision | Statut |
| --- | --- | --- |
| [0001](0001-frontend-statique.md) | Frontend sans npm et configuration publique | Accepte (socle initial) |
| [0002](0002-authentification.md) | OIDC et PKCE S256 ; stockage initial en memoire | Accepte (socle initial, persistance remplacee par ADR 0005) |
| [0003](0003-api-apps-script.md) | Transport POST et validation JWT serveur | Accepte (socle initial) |
| [0004](0004-stockage-et-perimetre.md) | Un onglet par e-mail et progression fonctionnelle | Accepte (socle initial) |
| [0005](0005-persistance-session-navigateur.md) | Session OIDC persistante dans le navigateur, sans refresh token | Accepte avec accord explicite ; complete ADR 0002 |

L'ADR 0005 remplace la decision de stockage en memoire de l'ADR 0002 : access et
ID tokens sont maintenant conserves dans `localStorage`, sans refresh token.
Les autres decisions OIDC et PKCE de l'ADR 0002 restent applicables.