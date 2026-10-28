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
| [0004](0004-stockage-et-perimetre.md) | Onglets personnels d'outils derives de l'e-mail | Accepte (socle initial, perimetre complete par ADR 0006) |
| [0005](0005-persistance-session-navigateur.md) | Session OIDC persistante dans le navigateur, sans refresh token | Accepte avec accord explicite ; complete ADR 0002 |
| [0006](0006-profils-utilisateur.md) | Profil prive et suppression coordonnee des donnees personnelles | Accepte avec accord explicite ; complete ADR 0004 |
| [0007](0007-amitie-et-outils-du-quartier.md) | Demandes d'amitie, outils partages et resiliation des relations entre amis | Accepte avec accord explicite des responsables |

L'ADR 0005 remplace la decision de stockage en memoire de l'ADR 0002 : access et
ID tokens sont maintenant conserves dans `localStorage`, sans refresh token.
Les autres decisions OIDC et PKCE de l'ADR 0002 restent applicables.

L'ADR 0006 ajoute la gestion privee du profil au perimetre livre et precise
l'autorisation du CRUD de profil ainsi que sa suppression avec l'onglet d'outils.

L'ADR 0007 complete les ADR 0004 et 0006 : relations d'amitie dans `Amities`,
visibilite des champs de profil entre amis acceptes, lecture serveur des seuls
outils `shared=true` des amis, et suppression d'une demande ou d'une amitie par
l'un ou l'autre participant, avec autorisation derivee du JWT verifie. La
suppression du profil supprime aussi ses liens.