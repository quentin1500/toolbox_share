# ADR 0004 : Stockage personnel et progression

Date : 2026-10-23. Statut : Accepte (socle initial).

## Contexte

Le besoin propose un onglet par utilisateur identifie par son e-mail, avec une
premiere livraison limitee a l'inventaire personnel.

## Decision

Conserver un onglet par e-mail verifie. Son nom technique est
`u_` + SHA-256 de l'e-mail normalise (trim et minuscules), afin d'eviter les
caracteres interdits et la divulgation directe de l'e-mail dans les noms
d'onglets. Le hachage est un identifiant, pas un chiffrement ni une anonymisation.
Le nom d'onglet est exclusivement calcule cote serveur depuis le JWT valide.

Chaque ligne contient un UUID et un objet outil serialise en JSON : nom,
categorie, description, etat, intention de partage et horodatages UTC. Le JSON
commence par une accolade et protege les champs libres contre une interpretation
comme formule Sheets. Les identifiants et horodatages sont produits au serveur.

L'identite autorisante est bien l'e-mail, conformement au besoin. Un changement
d'e-mail cree un nouvel espace ; une reattribution d'e-mail peut donner acces a
l'ancien. Choisir un fournisseur qui garantit la maitrise et la non-reattribution
des e-mails, ou faire approuver une evolution vers une cle `iss` + `sub` AVANT une
ouverture a un public dont les e-mails peuvent etre reattribues. Une migration
manuelle controlee est decrite dans le guide d'exploitation.

La gestion des outils personnels est active. Le comportement initial de
`shared` est complete par l'ADR 0007 : `true` rend l'outil visible uniquement
aux amis dont la relation est acceptee, sans publication publique. La gestion
privee du profil est ajoutee par l'ADR 0006 ; les demandes d'amitie et les outils
du quartier sont definis par l'ADR 0007.

## Consequences

Simple pour un petit collectif, mais les limites d'onglets/cellules et les quotas
Apps Script rendent cette structure inadaptee a une forte croissance. L'ADR 0006
definit la feuille et les ACL du profil ; les demandes necessiteront leur propre
decision.
Les editeurs directs du classeur restent de confiance et peuvent lire toutes
les donnees. L'application n'est pas un systeme de confidentialite vis-a-vis d'eux.