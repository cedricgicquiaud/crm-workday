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

// Livraison 2.1a — trois entreprises pour la recette. Bloc idempotent et silencieux : on lit d'abord
// la liste et on ne crée que les raisons sociales absentes, pour qu'une relance n'émette aucune requête
// refusée (une réponse 4xx compte comme une erreur console dans la passe visuelle). Chaque entreprise
// porte un SIREN fixe : si une fiche renommée le porte encore, le 409 est ignoré.
const liste = await fetch("/api/entreprises");
if (!liste.ok) {
  throw new Error(`amorce-recette : lecture des entreprises refusée (${liste.status}).`);
}
const existantes = new Set((await liste.json()).companies.map((entreprise) => entreprise.name));
const entreprises = [
  { name: "Banque Solveige", type: "client", siren: "552081317", website: "https://www.banque-solveige.fr", city: "Paris", postalCode: "75008", street: "18 avenue de Messine", billingEmail: "compta@banque-solveige.fr", sector: "Banque" },
  { name: "Assurances Vaubourg", type: "prospect", siren: "732829320", website: "https://www.vaubourg-assurances.fr", city: "Lyon", postalCode: "69002", street: "4 place Bellecour", sector: "Assurance" },
  { name: "Groupe Ferrandi", type: "partenaire", siren: "842051701", city: "Nantes", postalCode: "44000", street: "9 rue Crébillon", paymentTerms: "45_jours_fin_de_mois", sector: "Industrie" },
];
for (const entreprise of entreprises) {
  if (existantes.has(entreprise.name)) continue;
  const creation = await fetch("/api/entreprises", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entreprise) });
  if (!creation.ok && creation.status !== 409) {
    throw new Error(`amorce-recette : création de ${entreprise.name} refusée (${creation.status}).`);
  }
}

// Livraison 2.2 — quatre personnes rattachées aux entreprises ci-dessus. Même règle : on lit la liste
// des personnes et celle des entreprises, on ne crée que les noms absents, avec l'entreprise, le poste
// et le rôle dans le même appel (profil contact). Un 409 (adresse déjà portée par une fiche renommée)
// est ignoré.
const listeAvecIds = await fetch("/api/entreprises");
if (!listeAvecIds.ok) {
  throw new Error(`amorce-recette : lecture des entreprises refusée (${listeAvecIds.status}).`);
}
const entreprisesParNom = new Map((await listeAvecIds.json()).companies.map((entreprise) => [entreprise.name, entreprise.id]));
const listePersonnes = await fetch("/api/personnes");
if (!listePersonnes.ok) {
  throw new Error(`amorce-recette : lecture des personnes refusée (${listePersonnes.status}).`);
}
const personnesExistantes = new Set((await listePersonnes.json()).persons.map((personne) => personne.name));
const personnes = [
  { firstName: "Claire", lastName: "Morvan", email: "claire.morvan@banque-solveige.fr", phone: "01 44 12 30 21", entreprise: "Banque Solveige", jobTitle: "DSI", decisionRole: "decideur" },
  { firstName: "Julien", lastName: "Tessier", email: "julien.tessier@banque-solveige.fr", otherEmails: "j.tessier@gmail.com", entreprise: "Banque Solveige", jobTitle: "Responsable achats IT", decisionRole: "acheteur" },
  { firstName: "Sofia", lastName: "Benali", email: "sofia.benali@vaubourg-assurances.fr", linkedin: "https://www.linkedin.com/in/sofia-benali", entreprise: "Assurances Vaubourg", jobTitle: "Chef de projet SIRH", decisionRole: "utilisateur" },
  { firstName: "Marc", lastName: "Ferrandi", email: "marc.ferrandi@groupe-ferrandi.fr", entreprise: "Groupe Ferrandi", jobTitle: "Directeur général", decisionRole: "non_precise" },
];
for (const { entreprise, ...personne } of personnes) {
  if (personnesExistantes.has(`${personne.firstName} ${personne.lastName}`)) continue;
  const companyId = entreprisesParNom.get(entreprise);
  if (!companyId) continue;
  const creation = await fetch("/api/personnes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...personne, companyId }) });
  if (!creation.ok && creation.status !== 409) {
    throw new Error(`amorce-recette : création de ${personne.firstName} ${personne.lastName} refusée (${creation.status}).`);
  }
}
