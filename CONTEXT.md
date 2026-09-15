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
