// Amorce de recette : évaluée dans la page par le testeur (passe visuelle).
// Ouvre une session avec le compte créé par `npm run seed:admin` :
//   npm run seed:admin -- --email admin@exemple.fr --prenom Cédric --nom Recette --mot-de-passe 'MotDePasse-Recette-1'
// Les données métier arrivent avec les features suivantes.
//
// L'outil (.claude/tools/passe-visuelle) enveloppe ce code dans une fonction asynchrone qu'il
// attend, puis recharge lui-même l'URL demandée : ce fichier ne navigue pas et écrit ses `await`
// au premier niveau, sinon la page est rechargée avant que le cookie de session soit posé.
const res = await fetch("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@exemple.fr", password: "MotDePasse-Recette-1" }),
});
if (!res.ok) {
  throw new Error(`amorce-recette : connexion refusée (${res.status}). Lancer d'abord npm run seed:admin avec admin@exemple.fr / MotDePasse-Recette-1.`);
}
