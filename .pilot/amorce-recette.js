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

// Livraison 2.1a — trois entreprises pour la recette. Bloc idempotent : chaque entreprise porte un
// SIREN fixe, une relance répond 409 (SIREN déjà porté) et le refus est ignoré.
const entreprises = [
  { name: "Banque Solveige", type: "client", siren: "552081317", website: "https://www.banque-solveige.fr", city: "Paris", postalCode: "75008", street: "18 avenue de Messine", billingEmail: "compta@banque-solveige.fr", sector: "Banque" },
  { name: "Assurances Vaubourg", type: "prospect", siren: "732829320", website: "https://www.vaubourg-assurances.fr", city: "Lyon", postalCode: "69002", street: "4 place Bellecour", sector: "Assurance" },
  { name: "Groupe Ferrandi", type: "partenaire", siren: "842051701", city: "Nantes", postalCode: "44000", street: "9 rue Crébillon", paymentTerms: "45_jours_fin_de_mois", sector: "Industrie" },
];
for (const entreprise of entreprises) {
  const creation = await fetch("/api/entreprises", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entreprise) });
  if (!creation.ok && creation.status !== 409) {
    throw new Error(`amorce-recette : création de ${entreprise.name} refusée (${creation.status}).`);
  }
}
