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
| [0002](0002-authentification.md) | OIDC, code PKCE S256 et jetons en memoire | Accepte (socle initial) |
| [0003](0003-api-apps-script.md) | Transport POST et validation JWT serveur | Accepte (socle initial) |
| [0004](0004-stockage-et-perimetre.md) | Un onglet par e-mail et progression fonctionnelle | Accepte (socle initial) |