# Cahier de recette — crm-workday

Une section par feature, ajoutée à son cadrage. Chaque ligne est un constat observable,
coché à la recette humaine.

## Feature 1 — L'équipe entre dans le CRM

Chaque livraison remplit uniquement sa sous-section. Les titres et lignes d'introduction ne bougent pas.

### 1.1 Première page en ligne

Recette du socle, sur un clone frais avec Docker démarré.

- [ ] `docker compose up -d`, `cp .env.example .env.local`, `npm ci`, `npm run db:migrate`, `npm test` : tout passe au vert.
- [ ] `npm run dev` puis `http://localhost:3000/` : renvoie vers la page de connexion.
- [ ] `http://localhost:3000/api/health` : `status ok`, `version` égale à celle de `package.json`, `commit` égal à `git rev-parse --short HEAD`.
- [ ] Sans `DATABASE_URL` dans `.env.local`, `npm run db:migrate` s'arrête en nommant la variable.
- [ ] `npm run test:e2e` passe au vert.

### 1.2a Connexion, invitation, réinitialisation

Préparation : `npm run db:migrate`, puis `npm run seed:admin -- --email admin@exemple.fr --prenom Cédric --nom Recette --mot-de-passe 'MotDePasse-Recette-1'`, puis `npm run dev`. Les emails ne partent pas : ils sont lus dans la table `email_log` (colonne `body`, le lien y figure) ou par `npx tsx e2e/fixtures/auth.ts last-email <adresse>`.

- [ ] Relancer la même commande `npm run seed:admin` : elle s'arrête avec « un administrateur existe déjà » et ne crée rien (contrat 20).
- [ ] `npm run seed:admin -- --email x@exemple.fr` sans les autres arguments s'arrête en nommant les champs manquants.
- [ ] `http://localhost:3000/parametres/journal` sans être connecté renvoie vers `/connexion?next=%2Fparametres%2Fjournal` ; `http://localhost:3000/api/health` et `/connexion` restent servis sans session (contrat 19).
- [ ] Sur `/connexion`, saisir `personne@exemple.fr` / `MotDePasse-Faux-1` puis `admin@exemple.fr` / `MotDePasse-Faux-1` : les deux affichent exactement « Email ou mot de passe incorrect. » (contrat 14).
- [ ] Saisir `admin@exemple.fr` / `MotDePasse-Recette-1` depuis l'écran précédent (arrivé avec `?next=`) : la page `Paramètres > Journal` demandée s'ouvre ; `/accueil` affiche « Bonjour Cédric » (contrat 6).
- [ ] Se déconnecter (supprimer le cookie `better-auth.session_token` dans le navigateur), puis cinq fois `admin@exemple.fr` / `MotDePasse-Faux-1`, puis une sixième fois avec le bon mot de passe `MotDePasse-Recette-1` : refus avec le même message « Email ou mot de passe incorrect. » ; 15 minutes plus tard, le bon mot de passe passe (contrat 15).
- [ ] Session glissante (contrat 8) : connecté, dans la table `session`, mettre `expires_at` à demain et `created_at` / `updated_at` à il y a 29 jours ; recharger `/accueil` : toujours connecté, `expires_at` est repoussé à dans 30 jours. Mettre `expires_at` à hier ; recharger : renvoi vers `/connexion`.
- [ ] Invitation : connecté en administrateur, `curl -X POST http://localhost:3000/api/invitations -H 'content-type: application/json' -H 'cookie: better-auth.session_token=<valeur du cookie>' -d '{"email":"invite@exemple.fr","firstName":"Inès","lastName":"Roux","role":"membre"}'` répond `201` ; la table `user` a `invite@exemple.fr` à l'état `invite` ; `email_log` contient un email « Votre accès au CRM de votre cabinet » avec un lien `/invitation/<jeton>` (D7).
- [ ] Le même appel avec le cookie d'un membre répond `403` ; sans cookie, `401` (contrat 16, préparé).
- [ ] Le même appel avec `admin@exemple.fr` répond `409` avec `"status":"actif"` (D12).
- [ ] Ouvrir le lien `/invitation/<jeton>` dans une fenêtre privée : « Choisissez votre mot de passe ». Saisir `Court-Mdp-1` deux fois : « Le mot de passe doit contenir 12 caractères au moins. » (contrat 13). Saisir `MotDePasse-Invite-1` deux fois : arrivée sur `/accueil`, « Bonjour Inès » (contrat 6).
- [ ] Rouvrir le même lien `/invitation/<jeton>` (fenêtre privée neuve) : « Lien invalide », aucun formulaire (contrat 12). Idem après avoir mis `expires_at` de la ligne `invitation` à hier pour une invitation non utilisée.
- [ ] `curl -X POST http://localhost:3000/api/invitations/renvoyer … -d '{"email":"<un invité non encore activé>"}'` en administrateur : un nouvel email part avec un lien neuf ; l'ancien lien affiche « Lien invalide » (D7).
- [ ] `/connexion` > « Mot de passe oublié ? » > `admin@exemple.fr` : « Si un compte existe pour cette adresse, un email vient de partir. » ; `email_log` contient « Réinitialisation de votre mot de passe » avec un lien `/reinitialisation/<jeton>` (contrat 9).
- [ ] Même écran avec `personne@exemple.fr`, puis avec un compte passé à `status = 'desactive'` dans la table `user` : même phrase, aucune ligne nouvelle dans `email_log` (contrat 14).
- [ ] Suivre le lien `/reinitialisation/<jeton>` : « Choisissez un nouveau mot de passe » ; saisir `MotDePasse-Recette-2` deux fois : retour sur `/connexion` avec « Votre mot de passe a été modifié. Connectez-vous. » ; `MotDePasse-Recette-1` est refusé, `MotDePasse-Recette-2` connecte (contrat 9).
- [ ] Rouvrir le même lien `/reinitialisation/<jeton>` : « Lien invalide » (contrat 12). Un lien de plus d'une heure (`expires_at` à hier dans la table `verification`) : idem.
- [ ] Un compte à `status = 'desactive'` avec un bon mot de passe : « Email ou mot de passe incorrect. » (D12).
- [ ] Écrans `/connexion`, `/reinitialisation`, `/reinitialisation/<jeton>`, `/invitation/<jeton>` à 375 px : aucun défilement horizontal, un seul titre `<h1>`.

### 1.2b Gestion des comptes et profil

Préparation : base migrée et `admin@exemple.fr` / `MotDePasse-Recette-1` créé (voir 1.2a), puis `npm run dev`. Écrans : `http://localhost:3000/parametres/comptes` (administrateurs) et `http://localhost:3000/profil`. Les emails ne partent pas : lire `email_log` ou `npx tsx e2e/fixtures/auth.ts last-email <adresse>`.

- [ ] Connecté en administrateur, ouvrir `/parametres/comptes` : le titre « Comptes » et un tableau (Nom, Email, Rôle, État) ; `admin@exemple.fr` y figure en « Administrateur » avec un badge « Actif » (point plein, teinte succès). Un seul bouton plein sur l'écran : « Inviter ».
- [ ] Cliquer « Inviter », saisir `ines.roux@exemple.fr`, prénom `Inès`, nom `Roux`, rôle « Membre », puis « Envoyer l'invitation » : le dialogue se ferme, la ligne « Invitation envoyée à ines.roux@exemple.fr. » s'affiche, la ligne « Inès Roux » apparaît avec le badge « Invité » (teinte avertissement) ; `email_log` contient « Votre accès au CRM de votre cabinet » avec un lien `/invitation/<jeton 1>` (contrat 5).
- [ ] Ouvrir le lien `/invitation/<jeton 1>` dans une fenêtre privée : « Choisissez votre mot de passe ». Ne rien saisir, revenir à la liste.
- [ ] Sur la ligne d'Inès, menu « Actions » (bouton à trois points) > « Renvoyer l'invitation » : « Invitation renvoyée à ines.roux@exemple.fr. » ; un nouvel email contient un lien `/invitation/<jeton 2>` différent. En fenêtre privée, `<jeton 1>` affiche « Lien invalide » sans formulaire ; `<jeton 2>` affiche « Choisissez votre mot de passe » (contrat 7). Choisir `MotDePasse-Ines-1` deux fois : arrivée sur `/accueil`, « Bonjour Inès » ; dans la liste, Inès passe « Actif ».
- [ ] « Inviter » avec l'email `admin@exemple.fr` (prénom et nom quelconques) : refus dans le dialogue avec le message « Un compte existe déjà pour admin@exemple.fr : Cédric Recette (actif). », aucun bouton « Réactiver ce compte », aucune ligne nouvelle (contrat 18).
- [ ] « Inviter » avec un email mal formé (`pas-un-email`) et un prénom vide : le dialogue reste ouvert, aucun encadré global ; sous le champ Email, « Cet email n'est pas valide. », sous le champ Prénom, « Le prénom est requis. » (11 px, couleur danger, champ bordé en rouge) ; le premier champ fautif reçoit le focus. Email vidé : « L'email est requis. ».
- [ ] Menu « Actions » d'Inès > « Désactiver » : « Compte de Inès Roux désactivé. », badge « Désactivé » (gris, point creux). Dans la fenêtre privée où Inès est connectée, recharger `/accueil` : renvoi vers `/connexion`. Saisir `ines.roux@exemple.fr` / `MotDePasse-Ines-1` : « Email ou mot de passe incorrect. » (contrat 10). Dans la table `session`, plus aucune ligne pour Inès.
- [ ] « Inviter » de nouveau avec `ines.roux@exemple.fr` : message « Un compte existe déjà pour ines.roux@exemple.fr : Inès Roux (désactivé). » et un bouton « Réactiver ce compte » ; le cliquer : le dialogue se ferme, « Compte de Inès Roux réactivé. », badge « Actif ». Inès se reconnecte avec `MotDePasse-Ines-1` (contrat 10, D12). Le menu « Actions » d'un compte désactivé propose aussi « Réactiver ».
- [ ] Inès connectée dans deux navigateurs (ou une fenêtre normale et une privée). Menu « Actions » d'Inès > « Fermer toutes les sessions » : « Sessions de Inès Roux fermées : il devra se reconnecter. » ; recharger chacun des deux navigateurs : renvoi vers `/connexion` ; `MotDePasse-Ines-1` reconnecte, le badge reste « Actif » (contrat 11).
- [ ] Menu « Actions » d'Inès > « Passer administrateur » : « Inès Roux est maintenant administrateur. », colonne Rôle « Administrateur » ; puis « Passer membre » : retour à « Membre » (D11).
- [ ] Dernier administrateur (contrat 17) : avec `admin@exemple.fr` seul administrateur actif, son menu « Actions » montre « Passer membre » et « Désactiver » grisés, sous-titrés « Dernier administrateur actif » ; les cliquer ne fait rien. Avec le cookie d'un administrateur : `curl -X PATCH http://localhost:3000/api/accounts/<id de admin@exemple.fr> -H 'content-type: application/json' -H 'cookie: better-auth.session_token=<valeur>' -d '{"status":"desactive"}'` répond `409` avec `"error":"dernier_administrateur"` ; idem avec `-d '{"role":"membre"}'`. Passer Inès administrateur : les deux entrées du menu de `admin@exemple.fr` redeviennent actives.
- [ ] Connecté en membre (Inès repassée membre), ouvrir `http://localhost:3000/parametres/comptes` : renvoi vers `/accueil`. Avec son cookie, `curl http://localhost:3000/api/accounts -H 'cookie: …'` répond `403` `"error":"reserve_aux_administrateurs"` ; sans cookie, `401`. `/parametres/journal` s'ouvre pour elle (contrat 16).
- [ ] Toujours en membre, `curl -X POST http://localhost:3000/api/accounts …`, `curl -X PATCH http://localhost:3000/api/accounts/<id> …` et `curl -X DELETE http://localhost:3000/api/accounts/<id>/sessions …` répondent tous `403` (contrat 16).
- [ ] Inès ouvre `http://localhost:3000/profil` : « Mon profil », formulaire « Identité » pré-rempli (Prénom `Inès`, Nom `Roux`, email affiché non modifiable). Remplacer le prénom par `Inés`, « Enregistrer » : « Profil enregistré. » ; `/accueil` affiche « Bonjour Inés » (CRM-21). Prénom vidé puis « Enregistrer » : « Le prénom et le nom sont requis. ».
- [ ] Sur `/profil`, formulaire « Mot de passe » : mot de passe actuel `MotDePasse-Ines-1`, nouveau `Court-Mdp-1` deux fois, « Changer le mot de passe » : « Le mot de passe doit contenir 12 caractères au moins. » sous le champ « Nouveau mot de passe », bordé en rouge, sans encadré global (contrat 13). Nouveau `MotDePasse-Ines-2` et confirmation `MotDePasse-Ines-3` : « Les deux mots de passe ne sont pas identiques. » sous la confirmation. Actuel `MotDePasse-Faux-1`, nouveau et confirmation `MotDePasse-Ines-2` : « Le mot de passe actuel est incorrect. » sous « Mot de passe actuel ».
- [ ] Actuel `MotDePasse-Ines-1`, nouveau et confirmation `MotDePasse-Ines-2` : « Mot de passe modifié. », les champs se vident. Se déconnecter (supprimer le cookie) : `MotDePasse-Ines-1` est refusé, `MotDePasse-Ines-2` connecte.
- [ ] Écrans `/parametres/comptes` (liste et dialogue « Inviter » ouvert) et `/profil` à 375 px : aucun défilement horizontal de la page (le tableau défile dans son cadre), un seul titre `<h1>` (« Paramètres », « Mon profil »).

### 1.4 Emails sortants

En attente de la livraison.

### 1.3 Coque de navigation

En attente de la livraison.
