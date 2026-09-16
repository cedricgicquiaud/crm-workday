# Entretien de cadrage — 4.1 « Leads » (2026-09-16)

Entretien mené avec Cédric le 2026-09-16 (trois rounds, 27 questions, toutes tranchées ; récapitulatif confirmé par Cédric). Périmètre : le jalon 4.1 « Leads » de la feature 4 « Le pipeline commercial », pas le reste de la feature. Glossaire : section « La prospection » de `CONTEXT.md` (Lead, Origine, Avancement, Score, Besoin, Conversion), déjà ajoutée.

Décision de périmètre (Q2) : la roadmap prévoyait une conversion vers contact + entreprise + opportunité ; les opportunités n'existent qu'en 4.2, donc **4.1 convertit en personne (profil contact) + entreprise, sans opportunité**, et 4.2 ajoutera l'opportunité à la conversion.

**Le lead**
- **Contenu :** une fiche en texte libre, reliée à aucune personne ni entreprise du CRM. Elle porte prénom, nom, email, téléphone, LinkedIn, poste, nom de l'entreprise, besoin, origine, score, avancement et responsable.
- **Titre :** calculé, par exemple « Julie Martin · Banque X ».
- **Création :** il faut au moins un nom d'entreprise ou de personne, plus l'origine. Le score est facultatif. Si l'email appartient déjà à une personne ou à un lead en cours, un avertissement s'affiche sans bloquer.
- **Origine :** une liste fermée : LinkedIn, recommandation, appel d'offres, partenaire, autre.
- **Score :** de 1 à 3, saisi à la main.
- **Avancement :** nouveau, contacté, qualifié, converti, écarté.
  - On passe librement entre les trois premiers.
  - « Converti » ne se pose que par la conversion.
  - « Écarter » et « Rouvrir » sont deux actions ; « Rouvrir » remet à « contacté ».
  - Aucun passage automatique.
- **Objet complet :** liste, fiche, fil d'activité, champs personnalisés, vues, Cmd+K, archivage. Pas de fusion de leads.
- **Liste par défaut :** les leads en cours, les plus récents d'abord.

**La conversion**
- **Quand :** possible depuis nouveau, contacté ou qualifié. Refusée pour un lead converti, écarté ou archivé.
- **Ce qu'elle crée :** une personne avec un profil contact, et une entreprise. **Pas d'opportunité en 4.1** : elle arrive en 4.2, qui dira comment utiliser le besoin.
- **Minimum :** prénom, nom et entreprise. La fenêtre fait compléter ce qui manque ; le rôle dans la décision y est facultatif.
- **Retrouver la personne :** par l'email.
  - Si elle est déjà contact d'une autre entreprise, la fenêtre demande laquelle garder.
  - Si elle n'a qu'un profil consultant, elle reçoit le profil contact en plus.
  - Si le lead n'a pas d'email, une nouvelle personne est créée.
- **Retrouver l'entreprise :** la fenêtre propose les noms qui ressemblent. Une entreprise créée est de type « prospect » ; une entreprise existante garde son type.
- **Fiches archivées :** conversion refusée, avec un message qui nomme la fiche.
- **Fiches retrouvées :** rien n'est écrasé, seuls les champs vides sont remplis, et les différences sont affichées. Les champs personnalisés du lead ne sont pas recopiés.
- **Responsable :** les fiches créées prennent celui du lead ; les fiches retrouvées gardent le leur.
- **Après la conversion :** le lead reste en lecture seule et garde son fil d'activité. La personne et l'entreprise affichent « issu du lead … ». Un lead converti ne se supprime pas, il s'archive seulement.

**Ce qui est déjà écrit**
- `CONTEXT.md` a une nouvelle section « La prospection » : Lead, Origine, Avancement, Score, Besoin, Conversion.
- Je ne propose pas d'ADR (une note qui documente une décision d'architecture). Aucune décision n'est à la fois difficile à défaire et surprenante.

