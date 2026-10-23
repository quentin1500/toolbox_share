# Dependances et ressources

Les ressources sont versionnees localement : aucun telechargement tiers n'est
necessaire au chargement du site, hormis les echanges OIDC et API configures.
Python et Node n'ont aucune dependance de paquet pour ce projet.

| Ressource | Version / origine | Licence | Usage |
| --- | --- | --- | --- |
| oidc-client-ts | 3.3.0, `https://unpkg.com/oidc-client-ts@3.3.0/dist/browser/oidc-client-ts.min.js` | Apache-2.0, licence dans `public/vendor/` | Client OIDC navigateur, inclut jwt-decode dans sa distribution |
| jsrsasign | 11.1.4, `https://raw.githubusercontent.com/kjur/jsrsasign/11.1.4/jsrsasign-all-min.js` | MIT/BSD et notices embarquees, licence dans `backend/vendor/` | Verification RS256 et ES256 uniquement, pas de signature/generation de cles |
| Lucide | 0.468.0, `https://github.com/lucide-icons/lucide/tree/0.468.0/icons` | ISC, licence dans `public/assets/icons/` | Icones SVG statiques |
| Photographie de marteau | Evan-Amos, [Claw-hammer.jpg](https://commons.wikimedia.org/wiki/File:Claw-hammer.jpg), version 1280 px | Domaine public selon la fiche de la source | `public/assets/workshop.jpg` |

## Bibliotheque serveur

`python scripts/vendor_jwt.py` recupere la source 11.1.4, verifie son identifiant
de blob Git attendu puis l'enveloppe dans une fonction `jwtLibrary_` avec les
objets locaux `navigator` et `window` necessaires a son initialisation hors DOM.
Les valeurs d'adaptation ne fournissent pas d'aleatoire cryptographique : cette
distribution ne doit servir QU'A LA VERIFICATION, jamais a generer/signer des
secrets. Le wrapper est reproduit par le script, pas modifie manuellement.

Pour une mise a jour, verifier les avis de securite et les licences de la nouvelle
version, mettre a jour l'URL et le blob attendu dans le script, regenerer et
executer les tests de vrais JWT. Faire relire les changements d'algorithmes ou
de contrats ; une modification des decisions exige l'accord et un nouvel ADR.

Pour OIDC, remplacer la distribution navigateur et sa licence par la version
epinglee choisie, sans supprimer les notices integrees. Rejouer les tests PKCE,
la recette callback/expiration et le parcours reel du fournisseur. Aucun script
de mise a jour automatique ne s'execute en production ou dans le workflow Pages.