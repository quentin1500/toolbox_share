# Toolbox Share

Une boîte à outils personnelle, en HTML/CSS/JavaScript, avec connexion OpenID Connect
(Authorization Code + PKCE S256), Google Sheets et Apps Script. Aucun npm, bundler,
framework ou CDN a l'execution.

## Essayer en local

Prerequis : Python 3.10+ (bibliotheque standard uniquement).

```powershell
python scripts/serve.py
```

Ouvrir http://localhost:8000/. Sans configuration, la démonstration contient six
outils modifiables **en memoire uniquement**. Un rechargement les reinitialise.
Le serveur n'expose que `public/`, jamais `.env.local` ni le backend.
Pour un port occupe : `python scripts/serve.py --port 8001`.

Pour activer la connexion, créer `.env.local` depuis `.env.example`, puis suivre
[le guide de mise en place](docs/deploiement.md). Aucun secret client OAuth ne doit
etre fourni a une application statique. Les valeurs generees dans `config.js`
seront publiques, meme si leur origine est un secret GitHub.

## Premiere version

- Connexion, expiration et deconnexion locale.
- Inventaire personnel : liste, recherche, filtres, ajout, modification, suppression.
- Backend : verifications cryptographiques RS256/ES256 et droits limites a son onglet.
- Indicateur de partage prepare, sans publication effective pour le moment.
- Les profils/contact, catalogue des autres utilisateurs et demandes sont des
  prochaines etapes, detaillees dans [la documentation fonctionnelle](docs/fonctionnel.md).

## Verification

Node.js 22+ est utilise uniquement pour les tests, sans installation de paquets.

```powershell
node --test tests/backend.test.cjs tests/auth.test.cjs
node --check public/app.js
python -m unittest discover -s tests -p "test_*.py" -v
```

Les tests backend executent le code Apps Script et la vraie bibliotheque JWT
dans un contexte V8, avec les services Google simules. Ils ne remplacent pas une
recette sur un vrai fournisseur et un vrai deploiement Apps Script.

## Documentation

- [Decisions d'architecture](docs/adr/README.md)
- [Fonctionnement et feuille de route](docs/fonctionnel.md)
- [Installation, deploiement et exploitation](docs/deploiement.md)
- [Securite et recette](docs/securite.md)
- [Origine et licences des ressources](docs/dependances.md)

Les agents doivent lire [AGENTS.md](AGENTS.md) avant toute modification.