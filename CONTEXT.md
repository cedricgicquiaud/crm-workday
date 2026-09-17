# crm-workday

CRM sur mesure d'un cabinet de conseil qui place des consultants Workday (salariés et freelances) chez des grands comptes. Lu par les agents avant de nommer quoi que ce soit.

## Vocabulaire

### Les gens et les structures

**Entreprise** :
Une société avec laquelle le cabinet travaille : prospect, client, partenaire, société de portage, ou société d'un consultant freelance. Une fiche, un type.
_Éviter_ : compte, organisation, société (seul)

**Personne** :
Une identité unique (nom, email, téléphone, LinkedIn) qui porte zéro, un ou deux profils. Une adresse email = une personne.
_Éviter_ : utilisateur, individu, candidat

**Profil** :
Une casquette attachée à une personne : contact ou consultant. Une personne peut porter les deux.
_Éviter_ : rôle, type de personne

**Contact** :
Le profil d'une personne rattachée à une entreprise cliente ou prospect, avec un poste et un rôle dans la décision.
_Éviter_ : interlocuteur, décideur (c'est un rôle, pas le profil)

**Consultant** :
Le profil d'une personne que le cabinet place en mission : un statut, des modules Workday, un coût journalier, une disponibilité.
_Éviter_ : ressource, freelance (c'est un statut), collaborateur

**Utilisateur** :
Un membre de l'équipe du cabinet qui a un compte dans le CRM (administrateur ou membre). Jamais une personne du CRM.
_Éviter_ : compte, user

### Le consultant

**Statut** :
La forme du lien entre le cabinet et un consultant : salarié, freelance ou portage.
_Éviter_ : type de contrat, régime

**Module Workday** :
Un domaine fonctionnel de Workday (HCM, Payroll, Integration, Finance…) qu'un consultant maîtrise. Un consultant en porte plusieurs, certains certifiés.
_Éviter_ : compétence, skill, spécialité

**Certifié** :
Marque qu'un consultant détient la certification Workday officielle d'un module qu'il porte.
_Éviter_ : expert, senior

**Société de facturation** :
L'entreprise qui facture le cabinet pour un consultant : la sienne pour un freelance, la société de portage pour un porté. Aucune pour un salarié.
_Éviter_ : employeur, structure

**Coût journalier** :
Ce que le consultant coûte au cabinet par jour : coût chargé d'un salarié, TJM d'achat d'un freelance ou d'un porté.
_Éviter_ : TJM (seul, ambigu avec le TJM de vente), salaire, tarif

**Disponible à partir du** :
La date à laquelle un consultant peut commencer une mission.
_Éviter_ : fin de mission, libre le

**État** :
La situation dérivée d'un consultant : disponible, en mission ou indisponible. Ne se saisit pas.
_Éviter_ : statut (réservé au lien salarié / freelance / portage), disponibilité

**À replacer** :
Mention portée par un salarié disponible : un coût qui court sans mission.
_Éviter_ : en intercontrat, en attente

### La prospection

**Lead** :
Une piste commerciale notée en texte libre : quelqu'un ou un besoin repéré, qui n'est ni une personne ni une entreprise du CRM tant qu'il n'est pas converti.
_Éviter_ : prospect (c'est un type d'entreprise), piste, contact froid

**Origine** :
Le canal par lequel un lead est arrivé : LinkedIn, recommandation, appel d'offres, partenaire ou autre.
_Éviter_ : source, canal

**Avancement** :
Où en est un lead : nouveau, contacté, qualifié, converti ou écarté. Converti et écarté sont des fins.
_Éviter_ : statut (réservé au consultant), étape (réservée au pipeline)

**Score** :
L'appréciation, de 1 à 3, que l'équipe porte sur les chances d'un lead.
_Éviter_ : note, priorité, chaleur

**Besoin** :
Ce que le lead laisse entrevoir d'une demande Workday, en texte libre, avant qu'il existe une opportunité.
_Éviter_ : demande, projet, opportunité (c'est l'objet qualifié)

**Conversion** :
Le passage d'un lead à une personne avec un profil contact, rattachée à une entreprise. Le lead converti reste comme trace et ne se modifie plus.
_Éviter_ : transformation, qualification (c'est un avancement)

### Les affaires

**Opportunité** :
Un besoin Workday précis chez une entreprise, que le cabinet cherche à gagner en y plaçant un consultant. Elle naît de rien ou de la conversion d'un lead.
_Éviter_ : affaire (seul), deal, projet, besoin (c'est le texte qui la décrit)

**Étape** :
Où en est une opportunité dans le pipeline : nouveau besoin, qualifié, profils proposés, entretien client, proposition envoyée, négociation, puis gagnée ou perdue. Gagnée et perdue sont des fins, posées par une action.
_Éviter_ : statut (réservé au consultant), avancement (réservé au lead), phase

**Probabilité** :
Les chances de gagner une opportunité, en pourcentage, déduites de son étape. Ne se saisit pas.
_Éviter_ : chance, score (réservé au lead), confiance

**Clôture prévue** :
La date à laquelle l'équipe pense savoir si l'opportunité est gagnée ou perdue.
_Éviter_ : échéance, date de fin, deadline

**TJM de vente** :
Le prix d'une journée de consultant facturé au client, hors taxes. « TJM de vente cible » sur l'opportunité, « TJM de vente proposé » sur une proposition.
_Éviter_ : TJM (seul, ambigu avec le coût journalier), tarif, prix

**Montant estimé** :
Le TJM de vente cible multiplié par la durée estimée en jours. Calculé, jamais saisi.
_Éviter_ : valeur, chiffre d'affaires (réservé au facturé), budget

**Proposition** :
Un consultant présenté au client sur une opportunité, avec son résultat et son TJM de vente proposé.
_Éviter_ : candidature, positionnement, profil proposé (sauf dans le nom de l'étape « Profils proposés », repris du PRD)

**Résultat** :
Où en est une proposition : proposé, entretien, retenu ou refusé. Un seul consultant retenu par opportunité.
_Éviter_ : état (réservé au consultant), statut, décision

**Gagnée le, perdue le** :
La date à laquelle une opportunité a été marquée gagnée ou perdue. Vidée quand elle est rouverte.
_Éviter_ : date de fin, date de clôture (confondue avec la clôture prévue)

**Motif de perte** :
La raison, choisie dans une liste fermée, pour laquelle une opportunité est perdue : prix, profil non retenu, concurrent, projet abandonné ou reporté, pas de réponse, autre.
_Éviter_ : cause, raison (seul)
