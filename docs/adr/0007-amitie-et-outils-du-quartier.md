# ADR 0007 : Demandes d'amitie et outils du quartier

Date : 2026-10-27, complete le 2026-10-28. Statut : Accepte avec accord explicite
des responsables.

## Contexte

Le besoin ajoute les demandes d'ami par e-mail, les listes d'amis et de demandes,
ainsi que la consultation des outils `shared=true` des amis. Les ADR 0004 et 0006
limitaient jusque-la les donnees au compte courant et declaraient les profils
prives. Les responsables ont explicitement approuve l'ajout du perimetre social
et la visibilite entre amis des champs nom/prenom, telephone et adresse physique.
Ils ont egalement approuve que chacun des deux participants puisse supprimer une
demande en attente ou rompre une amitie acceptee.

## Decision

Utiliser une feuille `Amities` privee au meme classeur que les profils et les
outils. Ses en-tetes sont exactement `email_1`, `email_2`, `demandeur`, `statut`.
Les e-mails sont normalises (espaces retires, minuscules) et la paire est stockee
dans l'ordre lexicographique croissant. Une paire ne peut apparaitre qu'une fois.
Les statuts stockes sont `en attente` et `accepté`.

Toutes les actions sociales exigent un profil present et un access token valide.
Le serveur derive l'identite courante du JWT et ne fait confiance a aucun e-mail,
demandeur, statut, nom d'onglet ou numero de ligne fourni par le client. L'envoi
valide le format de l'e-mail, refuse l'auto-demande et n'enregistre qu'une
destination ayant deja un profil. Pour ne pas transformer le formulaire en
annuaire de comptes, l'API renvoie le meme resultat generique si le compte cible
n'existe pas, ou si une relation existe deja. Les demandes croisees ne sont pas
converties : la demande existante reste a traiter par son destinataire.

Seul le destinataire d'une demande `en attente` peut l'accepter ou la refuser.
L'acceptation conserve la ligne et met le statut a `accepté` ; le refus supprime
la ligne. Les listes envoyees ne revelent que l'e-mail cible ; les listes recues
ne revelent que l'e-mail du demandeur. Aucun champ de profil n'est retourne tant
que l'amitie n'est pas acceptee.

L'action `removeFriendship` permet a chacun des deux participants de supprimer
une demande en attente ou une amitie acceptee. Le client fournit uniquement
l'adresse de l'autre participant ; le serveur derive l'acteur de l'e-mail du JWT
verifie, normalise la paire et recherche la ligne correspondante. La suppression
n'est permise que si l'acteur figure dans l'une des deux colonnes de cette ligne.
Aucun statut ni numero de ligne fourni par le client n'autorise l'operation.
Une ligne absente retourne `NOT_FOUND` sans divulguer l'existence d'une relation
entre d'autres comptes. La rupture d'une amitie retire l'acces reciproque aux
champs de profil et aux outils `shared=true` des prochaines lectures. L'action
exige un profil existant et utilise le verrou Apps Script partage avec les
autres mutations ; aucune notification en temps reel n'est declenchee.

La liste des amis acceptes retourne les champs nom/prenom, telephone et adresse
physique de ces seuls amis. Le serveur lit les onglets derives de leurs e-mails
uniquement apres avoir verifie l'amitie acceptee, et ne retourne que les outils
dont `shared` vaut strictement `true`. Il ne retourne jamais les outils prives.
L'interface presente ces outils dans « Les outils du quartier » accessible depuis
le menu latéral « Mon espace » ; la vue propose recherche, filtre par categorie
et etat ; le proprietaire peut retirer un outil du catalogue en mettant `shared`
a `false`.

Un point rouge indique les demandes recues. Le compteur est controle a la
connexion puis a l'ouverture ou a l'actualisation de la page « Mes amis » ; aucun
polling ni notification push n'est mis en place. La suppression d'un profil,
deja confirmee selon l'ADR 0006, retire aussi toutes les relations et demandes
du compte avant de supprimer ses outils. Les mutations utilisent le verrou
Apps Script existant.

L'interface propose une confirmation avant de resilier une demande ou de rompre
une amitie. Une demande supprimee ne peut plus etre acceptee ; une amitie rompue
ne peut etre retablie que par une nouvelle demande acceptee. La liste est
rechargee apres l'action.

## Consequences

Les responsables du classeur conservent l'acces aux donnees personnelles. Les
utilisateurs doivent etre avertis que les trois champs du profil sont visibles
par leurs amis acceptes ; ils ne sont jamais publies aux autres comptes. Le
compte destinataire n'est pas enumerable par la reponse de l'envoi, mais les
editeurs du classeur voient les relations.

La lecture du voisinage parcourt les relations et les onglets des amis, sans
pagination. Elle reste reservee a un petit collectif et consomme les quotas
Google ; aucune transaction Sheets ne couvre plusieurs suppressions. Les tests
locaux ne remplacent pas la recette Apps Script et CORS avec deux vrais comptes.
Chaque utilisateur peut mettre fin a une demande ou a une amitie sans consentement
de l'autre ; cette suppression est irreversible depuis l'application.
