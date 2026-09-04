# Cadrage — feature 1 « L'équipe entre dans le CRM »

Statut : **validé** le 2026-09-04 (v2, relue par le contradicteur). Feature Linear `fd8b6c31…`, statut « À cadrer ».
Livraisons prévues : 1.1 Première page en ligne · 1.2 Connexion, comptes, rôles · 1.3 Coque de navigation · 1.4 Emails sortants.
Les dix réponses aux questions du contradicteur ont été acceptées.

## Décisions produit

### Socle et méthode
1. **Le squelette (1.1) est posé hors boucle d'agents.** Le producteur `tdd-writer` n'installe jamais de dépendance et exige un cadre de test déjà présent. La livraison 1.1 (Next.js, TypeScript, Tailwind + shadcn/ui, Drizzle + Postgres, Better Auth, Vitest, Playwright, pg-boss, Resend + React Email) est produite par Claude en session, en une PR, avec un premier test vert. Les livraisons 1.2 à 1.4 passent par la boucle.
2. **Une seule langue, un seul fuseau, une seule devise** : interface en français, dates en `Europe/Paris`, montants en euros. Aucune internationalisation dans le code.
3. **Postgres local en développement** via Docker Compose, même base pour les tests (schéma réinitialisé à chaque exécution). Aucun service payant requis pour développer : en développement et en test, les emails sont capturés (D22) et la clé Resend n'est pas requise. Les variables requises sont listées par environnement dans `.env.example`.
4. **Migrations Drizzle versionnées** dans le dépôt ; le schéma ne se modifie jamais à la main.
5. **Page d'accueil après connexion** : une page « Accueil » vide mais réelle (salutation, date, emplacement du futur tableau de bord). Une route de santé `/api/health` répond `200` avec la version de `package.json` et le commit court.
6. **Deux commandes de test** : `npm test` (Vitest, unitaire et intégration sur la base Docker) et `npm run test:e2e` (Playwright, écrans). Toute livraison qui touche un écran est validée par les deux.

### Comptes et connexion (1.2)
7. **Pas d'inscription libre.** Un administrateur crée un compte avec email, prénom, nom et rôle ; l'invité reçoit un lien pour choisir son mot de passe. Le lien vaut 72 heures et une seule fois. Tant que le mot de passe n'est pas choisi, le compte est à l'état « invité », visible dans la liste, avec un bouton « Renvoyer l'invitation » qui génère un lien neuf et invalide l'ancien. Si l'email d'invitation échoue (Resend indisponible), le compte est créé quand même, l'échec est au journal, et « Renvoyer » génère un lien neuf.
8. **Le premier administrateur est créé par une commande d'amorçage** `npm run seed:admin`, jamais par l'interface. Elle lit email, prénom, nom et mot de passe dans ses arguments ou dans l'environnement, et refuse de s'exécuter si un administrateur existe déjà.
9. **Connexion par email et mot de passe.** Mot de passe de 12 caractères au moins ; réinitialisation par email avec lien à usage unique (1 heure). Pas de connexion Google ni de double authentification en V1 (à revoir avant l'ouverture aux consultants, feature 13). « Mot de passe oublié » affiche toujours « si un compte existe pour cette adresse, un email vient de partir », et n'envoie rien pour un email inconnu ou un compte désactivé.
10. **Session de 30 jours glissants** : toute activité repousse l'expiration de 30 jours. La déconnexion ferme la session courante ; un administrateur peut fermer toutes les sessions d'un compte.
11. **Deux rôles, tout le monde voit tout.** *Administrateur* : gère les comptes, la configuration du cabinet, les modèles d'emails, l'envoi d'un email de test. *Membre* : tout le reste, y compris la lecture du journal des envois. Aucun cloisonnement de données entre membres.
12. **Un compte se désactive, ne se supprime jamais.** Un compte désactivé ne se connecte plus, ses sessions sont fermées, ce qu'il a créé reste attribué à son nom. Le dernier administrateur actif ne peut pas être désactivé ni rétrogradé. Un administrateur peut réactiver un compte désactivé ; inviter un email qui a déjà un compte est refusé (actif) ou propose la réactivation (désactivé).
13. **Chaque personne a une page « Mon profil »** : prénom, nom, mot de passe, thème.
14. **Limitation des tentatives** : après cinq échecs en 15 minutes sur une même adresse email, connue ou non, toute tentative sur cette adresse est refusée 15 minutes. Le message est le même que pour un mot de passe faux, dans tous les cas : on n'indique jamais si l'email existe ni si l'adresse est verrouillée.

### Coque de navigation (1.3)
15. **Barre latérale** repliable avec, en V1 de la coque : Accueil, Paramètres, Mon profil, et une section « Objets » vide que chaque feature suivante remplit. Les vues sauvegardées épinglées (feature 2) s'y logeront.
16. **Palette Cmd+K** livrée avec la navigation et les actions de la coque (aller à une page, changer de thème, se déconnecter). Une feature suivante ajoute ses entrées en s'enregistrant auprès de la palette, sans modifier les fichiers de la palette.
17. **Thème clair, sombre ou système**, mémorisé par utilisateur côté serveur, appliqué dès le premier rendu serveur (la classe du thème est dans le HTML servi). Les pages sans session (connexion, invitation, réinitialisation) suivent la préférence du navigateur.
18. **Téléphone** : à 375 px de large, chaque page de la feature 1 (connexion, invitation, réinitialisation, accueil, profil, comptes, modèles, journal) s'affiche sans défilement horizontal et toutes ses actions restent atteignables ; la barre latérale devient un tiroir.
19. **Le système de design** (`.pilot/design/`) s'applique s'il est déposé avant la production de 1.3 ; sinon, shadcn/ui par défaut avec les tokens neutres, et la charte se posera en retouche isolée.

### Emails sortants (1.4)
20. **Paramètres → Cabinet** : nom du cabinet, nom d'affichage et adresse d'expédition. Les données légales (SIREN, TVA, IBAN…) arrivent avec la feature 7.
21. **Envoi par Resend**, expéditeur unique tiré des paramètres du cabinet, domaine vérifié (tâche CRM-1). Aucun email ne part sans expéditeur configuré.
22. **Modèles modifiables dans l'interface** par un administrateur : sujet et corps avec variables `{{prenom}}`, `{{nom}}`, `{{cabinet}}`, `{{lien}}` ; variables disponibles listées à côté de l'éditeur ; aperçu rendu avec des valeurs d'exemple. Les modèles système (« Invitation », « Réinitialisation ») ne sont pas supprimables et ont des variables obligatoires (`{{lien}}`) sans lesquelles ils ne s'enregistrent pas.
23. **Journal des envois** : destinataire, sujet, modèle, date, statut (envoyé, échec avec motif, capturé), auteur (utilisateur ou système), et une référence d'objet facultative (type + id) que les features suivantes rempliront pour afficher l'email sur la fiche. Consultable dans Paramètres, filtrable par statut, par date et par objet.
24. **Un envoi échoué n'est pas retenté automatiquement en V1** ; il apparaît en échec avec un bouton « Renvoyer » (pour une invitation ou une réinitialisation, avec un lien neuf). Les relances automatiques (feature 8) décideront de leur propre politique.
25. **En développement et en test, aucun email ne part** : l'envoi est capturé (boîte locale visible dans l'application) et le journal le marque « capturé ». Un envoi réel est vérifié à la recette humaine avec la vraie clé, puis à la mise en service (feature 9).

## Contrat de validation

### Socle (1.1)
1. `npm test` exécute Vitest et passe au vert sur un dépôt fraîchement cloné avec la base Docker démarrée ; `npm run test:e2e` exécute Playwright et passe au vert.
2. `npm run dev` sert la page de connexion sur `http://localhost:3000/` ; `/api/health` répond `200` avec la version de `package.json` et le commit court, identiques à ceux du dépôt.
3. Une migration Drizzle appliquée deux fois de suite ne change rien la seconde fois.
4. Refus : une variable requise pour l'environnement courant absente arrête le démarrage avec son nom dans le message ; en développement, l'absence de clé Resend n'empêche pas le démarrage.

### Comptes et connexion (1.2)
5. Un administrateur crée un compte avec email, prénom, nom et rôle ; la personne reçoit un email d'invitation dont le lien ouvre le choix du mot de passe ; le compte apparaît « invité » dans la liste jusque-là.
6. Après avoir choisi son mot de passe, l'invité est connecté et arrive sur Accueil, salué par son prénom.
7. « Renvoyer l'invitation » envoie un lien neuf ; l'ancien lien affiche « lien invalide ».
8. Un membre actif au jour 29 est encore connecté au jour 45 ; un membre inactif 31 jours doit se reconnecter.
9. « Mot de passe oublié » envoie un lien qui, suivi, permet de choisir un nouveau mot de passe ; l'ancien ne fonctionne plus.
10. Un administrateur désactive un compte : la personne est déconnectée à sa prochaine requête et ne peut plus se connecter ; son nom reste affiché sur ce qu'elle a créé ; réactivé, le compte se reconnecte avec le même mot de passe.
11. Un administrateur ferme toutes les sessions d'un compte : ce compte doit se reconnecter sur chacun de ses navigateurs.
12. Refus : un lien d'invitation ou de réinitialisation déjà utilisé, ou expiré, affiche « lien invalide » et ne permet rien.
13. Refus : un mot de passe de 11 caractères est rejeté avec le message de la règle.
14. Refus : un email inconnu et un mot de passe faux produisent exactement le même message ; « mot de passe oublié » sur un email inconnu ou désactivé affiche le même écran que pour un compte actif et n'envoie rien.
15. Refus : après cinq échecs en 15 minutes sur une adresse, connue ou non, la sixième tentative est refusée avec le même message, même avec le bon mot de passe, jusqu'à la fin du délai.
16. Refus : un membre qui ouvre la gestion des comptes, les modèles ou l'envoi de test est renvoyé vers Accueil, et l'appel serveur répond `403` ; le journal, lui, s'ouvre.
17. Refus : le dernier administrateur actif ne peut être ni désactivé ni passé membre ; le bouton est inactif et l'appel serveur répond `409`.
18. Refus : inviter un email qui a déjà un compte actif est refusé avec un message qui nomme le compte.
19. Refus : hors connexion, invitation, réinitialisation et santé, aucune page n'est servie sans session ; l'appel renvoie vers la connexion en conservant la page demandée.
20. Refus : `npm run seed:admin` refuse de s'exécuter si un administrateur existe déjà.

### Coque (1.3)
21. La barre latérale montre Accueil, Paramètres et Mon profil ; repliée, elle se souvient de son état d'une page à l'autre.
22. Cmd+K (Ctrl+K sur Windows) ouvre la palette ; taper « para » puis Entrée ouvre Paramètres ; « sombre » bascule le thème.
23. Un module de test enregistre une entrée « Test » auprès de la palette sans modifier aucun fichier de la palette, et l'entrée apparaît dans Cmd+K.
24. Le thème choisi dans Mon profil est le même après déconnexion et reconnexion sur un autre navigateur ; avant connexion, la page suit la préférence du navigateur.
25. À 375 px de large, chacune des huit pages de la feature (D18) s'affiche sans défilement horizontal, et son action principale est atteignable ; la barre latérale est un tiroir ouvert par un bouton.
26. Refus : le HTML servi par le serveur pour un utilisateur en thème sombre porte déjà la classe du thème sombre, avant toute exécution de script.

### Emails sortants (1.4)
27. Un administrateur renseigne le nom du cabinet, le nom d'affichage et l'adresse d'expédition ; la prochaine invitation part de cette adresse avec `{{cabinet}}` rempli.
28. Un administrateur modifie le modèle « Invitation », l'aperçu se met à jour avec des valeurs d'exemple, et la prochaine invitation part avec ce texte.
29. Chaque envoi crée une ligne de journal avec destinataire, sujet, modèle, date, statut, auteur et référence d'objet (vide en feature 1) ; un envoi échoué porte le motif renvoyé par Resend et un bouton « Renvoyer ».
30. Un administrateur envoie un email de test depuis Paramètres à sa propre adresse ; à la recette, avec la vraie clé, il le reçoit.
31. Refus : un modèle contenant une variable inconnue (`{{prénom}}` avec accent, `{{societe}}`) n'est pas enregistré ; le message nomme la variable fautive.
32. Refus : le modèle « Invitation » ou « Réinitialisation » sans `{{lien}}` n'est pas enregistré ; ces deux modèles ne peuvent pas être supprimés, l'appel serveur répond `409`.
33. Refus : sans expéditeur configuré, toute tentative d'envoi échoue avec « expéditeur non configuré » et le journal le consigne.
34. Refus : en environnement de test, aucun appel réseau vers Resend n'a lieu ; l'email est capturé et marqué « capturé » dans le journal.
35. Refus : un destinataire qui n'est pas une adresse email valide est refusé avant tout envoi.
