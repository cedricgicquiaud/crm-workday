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

// Livraison 2.3 — quelques activités pour la recette : des notes, un appel et une tâche échue de la
// veille (elle déclenche la bannière de la fiche). Même règle que les blocs précédents : on lit le
// fil de chaque fiche avant d'écrire et on ne crée que ce qui manque, pour qu'une relance n'émette
// aucune requête refusée. Le responsable de la tâche est celui de la fiche, déjà connu de la liste.
const fichesAvecFil = await fetch("/api/entreprises");
if (!fichesAvecFil.ok) {
  throw new Error(`amorce-recette : lecture des entreprises refusée (${fichesAvecFil.status}).`);
}
const entreprisesParNomComplet = new Map((await fichesAvecFil.json()).companies.map((entreprise) => [entreprise.name, entreprise]));
const personnesAvecIds = await fetch("/api/personnes");
if (!personnesAvecIds.ok) {
  throw new Error(`amorce-recette : lecture des personnes refusée (${personnesAvecIds.status}).`);
}
const personnesParNomComplet = new Map((await personnesAvecIds.json()).persons.map((personne) => [personne.name, personne]));
const veille = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - 86_400_000));
const activites = [
  { objet: "company", fiche: "Banque Solveige", corps: { type: "note", body: "Renouvellement validé sur six mois, à confirmer par bon de commande." } },
  { objet: "company", fiche: "Banque Solveige", corps: { type: "tache", title: "Envoyer la proposition de renouvellement", dueDate: veille } },
  { objet: "company", fiche: "Assurances Vaubourg", corps: { type: "reunion", body: "Réunion de cadrage du projet SIRH, quatre participants." } },
  { objet: "person", fiche: "Claire Morvan", corps: { type: "note", body: "Préfère être appelée le matin." } },
  { objet: "person", fiche: "Julien Tessier", corps: { type: "appel", body: "Appel de suivi, 12 minutes : budget confirmé pour le quatrième trimestre." } },
];
for (const activite of activites) {
  const fiche = activite.objet === "company" ? entreprisesParNomComplet.get(activite.fiche) : personnesParNomComplet.get(activite.fiche);
  if (!fiche) continue;
  const fil = await fetch(`/api/objets/${activite.objet}/${fiche.id}/activites`);
  if (!fil.ok) {
    throw new Error(`amorce-recette : lecture du fil de ${activite.fiche} refusée (${fil.status}).`);
  }
  const texte = activite.corps.title ?? activite.corps.body;
  if ((await fil.json()).entries.some((entree) => entree.text === texte)) continue;
  const corps = activite.corps.type === "tache" ? { ...activite.corps, assigneeId: fiche.ownerId } : activite.corps;
  const creation = await fetch(`/api/objets/${activite.objet}/${fiche.id}/activites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
  if (!creation.ok) {
    throw new Error(`amorce-recette : création d'une activité sur ${activite.fiche} refusée (${creation.status}).`);
  }
}

// Livraison 2.5b — une vue « Clients parisiens » sur les entreprises, épinglée dans la barre latérale
// du compte de recette. Même règle que les blocs précédents : on lit d'abord les vues de l'objet et on
// ne crée que ce qui manque, pour qu'une relance n'émette aucune requête refusée. L'épingle part avec
// la création de la vue : les deux vont ensemble, une relance n'en repose donc aucune.
const vuesEntreprises = await fetch("/api/vues?objet=company");
if (!vuesEntreprises.ok) {
  throw new Error(`amorce-recette : lecture des vues des entreprises refusée (${vuesEntreprises.status}).`);
}
const vueClients = (await vuesEntreprises.json()).views.find((vue) => vue.name === "Clients parisiens");
if (!vueClients) {
  const creationVue = await fetch("/api/vues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectType: "company", name: "Clients parisiens", query: "f=type:est:client&f=city:contient:Paris&tri=name:asc" }),
  });
  if (!creationVue.ok) {
    throw new Error(`amorce-recette : création de la vue « Clients parisiens » refusée (${creationVue.status}).`);
  }
  const epingle = await fetch("/api/vues-epinglees", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ viewId: (await creationVue.json()).id }),
  });
  if (!epingle.ok) {
    throw new Error(`amorce-recette : épinglage de la vue « Clients parisiens » refusé (${epingle.status}).`);
  }
}

// Livraison 2.4 — deux champs personnalisés sur les entreprises, et une fiche qui en porte les valeurs :
// sans eux, Paramètres → Champs s'ouvre vide en recette et la section « Autres champs » d'une fiche est
// absente. Même règle que les blocs précédents : on lit d'abord les champs de l'objet et on ne crée que
// ce qui manque, pour qu'une relance n'émette aucune requête refusée ; un 409 (libellé repris par un
// champ renommé) est ignoré. Un champ archivé à la main en recette est laissé tel quel : sa valeur ne se
// saisit plus (contrat 19), la reposer serait refusée.
const champsEntreprise = await fetch("/api/champs?objet=company");
if (!champsEntreprise.ok) {
  throw new Error(`amorce-recette : lecture des champs personnalisés refusée (${champsEntreprise.status}).`);
}
const champsParLibelle = new Map((await champsEntreprise.json()).fields.map((champ) => [champ.label, champ]));
const champs = [
  { objectType: "company", label: "Segment", type: "list", values: ["Grand compte", "PME", "Startup"], required: false },
  { objectType: "company", label: "Effectif", type: "number", required: false },
];
for (const champ of champs) {
  if (champsParLibelle.has(champ.label)) continue;
  const creation = await fetch("/api/champs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(champ) });
  if (!creation.ok && creation.status !== 409) {
    throw new Error(`amorce-recette : création du champ « ${champ.label} » refusée (${creation.status}).`);
  }
  if (creation.ok) {
    champsParLibelle.set(champ.label, (await creation.json()).field);
  }
}
const valeursDeRecette = { Segment: "Grand compte", Effectif: 4200 };
const ficheAvecChamps = entreprisesParNomComplet.get("Banque Solveige");
const valeurs = Object.fromEntries(
  Object.entries(valeursDeRecette)
    .map(([libelle, valeur]) => [champsParLibelle.get(libelle), valeur])
    .filter(([champ]) => champ && !champ.archived)
    .map(([champ, valeur]) => [`cf_${champ.id}`, valeur]),
);
if (ficheAvecChamps && Object.keys(valeurs).length > 0) {
  // Une valeur déjà posée ne change rien : le service ne réécrit que ce qui diffère, la relance est silencieuse.
  const saisie = await fetch(`/api/entreprises/${ficheAvecChamps.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(valeurs) });
  if (!saisie.ok) {
    throw new Error(`amorce-recette : saisie des champs personnalisés sur ${ficheAvecChamps.name} refusée (${saisie.status}).`);
  }
}

// Livraison 2.6a — une paire de doublons probables pour la recette : « Acme » et « ACME SAS » se
// réduisent au même nom une fois la forme juridique retirée, les deux fiches portent donc la
// bannière « doublon probable » avec son lien de fusion. Les deux fiches diffèrent sur la ville et
// le secteur : le dialogue de fusion a ainsi des champs à faire trancher. **Rien n'est fusionné
// ici** : le testeur doit voir les deux bannières. Même règle que les blocs précédents — on lit
// d'abord la liste et on ne crée que les raisons sociales absentes, pour qu'une relance n'émette
// aucune requête refusée ; une fiche fusionnée à la main en recette n'est pas recréée sous son
// ancien nom tant que l'autre porte encore le sien.
const listeDoublons = await fetch("/api/entreprises");
if (!listeDoublons.ok) {
  throw new Error(`amorce-recette : lecture des entreprises refusée (${listeDoublons.status}).`);
}
const nomsPresents = new Set((await listeDoublons.json()).companies.map((entreprise) => entreprise.name));
const jumelles = [
  { name: "Acme", type: "prospect", city: "Paris", postalCode: "75002", street: "12 rue de la Paix", sector: "Conseil" },
  { name: "ACME SAS", type: "client", city: "Lyon", postalCode: "69003", street: "40 rue Garibaldi", website: "https://www.acme.fr" },
];
for (const jumelle of jumelles) {
  if (nomsPresents.has(jumelle.name)) continue;
  const creation = await fetch("/api/entreprises", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(jumelle) });
  if (!creation.ok && creation.status !== 409) {
    throw new Error(`amorce-recette : création de ${jumelle.name} refusée (${creation.status}).`);
  }
}

// Livraison 3.1 — deux sociétés de facturation et quatre consultants, pour que « Consultants », la
// fiche d'un consultant et la palette aient de quoi se regarder. Même règle que les blocs précédents :
// on lit d'abord ce qui existe et on ne crée que ce qui manque, pour qu'une relance n'émette aucune
// requête refusée. Le profil, lui, se repose sans risque : un PATCH qui ne change rien n'écrit rien.
// Note : « en mission » est un état dérivé des missions, qui arrivent en 3.2 ; ici le consultant
// correspondant porte une date de disponibilité future, ce qui est ce qu'on saurait en dire à ce stade.
const societesDeFacturation = [
  { name: "Dupont Conseil", type: "societe_de_consultant", siren: "911234567", city: "Nantes", postalCode: "44000", sector: "Conseil" },
  { name: "Portage Atlantique", type: "societe_de_portage", siren: "922345678", city: "Rennes", postalCode: "35000", sector: "Portage salarial" },
];
const listeSocietes = await fetch("/api/entreprises");
if (!listeSocietes.ok) {
  throw new Error(`amorce-recette : lecture des entreprises refusée (${listeSocietes.status}).`);
}
const societesPresentes = new Set((await listeSocietes.json()).companies.map((entreprise) => entreprise.name));
for (const societe of societesDeFacturation) {
  if (societesPresentes.has(societe.name)) continue;
  const creation = await fetch("/api/entreprises", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(societe) });
  if (!creation.ok && creation.status !== 409) {
    throw new Error(`amorce-recette : création de ${societe.name} refusée (${creation.status}).`);
  }
}

const societesAvecIds = await fetch("/api/entreprises");
if (!societesAvecIds.ok) {
  throw new Error(`amorce-recette : lecture des entreprises refusée (${societesAvecIds.status}).`);
}
const societesParNom = new Map((await societesAvecIds.json()).companies.map((entreprise) => [entreprise.name, entreprise.id]));

const jour = (decalage) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + decalage * 86_400_000));
const consultants = [
  {
    personne: { firstName: "Chloé", lastName: "Dupont", email: "chloe.dupont@dupont-conseil.fr", phone: "06 11 22 33 44", linkedin: "https://www.linkedin.com/in/chloe-dupont" },
    profil: { status: "freelance", societe: "Dupont Conseil", dailyCost: 650, modules: ["hcm", "integration"], certifiedModules: ["hcm"], yearsExperience: 8, languages: "français, anglais", cvUrl: "https://exemple.fr/cv/chloe-dupont.pdf", unavailable: "oui", unavailableReason: "Congé sabbatique jusqu'en janvier" },
  },
  {
    personne: { firstName: "Karim", lastName: "Benali", email: "karim.benali@exemple.fr", phone: "06 55 66 77 88" },
    profil: { status: "salarie", dailyCost: 480, modules: ["payroll", "absence", "time_tracking"], certifiedModules: ["payroll"], yearsExperience: 5, languages: "français, anglais", availableFrom: jour(0) },
  },
  {
    personne: { firstName: "Julie", lastName: "Castel", email: "julie.castel@exemple.fr" },
    profil: { status: "salarie", dailyCost: 520, modules: ["finance", "adaptive_planning"], yearsExperience: 11, languages: "français, anglais, espagnol", availableFrom: jour(60) },
  },
  {
    personne: { firstName: "Marc", lastName: "Oliveira", email: "marc.oliveira@portage-atlantique.fr" },
    profil: { status: "portage", societe: "Portage Atlantique", dailyCost: 700, modules: ["recruiting", "talent", "learning"], certifiedModules: ["recruiting", "talent"], yearsExperience: 14, languages: "français, portugais" },
  },
];

const listeAvantConsultants = await fetch("/api/personnes");
if (!listeAvantConsultants.ok) {
  throw new Error(`amorce-recette : lecture des personnes refusée (${listeAvantConsultants.status}).`);
}
const personnesParNomPourProfil = new Map((await listeAvantConsultants.json()).persons.map((personne) => [personne.name, personne]));
for (const { personne, profil } of consultants) {
  const nomComplet = `${personne.firstName} ${personne.lastName}`;
  let fiche = personnesParNomPourProfil.get(nomComplet);
  if (!fiche) {
    const creation = await fetch("/api/personnes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(personne) });
    if (!creation.ok) {
      // Une adresse déjà portée par une fiche renommée à la main en recette : on n'insiste pas.
      if (creation.status !== 409) {
        throw new Error(`amorce-recette : création de ${nomComplet} refusée (${creation.status}).`);
      }
      continue;
    }
    fiche = await creation.json();
  }
  const { societe, ...champs } = profil;
  const billingCompanyId = societe ? societesParNom.get(societe) : undefined;
  if (societe && !billingCompanyId) continue;
  const corps = billingCompanyId ? { ...champs, billingCompanyId } : champs;
  const saisie = await fetch(`/api/personnes/${fiche.id}/profil-consultant`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
  if (!saisie.ok) {
    throw new Error(`amorce-recette : profil consultant de ${nomComplet} refusé (${saisie.status}).`);
  }
}

// Livraison 4.1a — des leads pour la recette : un par avancement (sauf converti, qui arrive avec la
// conversion en 4.1b), un à l'email d'un contact d'une autre entreprise (Claire Morvan, contact chez
// Banque Solveige), un à l'email d'un consultant sans profil contact (Karim Benali), un sans email.
// Même règle que les blocs précédents : on lit d'abord les leads (tous avancements) et on ne crée que
// les titres absents ; l'avancement ne se pose que s'il n'est pas déjà le bon, pour qu'une relance
// n'émette aucune requête refusée. Un lead écarté ou converti à la main en recette est laissé tel quel.
const listeLeads = await fetch("/api/leads");
if (!listeLeads.ok) {
  throw new Error(`amorce-recette : lecture des leads refusée (${listeLeads.status}).`);
}
const leadsParTitre = new Map((await listeLeads.json()).leads.map((fiche) => [fiche.title, fiche]));
const leads = [
  { titre: "Julie Martin · Banque Arcadie", corps: { firstName: "Julie", lastName: "Martin", companyName: "Banque Arcadie", email: "julie.martin@banque-arcadie.fr", origin: "linkedin", score: 2, need: "Migration de la paie vers Workday en 2027." }, avancement: "nouveau" },
  { titre: "Paul Durand · Mutuelle du Rhône", corps: { firstName: "Paul", lastName: "Durand", companyName: "Mutuelle du Rhône", email: "paul.durand@mutuelle-rhone.fr", phone: "04 72 00 11 22", origin: "recommandation", score: 3 }, avancement: "contacte" },
  { titre: "Sophie Lambert · Groupe Hélios", corps: { firstName: "Sophie", lastName: "Lambert", companyName: "Groupe Hélios", jobTitle: "DRH", email: "s.lambert@groupe-helios.fr", origin: "linkedin", score: 3 }, avancement: "qualifie" },
  { titre: "Thomas Roy · Transports Vireo", corps: { firstName: "Thomas", lastName: "Roy", companyName: "Transports Vireo", email: "thomas.roy@vireo.fr", origin: "partenaire", score: 1 }, avancement: "ecarte" },
  { titre: "Claire Morvan · Assurances Vaubourg", corps: { firstName: "Claire", lastName: "Morvan", companyName: "Assurances Vaubourg", email: "claire.morvan@banque-solveige.fr", origin: "recommandation" }, avancement: "nouveau" },
  { titre: "Karim Benali · Industries Ondine", corps: { firstName: "Karim", lastName: "Benali", companyName: "Industries Ondine", email: "karim.benali@exemple.fr", origin: "autre" }, avancement: "nouveau" },
  { titre: "Laboratoires Sirius", corps: { companyName: "Laboratoires Sirius", origin: "appel_d_offres", need: "Appel d'offres Workday Finance annoncé pour le printemps." }, avancement: "nouveau" },
];
for (const { titre, corps, avancement } of leads) {
  let fiche = leadsParTitre.get(titre);
  if (!fiche) {
    const creation = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
    if (!creation.ok) {
      throw new Error(`amorce-recette : création du lead ${titre} refusée (${creation.status}).`);
    }
    fiche = { id: (await creation.json()).id, stage: "nouveau" };
  }
  if (fiche.stage === avancement || fiche.stage === "converti" || fiche.stage === "ecarte") continue;
  const passage =
    avancement === "ecarte"
      ? await fetch(`/api/leads/${fiche.id}/ecarter`, { method: "POST" })
      : await fetch(`/api/leads/${fiche.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: avancement }) });
  if (!passage.ok) {
    throw new Error(`amorce-recette : avancement du lead ${titre} refusé (${passage.status}).`);
  }
}

// Livraison 4.1b — un lead converti : sa fiche porte le bandeau « Converti le … », ses champs se lisent
// en texte, et la personne « Hugo Lemaire » et l'entreprise « Énergies Norvel » (prospect) qu'il crée
// montrent « Issu du lead ». Même règle que les blocs précédents : on relit les leads, et on ne convertit
// que si le lead n'est ni converti ni écarté, pour qu'une relance n'émette aucune requête refusée. Le lead
// est d'abord passé « Qualifié », l'avancement normal avant une conversion.
const leadsAvantConversion = await fetch("/api/leads");
if (!leadsAvantConversion.ok) {
  throw new Error(`amorce-recette : lecture des leads refusée (${leadsAvantConversion.status}).`);
}
const titreConverti = "Hugo Lemaire · Énergies Norvel";
let aConvertir = (await leadsAvantConversion.json()).leads.find((fiche) => fiche.title === titreConverti);
if (!aConvertir) {
  const creation = await fetch("/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ firstName: "Hugo", lastName: "Lemaire", companyName: "Énergies Norvel", email: "hugo.lemaire@energies-norvel.fr", phone: "02 40 11 22 33", jobTitle: "Directeur SIRH", origin: "partenaire", score: 3 }),
  });
  if (!creation.ok) {
    throw new Error(`amorce-recette : création du lead ${titreConverti} refusée (${creation.status}).`);
  }
  aConvertir = { id: (await creation.json()).id, stage: "nouveau" };
}
if (aConvertir.stage !== "converti" && aConvertir.stage !== "ecarte") {
  if (aConvertir.stage !== "qualifie") {
    const qualification = await fetch(`/api/leads/${aConvertir.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "qualifie" }) });
    if (!qualification.ok) {
      throw new Error(`amorce-recette : avancement du lead ${titreConverti} refusé (${qualification.status}).`);
    }
  }
  const conversion = await fetch(`/api/leads/${aConvertir.id}/conversion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decisionRole: "decideur" }) });
  if (!conversion.ok) {
    throw new Error(`amorce-recette : conversion du lead ${titreConverti} refusée (${conversion.status}).`);
  }
}

// Livraison 4.2a — une opportunité par étape en cours chez Banque Solveige et Assurances Vaubourg,
// et un lead qualifié avec besoin, prêt à convertir en 4.2c. Même règle que les blocs précédents :
// on lit d'abord les opportunités (gagnées, perdues et archivées comprises) et on ne crée que les
// titres absents ; l'étape ne se pose que si elle n'est pas déjà la bonne, pour qu'une relance
// n'émette aucune requête refusée.
const listeEntreprises = await fetch("/api/entreprises");
if (!listeEntreprises.ok) {
  throw new Error(`amorce-recette : lecture des entreprises refusée (${listeEntreprises.status}).`);
}
const clientsParNom = new Map((await listeEntreprises.json()).companies.map((entreprise) => [entreprise.name, entreprise.id]));
const listeOpportunites = await fetch("/api/objets/opportunity?filtres=aucun&archivees=1");
if (!listeOpportunites.ok) {
  throw new Error(`amorce-recette : lecture des opportunités refusée (${listeOpportunites.status}).`);
}
const opportunitesParTitre = new Map((await listeOpportunites.json()).records.map((fiche) => [fiche.title, fiche]));
const opportunites = [
  { titre: "Refonte Payroll Solveige", entreprise: "Banque Solveige", modules: ["hcm", "payroll"], expectedClose: "2026-10-30", targetDailyRate: 650, estimatedDays: 60, need: "Migration de la paie de 4 000 collaborateurs vers Workday Payroll.", etape: "nouveau_besoin" },
  { titre: "Core HCM Vaubourg", entreprise: "Assurances Vaubourg", modules: ["hcm"], expectedClose: "2026-11-15", targetDailyRate: 700, estimatedDays: 40, etape: "qualifie" },
  { titre: "Recrutement Solveige", entreprise: "Banque Solveige", modules: ["recruiting"], expectedClose: "2026-12-04", targetDailyRate: 600, estimatedDays: 30, etape: "profils_proposes" },
  { titre: "Temps et activités Ferrandi", entreprise: "Groupe Ferrandi", modules: ["time_tracking"], expectedClose: "2027-01-20", etape: "entretien_client" },
  { titre: "Finance Vaubourg", entreprise: "Assurances Vaubourg", modules: ["finance"], expectedClose: "2026-11-27", targetDailyRate: 750, estimatedDays: 80, etape: "proposition_envoyee" },
  { titre: "Intégrations Solveige", entreprise: "Banque Solveige", modules: ["integration", "projects"], expectedClose: "2026-10-09", targetDailyRate: 720, estimatedDays: 25, etape: "negociation" },
];
for (const { titre, entreprise, etape, ...champs } of opportunites) {
  const companyId = clientsParNom.get(entreprise);
  if (!companyId) {
    throw new Error(`amorce-recette : entreprise ${entreprise} absente pour l'opportunité ${titre}.`);
  }
  let fiche = opportunitesParTitre.get(titre);
  if (!fiche) {
    const creation = await fetch("/api/opportunites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: titre, companyId, ...champs }) });
    if (!creation.ok) {
      throw new Error(`amorce-recette : création de l'opportunité ${titre} refusée (${creation.status}).`);
    }
    fiche = { id: (await creation.json()).id, stage: "nouveau_besoin" };
  }
  if (fiche.stage === etape || fiche.stage === "gagnee" || fiche.stage === "perdue") continue;
  const passage = await fetch(`/api/opportunites/${fiche.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: etape }) });
  if (!passage.ok) {
    throw new Error(`amorce-recette : étape de l'opportunité ${titre} refusée (${passage.status}).`);
  }
}

// Un lead qualifié avec son besoin, prêt à convertir en opportunité (4.2c) : il reste « Qualifié »
// tant que personne ne l'a converti, et la relance ne le touche plus une fois converti ou écarté.
const leadsAvantOpportunite = await fetch("/api/leads");
if (!leadsAvantOpportunite.ok) {
  throw new Error(`amorce-recette : lecture des leads refusée (${leadsAvantOpportunite.status}).`);
}
const titreAConvertir = "Nadia Ferrand · Cliniques Aurore";
let leadAConvertir = (await leadsAvantOpportunite.json()).leads.find((fiche) => fiche.title === titreAConvertir);
if (!leadAConvertir) {
  const creation = await fetch("/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ firstName: "Nadia", lastName: "Ferrand", companyName: "Cliniques Aurore", email: "nadia.ferrand@cliniques-aurore.fr", jobTitle: "DRH", origin: "recommandation", score: 3, need: "Déploiement Workday HCM et Recruiting sur 12 cliniques, décision au premier trimestre 2027." }),
  });
  if (!creation.ok) {
    throw new Error(`amorce-recette : création du lead ${titreAConvertir} refusée (${creation.status}).`);
  }
  leadAConvertir = { id: (await creation.json()).id, stage: "nouveau" };
}
if (leadAConvertir.stage !== "qualifie" && leadAConvertir.stage !== "converti" && leadAConvertir.stage !== "ecarte") {
  const qualification = await fetch(`/api/leads/${leadAConvertir.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: "qualifie" }) });
  if (!qualification.ok) {
    throw new Error(`amorce-recette : avancement du lead ${titreAConvertir} refusé (${qualification.status}).`);
  }
}

// Livraison 4.2b — propositions de consultants sur une opportunité.
// « Talent Vaubourg » porte trois propositions : Julie Castel « Retenu » à 700 €, Marc Oliveira
// « Entretien », Karim Benali « Proposé » au TJM cible. Aucune lecture des propositions n'existe par
// l'API : le bloc ne pose les propositions qu'à la création de l'opportunité, et une relance qui la
// trouve déjà la laisse telle quelle (retrait ou changement fait à la main en recette compris). Ainsi
// aucune requête n'est refusée.
const titrePropositions = "Talent Vaubourg";
const opportunitesAvantPropositions = await fetch("/api/objets/opportunity?filtres=aucun&archivees=1");
if (!opportunitesAvantPropositions.ok) {
  throw new Error(`amorce-recette : lecture des opportunités refusée (${opportunitesAvantPropositions.status}).`);
}
if (!(await opportunitesAvantPropositions.json()).records.some((fiche) => fiche.title === titrePropositions)) {
  const personnesProposees = await fetch("/api/personnes");
  if (!personnesProposees.ok) {
    throw new Error(`amorce-recette : lecture des personnes refusée (${personnesProposees.status}).`);
  }
  const consultantsParNom = new Map((await personnesProposees.json()).persons.map((personne) => [personne.name, personne.id]));
  const propositions = [
    { nom: "Julie Castel", corps: { result: "retenu", proposedDailyRate: 700 } },
    { nom: "Marc Oliveira", corps: { result: "entretien" } },
    { nom: "Karim Benali", corps: null },
  ];
  const absent = propositions.find(({ nom }) => !consultantsParNom.has(nom));
  if (absent) {
    throw new Error(`amorce-recette : consultant ${absent.nom} absent pour l'opportunité ${titrePropositions}.`);
  }
  const companyId = clientsParNom.get("Assurances Vaubourg");
  const creation = await fetch("/api/opportunites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: titrePropositions, companyId, modules: ["talent", "recruiting"], expectedClose: "2026-12-18", targetDailyRate: 680, estimatedDays: 45, need: "Déploiement de Workday Talent et Recruiting pour 1 200 collaborateurs." }),
  });
  if (!creation.ok) {
    throw new Error(`amorce-recette : création de l'opportunité ${titrePropositions} refusée (${creation.status}).`);
  }
  const opportuniteId = (await creation.json()).id;
  for (const { nom, corps } of propositions) {
    const personId = consultantsParNom.get(nom);
    const ajout = await fetch(`/api/opportunites/${opportuniteId}/propositions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ personId }) });
    if (!ajout.ok) {
      throw new Error(`amorce-recette : proposition de ${nom} refusée (${ajout.status}).`);
    }
    if (!corps) continue;
    const modification = await fetch(`/api/opportunites/${opportuniteId}/propositions/${personId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) });
    if (!modification.ok) {
      throw new Error(`amorce-recette : proposition de ${nom} refusée à la modification (${modification.status}).`);
    }
  }
}

// Livraison 4.2c — conversion d'un lead en opportunité.

// Livraison 4.2d — opportunités gagnée, perdue et rouverte.
