# Regles du projet

Avant toute intervention, lire `docs/adr/README.md`, tous les ADR acceptes,
`docs/fonctionnel.md`, `docs/securite.md` et les procedures pertinentes dans
`docs/deploiement.md`. Ces documents sont la reference pour le perimetre et les
contrats techniques.

## Documentation obligatoire

Pour chaque modification, l'agent doit mettre a jour systematiquement les
documents concernes par le changement, dans le meme lot que le code. Toute
evolution des fonctionnalites, de l'interface, des textes visibles ou des
comportements doit etre refletee dans `docs/fonctionnel.md`. Une evolution qui
touche la mise en place ou l'exploitation doit aussi mettre a jour les procedures
pertinentes de `docs/deploiement.md` ; une evolution de securite doit actualiser
`docs/securite.md`. Si une decision d'architecture ou un contrat technique
approuve change, appliquer la procedure d'accord et d'ADR ci-dessous puis
actualiser egalement les documents fonctionnels et d'exploitation concernes.
Ne pas modifier les documents sans lien avec le changement ; lorsqu'un document
n'est pas concerne, aucune mise a jour artificielle n'est attendue.

Si une demande contredit ces decisions, ou si une modification impose de les
changer, informer les responsables et obtenir leur accord explicite AVANT de
modifier l'architecture ou son implementation. Ensuite ajouter un ADR qui
remplace ou complete le precedent et actualiser la documentation fonctionnelle
et les procedures concernees. Ne pas rendre une nouvelle decision acceptee sans
l'accord requis pour une modification des choix existants.

- Garder un frontend statique HTML/CSS/JS sans npm ni framework.
- Ne jamais publier `.env.local`, un secret client, un access token ou un ID token.
- Ne jamais accepter une identite ou un nom d'onglet venant du corps de requete.
- Ne jamais remplacer la verification de signature JWT par un simple decodage.
- Garder la demonstration separee des donnees reelles et uniquement en memoire.
- Ne pas modifier manuellement les bibliotheques vendorees. Documenter et tester
  leur mise a jour ; utiliser `scripts/vendor_jwt.py` pour l'adaptateur serveur.
- Executer les tests indiques dans README apres modification du code concerne.
- Ne pas annoncer la connexion ou le deploiement reels comme valides sans recette
  du fournisseur et des services Google.