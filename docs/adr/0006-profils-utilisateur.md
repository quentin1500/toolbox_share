# ADR 0006 : Profil prive et suppression des donnees personnelles

Date : 2026-10-26. Statut : Accepte avec accord explicite des responsables.

## Contexte

La premiere version ne comprenait pas de profil. Les responsables ont approuve
l'ajout d'un profil prive accessible depuis le menu du compte, ainsi qu'une
action de suppression des informations de profil et de l'espace d'outils.
Le classeur reste prive et Apps Script execute les acces en tant que proprietaire.

## Decision

Ajouter une feuille unique `Profils` au classeur, avec les colonnes exactes
`email`, `nom prénom`, `numéro de téléphone` et `adresse physique`. La premiere
ligne est l'en-tete. L'e-mail, normalise en minuscules et espaces retires, est
la cle unique. Le serveur derive toujours cette cle du claim `email` d'un access
token dont la signature, l'issuer, l'audience, l'expiration et la verification
de l'e-mail ont ete controles. Il n'accepte ni identite ni numero de ligne du
corps de requete. Une seule ligne correspondante est lue ou modifiee ; une
feuille qui contient des doublons est consideree en erreur.

Les actions API `getProfile` et `saveProfile` ne retournent ni ne modifient
qu'une ligne dont la cle correspond a l'e-mail du JWT. `getProfile` indique
explicitement si la ligne existe et renvoie les champs vides quand elle manque.
Lors de sa premiere connexion, l'utilisateur sans profil est bloque sur le
formulaire de profil avant l'inventaire. Il peut continuer en laissant les trois
champs vides : l'enregistrement cree quand meme la ligne et le compte applicatif.
Nom et prenom, telephone et adresse restent facultatifs ; chaque valeur vide est
conservee, y compris quand tous les champs sont effaces. Les limites sont de 120,
50 et 500 caracteres. Les caracteres de controle, notamment CR et LF, sont
refuses afin qu'une valeur ne puisse pas deborder sur une autre ligne. Les
valeurs ressemblant a des formules Sheets sont ecrites comme texte. Le profil
n'est pas publie ni partage avec les autres utilisateurs.

Le backend exige une ligne de profil avant toutes les actions de gestion des
outils (`list`, `create`, `update`, `delete`), et renvoie `PROFILE_REQUIRED`
sinon. Cette verification serveur complete le blocage de l'interface et empeche
le contournement par un appel API direct. Les utilisateurs deja connus par un
onglet d'outils mais absents de `Profils` doivent creer ce profil avant de
retrouver leur inventaire.

Depuis le menu du compte, l'utilisateur peut ouvrir et enregistrer son profil ou
demander sa suppression. La suppression requiert une confirmation explicite,
efface sa ligne dans `Profils` et supprime son onglet `u_<SHA-256 de l'e-mail>`
d'outils. Aucun e-mail ou nom d'onglet fourni par le navigateur ne participe a
la suppression. L'access token et le compte d'identite ne sont pas revoques ;
les fonctions restent bloquees jusqu'a la creation d'un nouveau profil, meme vide.

Toutes ces operations partagent le verrou Apps Script existant. Une liste
d'outils ne recree pas un onglet absent ; la premiere creation d'un outil le
recree seulement apres la creation du profil. Cette regle rend la suppression
effective apres rechargement. Google
Sheets ne fournit pas de transaction entre la suppression de la ligne et celle
de l'onglet ; en cas d'erreur ou d'interruption, la meme action peut etre
relancee pour terminer le nettoyage.

## Consequences

La feuille contient des coordonnees personnelles sensibles : le classeur et le
projet Apps Script doivent rester limites aux responsables de confiance. Toute
lecture retournee au navigateur est limitee a l'utilisateur authentifie. La
suppression est destructive et sans restauration applicative ; une sauvegarde
administrative peut conserver des copies selon la politique Google du classeur.
La suppression de profil n'est pas une suppression de compte chez le fournisseur
d'identite ni une revocation des jetons deja emis.

Les profils restent prives et ne sont pas utilises par le futur catalogue ou les
futures demandes. Une evolution de leur visibilite necessite un accord et une
decision d'architecture distincts.
