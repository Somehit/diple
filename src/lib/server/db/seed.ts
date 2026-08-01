/**
 * Database seeder — populates Diple with a power-user tree for testing.
 *
 * Why a standalone script (not inline in schema.ts like the 5-block seed):
 * - A 1000+ block hierarchy is too large to run on every app start.
 * - Run once with `npm run seed` when you want fresh test data.
 *
 * Why deterministic IDs (slash-delimited paths):
 * - Makes the tree readable in the DB and lets us reference parents easily.
 * - No collisions, no surprises.
 *
 * Why one transaction for everything:
 * - 1000+ individual inserts would be slow in WAL mode without batching.
 * - A single transaction ensures all-or-nothing: a partial seed never happens.
 */

import { getDb, closeDb } from './client';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Base timestamp: Jan 1 2025 UTC. All blocks get a date in 2025. */
const BASE_MS = new Date('2025-01-01T00:00:00.000Z').getTime();

/**
 * Create a deterministic ID from path parts.
 * Example: id('school', 'math', 'week-1', 'notes') → "school/math/week-1/notes"
 */
function id(...parts: string[]): string {
	return parts.join('/');
}

/**
 * Return a timestamp `weeksAgo` weeks before now (but no earlier than BASE_MS).
 * Scatters block dates across the year so `:today` and date-range filters work.
 */
function ts(weeksAgo: number): number {
	const offset = Math.max(0, weeksAgo) * 7 * 86400_000;
	return Date.now() - offset;
}

/** Auto-incrementing position counter per sibling group. Reset per parent. */
const _parentPos = new Map<string | null, number>();

function pos(parent: string | null): number {
	const p = _parentPos.get(parent) ?? 0;
	_parentPos.set(parent, p + 1);
	return p;
}

/** Reset the position counter for all parents. */
function resetPos(): void {
	_parentPos.clear();
}

interface BlockSeed {
	id: string;
	parent_id: string | null;
	content: string;
	position: number;
	created_at: number;
}

const all: BlockSeed[] = [];

function add(blockId: string, parentId: string | null, content: string, weeksAgo: number): void {
	all.push({
		id: blockId,
		parent_id: parentId,
		content,
		position: pos(parentId),
		created_at: ts(weeksAgo)
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════

add('home', null, '🏠 Diple — Everything is a bullet point', 52);

// Top-level categories — home's children
add('personal', 'home', '🧘 Personal', 50);
add('school', 'home', '🎓 School', 50);
add('work', 'home', '💼 Work', 50);
add('inbox', 'home', '📥 Inbox & Quick Capture', 50);

// ═══════════════════════════════════════════════════════════════════════════════
// PERSONAL
// ═══════════════════════════════════════════════════════════════════════════════

// ── Santé & Fitness ──────────────────────────────────────────────────────────

add('fitness', 'personal', '🏋️ Santé & Fitness', 48);

add('fitness/routine', 'fitness', 'Routine sportive', 40);
add(
	'fitness/routine/semaine',
	'fitness/routine',
	`Ma routine hebdomadaire actuelle :

Lundi — Upper body (pecs, épaules, triceps) + 20 min cardio HIIT
Mardi — Jambes (squats, deadlifts, lunges) + stretching
Mercredi — Pull (dos, biceps) + core
Jeudi — Course à pied 10 km en fractionné
Vendredi — Full body compound lifts
Samedi — Yoga / mobilité active
Dimanche — Repos ou marche légère 30 min

Objectif du trimestre : augmenter mon DNF (deadlift) de 10% et passer sous les 40 min au 10 km.`,
	30
);
add(
	'fitness/routine/exercices',
	'fitness/routine',
	`Exercices clés et leurs progressions actuelles :

1. Deadlift — 3×5 @ 95 kg (progresse +2.5 kg/sem)
2. Squat — 3×5 @ 80 kg (stagnation, essayer 5×3)
3. Bench press — 3×5 @ 65 kg
4. Pull-ups — 3×8 @ poids de corps
5. Overhead press — 3×5 @ 42.5 kg
6. Barbell row — 3×8 @ 60 kg

Remplacer le squat par du front squat pendant 4 semaines pour casser la stagnation.`,
	28
);

add('fitness/objectifs', 'fitness', '🎯 Objectifs fitness', 42);
add(
	'fitness/objectifs/2025',
	'fitness/objectifs',
	`Objectifs fitness 2025 :

Q1 — Deadlift 100 kg, 10 km en 42 min
Q2 — Premier muscle-up, squat 100 kg
Q3 — Half marathon en 1h45, bench press 80 kg
Q4 — Deadlift 120 kg, maintenir le tout

Indicateurs clés : poids stable entre 72-74 kg, sommeil ≥7h/nuit, eau ≥2L/jour.`,
	40
);
add(
	'fitness/objectifs/suivi',
	'fitness/objectifs',
	`Suivi mensuel — Mars 2025

Poids : 73.2 kg (stable)
Masse grasse estimée : 14%
Séances complétées : 22/24 (92%)
Blessures : légère tendinite au coude droit, mettre des straps pour les pull-ups
Sommeil moyen : 6h48 — pas assez, viser 7h30

À améliorer : mobilité hanches (intégrer 15 min stretching post-workout).`,
	25
);

add('fitness/nutrition', 'fitness', '🥗 Nutrition & Alimentation', 44);
add(
	'fitness/nutrition/repas-type',
	'fitness/nutrition',
	`Repas-type actuel (maintien calorique ~2600 kcal) :

Petit-déjeuner : flocons d'avoine 80g + whey 30g + beurre de cacahuète 20g + banane
Déjeuner : poulet/poisson 200g + riz/quinoa 200g cuit + légumes verts à volonté + huile d'olive 15g
Collation : yaourt grec 200g + amandes 30g + pomme
Dîner : œufs 3 + avocat 100g + patate douce 200g + légumes rôtis

Suppléments : créatine 5g/j, vitamine D 2000 UI, oméga-3 2g.`,
	26
);
add(
	'fitness/nutrition/recettes',
	'fitness/nutrition',
	`Recettes rapides post-workout :

1. Bowl protéiné : 200g riz, 200g poulet, 100g edamame, avocat, sauce soja, sésame
2. Omelette espagnole : 4 œufs, 200g pommes de terre, oignon, poivron
3. Smoothie vert : 30g whey, 1 banane, 60g épinards, 20g beurre d'amande, lait d'amande
4. Buddha bowl : quinoa, pois chiches, patate douce, chou kale, tahini

Batch cooking le dimanche pour gagner du temps en semaine.`,
	22
);

add('fitness/medical', 'fitness', '🩺 Suivi médical', 46);
add(
	'fitness/medical/rdv',
	'fitness/medical',
	`Prochains rendez-vous médicaux :

2025-04-15 — Dentiste (contrôle annuel)
2025-05-03 — Généraliste (bilan sanguin)
2025-06-20 — Ophtalmo (contrôle vue)
2025-09-12 — Vaccin grippe

Traitements en cours : aucun.
Allergies : pollen (avril-juin), prendre Aerius si nécessaire.`,
	35
);
add(
	'fitness/medical/notes',
	'fitness/medical',
	`Bilan sanguin — Janvier 2025

Tout dans les normes sauf :
- Vitamine D : légère carence (28 ng/mL, normale >30) — supplémentation 2000 UI/j
- Ferritine : basse (45 μg/L), augmenter la viande rouge et les légumineuses

Pression artérielle : 118/76 — excellent.
Fréquence cardiaque au repos : 56 bpm.`,
	48
);

// ── Finances ─────────────────────────────────────────────────────────────────

add('finances', 'personal', '💰 Finances', 48);

add('finances/budget', 'finances', 'Budget mensuel', 30);
add(
	'finances/budget/mars',
	'finances/budget',
	`Budget Mars 2025

Revenus : 3 850 € (salaire net)
Loyer + charges : 1 120 €
Alimentation : 480 €
Transport : 145 € (abonnement + carburant)
Loisirs : 320 €
Épargne : 1 200 € (dont 800 € investissement, 400 € livret A)
Abonnements : 85 € (Netflix, Spotify, Dropbox, VPN)
Assurances : 62 €
Divers : 120 € (vêtements, coiffeur, etc.)

Objectif : réduire les loisirs de 20% et rediriger vers l'épargne.`,
	20
);
add(
	'finances/budget/fevrier',
	'finances/budget',
	`Budget Février 2025 — Rétrospective

Prévu : 2 350 € de dépenses
Réel : 2 480 € (dépassement de 130 €)

Écarts principaux :
- Loisirs : 380 € au lieu de 300 € (restaurants + concert imprévu)
- Transport : 180 € (réparation voiture imprévue)

Leçons : renforcer le fonds d'urgence (+50 €/mois) et réduire le budget resto de 50 €.`,
	25
);

add('finances/investissements', 'finances', '📈 Épargne & Investissements', 40);
add(
	'finances/investissements/portefeuille',
	'finances/investissements',
	`Portefeuille d'investissement — Allocation cible 2025

ETF Monde (CW8) : 60%
ETF S&P 500 (CSPX) : 20%
Obligations d'État (IBCE) : 10%
Crypto (BTC + ETH) : 5%
Liquidités (Livret A + LDDS) : 5%

Versements mensuels : 800 € (DCA)
Stratégie : accumulation, pas de trading actif. Rééquilibrage annuel.
PEE : versement employeur 500 €/an, j'ajoute 100 €/mois.`,
	38
);
add(
	'finances/investissements/crypto',
	'finances/investissements',
	`Stratégie crypto 2025

BTC — DCA 100 €/semaine. Objectif : hold 5 ans.
ETH — DCA 50 €/semaine. Staking sur Lido pour le rendement (~4%).
Ne pas toucher aux altcoins — trop volatils et stressants.

Wallet : Ledger Nano X. 
Exchange principal : Kraken.
Ne pas stocker sur exchange, toujours transférer vers le hardware wallet.`,
	35
);

add('finances/factures', 'finances', '📋 Factures & Abonnements', 42);
add(
	'finances/factures/liste',
	'finances/factures',
	`Abonnements actifs :

Netflix Premium — 17.99 €/mois ✅
Spotify Duo — 13.99 €/mois ✅
Dropbox Plus (2 To) — 9.99 €/mois ✅
NordVPN — 3.29 €/mois (abonnement 2 ans)
iCloud+ (200 Go) — 2.99 €/mois ✅
Amazon Prime — 69 €/an ✅
Mullvad VPN — 5 €/mois (doublon avec NordVPN, résilier)
Canva Pro — 12.99 €/mois (résilier, plus utilisé)

Résilier : Mullvad et Canva. Économie : ~18 €/mois.`,
	30
);
add(
	'finances/factures/électricité',
	'finances/factures',
	`Comparatif électricité 2025

Fournisseur actuel — EDF (Tarif Bleu réglementé) : 0.2516 €/kWh
Offre Heures Creuses : 0.2460 €/kWh (HC) / 0.2690 €/kWh (HP)
Total Energies : 0.2390 €/kWh fixe 2 ans
Octopus Energy : 0.2350 €/kWh

Consommation annuelle : ~3 800 kWh
Meilleure offre : Octopus Energy → économie de ~63 €/an.

À faire : résilier EDF et souscrire chez Octopus.`,
	28
);

add('finances/impots', 'finances', '🧾 Impôts', 45);
add(
	'finances/impots/2025',
	'finances/impots',
	`Déclaration impôts 2025 (revenus 2024)

Salaire net imposable : 42 500 €
Frais réels : 3 200 € (transport + repas) — option frais réels plus avantageuse que 10%
Crédit d'impôt : don à UNICEF 150 € (75% de réduction soit 112 €)
Taux de prélèvement à la source : 11.2%

Estimation impôt total : ~4 800 €
Déjà prélevé à la source : ~4 750 €
Reste à payer : ~50 € (ou remboursement selon ajustement)

Pièces justificatives à conserver : frais réels (abonnement transport, tickets resto), reçu don.`,
	42
);

// ── Lectures & Culture ──────────────────────────────────────────────────────

add('lectures', 'personal', '📚 Lectures & Culture', 44);

add('lectures/livres', 'lectures', 'Livres', 40);
add(
	'lectures/livres/2025',
	'lectures/livres',
	`Livres lus en 2025 :

1. "Le Mythe de Sisyphe" — Albert Camus ⭐⭐⭐⭐
   Essai sur l'absurde. "Il faut imaginer Sisyphe heureux." Une révélation.

2. "Designing Data-Intensive Applications" — Martin Kleppmann ⭐⭐⭐⭐⭐
   Bible de l'architecture système. Chapitres 5-7 sur la réplication et le partitionnement sont exceptionnels.

3. "Dune" — Frank Herbert ⭐⭐⭐⭐
   Réédition 2025. La construction politique et écologique est fascinante.

4. "Sapiens" — Yuval Noah Harari ⭐⭐⭐⭐
   Synthèse brillante de l'histoire humaine. Lu pour le book club du travail.

5. "The Pragmatic Programmer" — Hunt & Thomas ⭐⭐⭐⭐⭐
   20th anniversary edition. À relire tous les 5 ans — chaque fois on découvre quelque chose.

6. "Le Petit Prince" (relecture) — Saint-Exupéry ⭐⭐⭐⭐⭐
   "L'essentiel est invisible pour les yeux."

7. "Clean Code" — Robert C. Martin ⭐⭐⭐
   Certains passages datent mais les principes de base restent solides.

En cours : "Thinking, Fast and Slow" — Daniel Kahneman`,
	36
);
add(
	'lectures/livres/wishlist',
	'lectures/livres',
	`Wishlist livres :

☐ "The Structure of Scientific Revolutions" — Kuhn
☐ "Gödel, Escher, Bach" — Hofstadter
☐ "The Art of Computer Programming" — Knuth (Vol 1)
☐ "La Peste" — Camus
☐ "Seveneves" — Neal Stephenson
☐ "The Phoenix Project" — Kim, Behr, Spafford
☐ "Fundamentals of Software Architecture" — Richards & Ford
☐ "Permaculture : Principles et chemins vers la durabilité" — Holmgren`,
	32
);

add('lectures/films', 'lectures', 'Films & Séries', 42);
add(
	'lectures/films/vus',
	'lectures/films',
	`Films vus — 2025

1. Interstellar (rewatch) ⭐⭐⭐⭐⭐ — Toujours aussi puissant, la scène du docking
2. The Matrix (rewatch) ⭐⭐⭐⭐ — Vingt-cinq ans après, toujours visionnaire
3. Dune Part Two ⭐⭐⭐⭐⭐ — Chef-d'œuvre visuel, Zimmer est un génie
4. Anatomy of a Fall ⭐⭐⭐⭐ — Scénario intelligent, Palme d'Or méritée
5. Past Lives ⭐⭐⭐⭐ — Magnifique, lent et doux
6. Oppenheimer ⭐⭐⭐⭐ — Le montage est extraordinaire
7. The Zone of Interest ⭐⭐⭐⭐ — Glaçant, le hors-champ est assourdissant

Séries :
1. Severance S2 ⭐⭐⭐⭐⭐ — Meilleure série en cours, chaque épisode est une claque
2. The Bear S3 ⭐⭐⭐⭐ — Toujours intense, épisode Fishes en S2 restera culte
3. True Detective S1 (rewatch) ⭐⭐⭐⭐⭐ — Rust Cohle, personnage du siècle`,
	30
);
add(
	'lectures/films/watchlist',
	'lectures/films',
	`Watchlist à voir :

☐ Perfect Days — Wim Wenders
☐ The Boy and the Heron — Miyazaki
☐ Poor Things — Yorgos Lanthimos
☐ Kinds of Kindness — Lanthimos aussi
☐ Civil War — Alex Garland
☐ Furiosa — George Miller
☐ Challengers — Luca Guadagnino (la BO de Reznor/Ross)
☐ Anora — Sean Baker`,
	28
);

add('lectures/podcasts', 'lectures', 'Podcasts & Musique', 44);
add(
	'lectures/podcasts/liste',
	'lectures/podcasts',
	`Podcasts suivis régulièrement :

🎙️ Le Code a Changé — Tech & société, excellent journalisme
🎙️ Thinkerview — Entretiens longs, format libre
🎙️ The Ezra Klein Show — Analyse politique US, toujours pertinent
🎙️ Huberman Lab — Neuroscience et performance
🎙️ Software Engineering Daily — Tech profond
🎙️ Affaires Sensibles — Récits historiques passionnants
🎙️ 2 Heures de Perdues — Humour et cinéma

Album en boucle en ce moment : "Gnosis" — The Smile (2025).`,
	32
);

// ── Projets Perso ───────────────────────────────────────────────────────────

add('projets', 'personal', '🔧 Projets perso', 46);

add('projets/japon', 'projets', '🗾 Voyage au Japon', 44);
add(
	'projets/japon/itinerary',
	'projets/japon',
	`Itinéraire préliminaire — Automne 2026

Jour  1-4 : Tokyo (Shibuya, Shinjuku, Asakusa, Akihabara)
Jour  5-7 : Kyoto (Fushimi Inari, Kinkaku-ji, Nishiki Market, geishas à Gion)
Jour  8-9 : Osaka (Dotonbori, château, street food)
Jour 10-11 : Nara (parc aux cerfs, Todai-ji)
Jour 12-14 : Hakone (onsen, vue sur le Fuji-san)
Jour 15-16 : Hiroshima (Miyajima, Peace Memorial)
Jour 17-18 : Kanazawa (jardin Kenroku-en, quartier des geishas)
Jour 19-21 : Tokyo (shopping dernière chance, TeamLab Borderless)

Budget estimé : 4 500 € (vol + hébergement + JR Pass + dépenses)
JR Pass 21 jours ~ 450 € à réserver avant l'arrivée.`,
	34
);
add(
	'projets/japon/préparatifs',
	'projets/japon',
	`Préparatifs voyage Japon — todo liste :

☐ Passeport valide jusqu'en 2027 ✅
☐ Visa : exemption pour les Français <90 jours ✅
☐ Réserver vols : octobre 2026 (JAL ou Air France)
☐ Souscrire assurance voyage (Chapka ou Assur Travel)
☐ Réservations hôtels : capsule hotel 2 nuits, ryokan 3 nuits, reste en Airbnb
☐ Apprendre 50 phrases de base (Hiragana + Katakana)
☐ Achat : Pocket WiFi ou eSIM (Ubigi ou Holafly)
☐ Carte Suica préchargée sur Apple Wallet
☐ Préparer une petite trousse de secours (Doliprane, Imodium, Bande élastique)`,
	30
);
add(
	'projets/japon/articles',
	'projets/japon',
	`Articles et guides lus sur le Japon :

- "Japon : le guide ultime pour un premier voyage" (Le Monde)
- "Où manger les meilleurs ramen à Tokyo" (Eater Tokyo)
- "Onsen etiquette : everything you need to know" (Matcha JP)
- "Hiking the Kumano Kodo : a beginner's guide" (Japan Guide)
- "Pocket WiFi vs eSIM : what's best for Japan travel?" (Tokyo Cheapo)

Recommandations reçues :
- Sanpo Yochi Yochi : petit café à Shimokitazawa (Tom)
- Nakiryu : meilleurs tantanmen de Tokyo (Michelin Bib Gourmand)
- Kuromon Ichiba Market : street food à Osaka à ne pas rater (Sarah)`,
	28
);

add('projets/renovation', 'projets', '🏠 Rénovation appartement', 42);
add(
	'projets/renovation/salle-de-bains',
	'projets/renovation',
	`Rénovation salle de bains — Planning

Phase 1 (avril) : Démolition — carrelage, évier ancien, baignoire
Phase 2 (mai) : Plomberie — déplacer les arrivées d'eau pour douche italienne
Phase 3 (mai-juin) : Électricité — norme NF C 15-100, spots LED, VMC
Phase 4 (juin) : Carrelage mural — métro blanc 15×30, joints gris anthracite
Phase 5 (juillet) : Carrelage sol — grès cérame aspect béton 60×60
Phase 6 (août) : Douche italienne, paroi vitrée, mitigeur
Phase 7 (août) : Meubles — vasque + rangement suspendu, miroir LED
Phase 8 (septembre) : Finitions — peinture plafond, joints silicone, accessoires

Budget : 4 500 €
Artisan contacté : SARL Dubois Plomberie (devis signé, 1 800 € la plomberie)`,
	32
);
add(
	'projets/renovation/materiaux',
	'projets/renovation',
	`Matériaux achetés / à acheter :

✅ Carrelage mural : Cérabati "White Metro" 15×30 — 12 €/m² (29 m²)
✅ Joint blanc : Weber Coloris gris anthracite
✅ Carrelage sol : Cérabati "Concrete" 60×60 — 28 €/m² (8 m²)
☐ Paroi douche : Kinedo 90×120 verrière — ~450 €
☐ Mitigeur thermostatique : Grohe Euphoria — ~200 €
☐ Vasque suspendue : Jacob Delafon Vireo 60 cm — ~250 €
☐ Miroir LED : Amazon Basics 80×60 avec anti-buée — ~80 €
☐ Spots LED : 6× Lexman 3000K encastrés — ~60 €
☐ VMC : Vortice Hygro P2 — ~110 € (raccord en diam 125 mm à prévoir)`,
	28
);

add('projets/jardin', 'projets', '🌱 Jardin & permaculture', 44);
add(
	'projets/jardin/potager',
	'projets/jardin',
	`Carré potager 2025 — Plan de culture

Carreau A : Tomates (cœur de bœuf, cerises noires) + basilic
Carreau B : Courgettes (2 plants) + capucines (compagnonnage)
Carreau C : Haricots verts grimpants + maïs (culture associée)
Carreau D : Salades (laitue, roquette, mâche) + radis en intercalaire
Carreau E : Carottes, betteraves, panais
Carreau F : Aromatiques (thym, romarin, ciboulette, menthe en pot !)

Carrés surélevés : 4 × (1.2 m × 1.2 m), hauteur 30 cm.
Terreau : ⅓ terre de jardin, ⅓ compost maison, ⅓ terreau universel.
Paillage : paille de lin sur toutes les surfaces pour limiter l'arrosage.`,
	32
);
add(
	'projets/jardin/calendrier',
	'projets/jardin',
	`Calendrier jardin 2025

Février — Semis intérieurs (tomates, poivrons, aubergines)
Mars — Préparation des carrés, compost, semis de printemps
Avril — Plantation des pommes de terre, semis de carottes, radis
Mai — Mise en place des plants (tomates, courgettes, basilic) après les saints de glace
Juin — Semis haricots, paillage, installations goutte-à-goutte
Juillet-août — Récolte ! Tomates, courgettes, haricots — conserve et partage
Septembre — Semis d'automne (mâche, épinards), plantation ail et oignons
Octobre — Nettoyage, paillage hivernal, grelinette
Novembre-février — Repos, planification, achat graines pour l'année suivante`,
	28
);

// ── Journal ──────────────────────────────────────────────────────────────────

add('journal', 'personal', '📖 Journal', 48);

const MONTHS_FR = [
	'janvier',
	'février',
	'mars',
	'avril',
	'mai',
	'juin',
	'juillet',
	'août',
	'septembre',
	'octobre',
	'novembre',
	'décembre'
];

const JOURNAL_ENTRIES: Record<string, string> = {
	janvier: `Janvier 2025 — Bonne année ! Premier mois de l'année, j'ai pris le temps de poser mes intentions. 
J'ai commencé le nouveau programme fitness (Upper/Lower split) et déjà des progrès sur le développé couché.
Au travail, le projet Atlas a enfin reçu le feu vert du comité de direction — grosse année en perspective.
Lu "Le Mythe de Sisyphe" qui m'a profondément marqué. "Il faut imaginer Sisyphe heureux" restera avec moi.
Les jours sont courts, le moral est bon. Objectif pour février : être plus constant dans la méditation.`,
	février: `Février 2025 — Mois chargé. Le projet Atlas commence à prendre forme, premières réunions avec l'équipe cloud.
J'ai profité des vacances pour avancer sur la rénovation de la salle de bains — tout le carrelage mural est posé.
Le semi-marathon se prépare : 14 km en 1h05, ça avance bien. 
Vu "Anatomy of a Fall" au cinéma — excellent, la scène du procès est une masterclass d'écriture.
Petit coup de fatigue en fin de mois, besoin de mieux dormir.`,
	mars: `Mars 2025 — Le printemps qui arrive, les jours rallongent. 
Au jardin : les semis intérieurs de tomates ont bien levé, les pieds font déjà 15 cm.
Fitness : test réussi à 95 kg au deadlift ! Plus que 5 kg avant l'objectif Q1.
Nouveau record au 10 km : 41 min 32 sec — je suis à 30 secondes de mon objectif.
Le projet Boreas (refonte frontend) a été annoncé à l'équipe cette semaine, je suis lead dev dessus.
Soirée jeux avec les amis — on a enchaîné du Catan et du Wingspan jusqu'à 2h du matin comme au bon vieux temps.`,
	avril: `Avril 2025 — Les allergies arrivent, merci les pollens de bouleau.
Gros mois au travail : le proof of concept d'Atlas est prêt, l'archi avec Kafka + Flink validée par l'équipe infra.
Rénovation : douche italienne coulée, plomberie terminée. Ça commence à ressembler à quelque chose.
Lu "Designing Data-Intensive Applications" de Kleppmann — chapitre sur le partitionnement : mon dieu c'est dense mais excellent.
Week-end à Lyon pour voir Tom et Sarah. Découvert un bouchon lyonnais incroyable (Café Comptoir Abel).
Début de la course à pied en extérieur sans gants !`,
	mai: `Mai 2025 — Les ponts du mois de mai, une semaine à ne rien faire. Presque.
Salle de bains : carrelage sol posé, jointoiement ce week-end. La fin approche.
Jardin : tout est en place ! Les tomates font déjà 50 cm, les courgettes fleurissent.
Enchaîné les 3 bouquins de la trilogie "Three-Body Problem" de Liu Cixin — vertigineux.
Vu "Dune Part Two" au cinéma (deuxième fois), la séquence sur Giedi Prime en noir et blanc reste un des meilleurs moments de cinéma de l'année.
Fitness : squat 100 kg franchi ! Objectif Q2 validé avec un mois d'avance.`,
	juin: `Juin 2025 — Rapport stage : mieux dormir a tout changé. 7h30 de sommeil en moyenne ce mois-ci.
Nouveau record au deadlift : 102.5 kg ! 
Le gros projet du mois : refonte du système de cache Redis au travail. Mise en production sans incident.
Rénovation terminée ! La salle de bains est magnifique — douche italienne, vasque suspendue, miroir LED. Le tout pour 4 200 €, soit 300 € sous le budget.
Soirée d'été chez Sarah : barbecue, pétanque, et des étoiles filantes plein le ciel.
Première récolte du potager : salade, radis, et les premières tomates cerises.`,
	juillet: `Juillet 2025 — Vacances ! Deux semaines dans les Alpes (Oisans).
Randonnée : lac de la Muzelle, refuge du Châtelleret, traversée des lacs de Lavey.
Le whoknows du mois : j'ai croisé un chamois à 50 mètres, il m'a regardé 10 minutes.
Pas touché à un écran pendant 5 jours — détox numérique puissante.
Lu "The Pragmatic Programmer" (20th ed) au bord du lac — un classique intemporel.
Retour de vacances : 5 kg de myrtilles sauvages congelées dans les bagages.
Au jardin : les tomates donnent comme jamais, les courgettes aussi.`,
	août: `Août 2025 — Canicule à Paris. Heureusement que j'ai le jardin pour m'échapper.
Les soirées sur la terrasse avec des amis sont le meilleur remède à la chaleur.
Essai d'un nouveau sport : l'escalade en salle. J'ai adoré la dimension logique (trouver le chemin optimal).
Travail : Sprint creux, l'équipe est dispersée. En profité pour faire de la documentation technique.
Lu "Fundamentals of Software Architecture" — les chapitres sur l'architecture modulaire sont très éclairants.
Vu "Past Lives" : film magnifique, une définition visuelle du "what if".`,
	septembre: `Septembre 2025 — La rentrée ! Nouvelle dynamique au travail.
Kickoff officiel du projet Atlas phase 2. L'équipe est au complet : on est 6 sur le projet.
Initié un "lunch & learn" hebdomadaire avec l'équipe — cette semaine c'était sur l'architecture hexagonale.
Fitness : reprise sérieuse après l'été. Testé une séance chez CrossFit Versailles — sympa mais pas pour moi, trop cher et trop de cardio.
Potager : récolte des courges et des potimarrons. Première soupe maison de la saison.
J'ai commencé "The Structure of Scientific Revolutions" de Kuhn — passionnant.`,
	octobre: `Octobre 2025 — Les feuilles tombent, les pulls reviennent.
Week-end en Normandie : falaises d'Étretat, cidre, et une balade sous la pluie (normale).
Au travail : on a présenté Atlas au CTO qui est impressionné. Possible budget supplémentaire pour 2026.
L'escalade devient une habitude régulière — je passe en 6A, objectif 6B avant Noël.
Book club du boulot : on a discuté "Clean Code" pendant 2 heures, débat animé sur l'utilité des commentaires.
Nouveau record au half marathon ! 1h42 en training. L'objectif 1h45 est largement dans la poche.`,
	novembre: `Novembre 2025 — Mois gris, mais productif.
Atlas : on entre dans la phase de développement intensif. Mon service de synchronisation Kafka est prêt pour la review.
Boreas : premier sprint terminé, on a livré le nouveau système de composants. L'équipe est fière.
Fitness : passage à 5×5 sur les lifts principaux. Deadlift 110 kg — objectif Q3 plus qu'atteint.
Thanksgiving improvisé avec les amis — dinde, pumpkin pie, et beaucoup trop de vin.
Commencé "Thinking, Fast and Slow" de Kahneman — chapitre 1 : les deux systèmes. Déjà des révélations.
Noël approche, je commence à réfléchir aux cadeaux (liste dans inbox).`,
	décembre: `Décembre 2025 — Dernier mois de l'année. Bilan : une bonne année.
Atlas : livré la V1 de l'infrastructure. Migration des premiers workloads prévue pour janvier.
Fitness : deadlift 115 kg, squat 105 kg, bench 72.5 kg. Objectif Q4 presque atteint (manque 5 kg au deadlift).
Nouveau record au 10 km : 40 min 52 sec ! Objectif annuel battu.
Réveillon chez Tom — soirée calme mais bonne, jeux de société et champagne.
Lu "La Peste" de Camus — étrangement réconfortant en ces temps troublés.
Bonne année ! Place à 2026.`
};

for (let i = 0; i < 12; i++) {
	const month = MONTHS_FR[i];
	const entry = JOURNAL_ENTRIES[month];
	if (entry) {
		add(
			`journal/${month}`,
			'journal',
			`${month.charAt(0).toUpperCase() + month.slice(1)} 2025\n\n${entry}`,
			48 - i * 3
		);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHOOL — 6 courses × 15 weeks × ~9 blocks each = ~810 blocks
// ═══════════════════════════════════════════════════════════════════════════════

// ── Content generators per course ─────────────────────────────────────────────

interface CourseDef {
	id: string;
	title: string;
	emoji: string;
	weeks: string[];
	/** Generate an array of { role, content } for a given week (1-indexed). */
	blocksForWeek: (week: number) => { role: string; content: string }[];
}

const COURSES: CourseDef[] = [
	// ── Math ──────────────────────────────────────────────────────────────────
	{
		id: 'math-201',
		title: 'MAT-201 — Algèbre Linéaire',
		emoji: '📐',
		weeks: [
			'Systèmes linéaires et méthodes de résolution',
			'Matrices et opérations matricielles',
			'Déterminants et leurs propriétés',
			'Espaces vectoriels et sous-espaces',
			'Applications linéaires et noyau',
			'Valeurs propres et vecteurs propres',
			'Diagonalisation et polynôme caractéristique',
			'Produit scalaire et orthogonalité',
			'Espaces euclidiens et orthonormalisation',
			'Formes quadratiques et signature',
			'Décomposition LU et pivot de Gauss',
			'Décomposition QR et Gram-Schmidt',
			'SVD — Décomposition en valeurs singulières',
			"Applications : compression d'images, data science",
			'Révision et synthèse du cours'
		],
		blocksForWeek(w: number) {
			const theme = this.weeks[w - 1];
			const concepts = [
				'combinaison linéaire',
				'indépendance linéaire',
				'base',
				'dimension',
				'rang',
				'trace',
				'déterminant',
				'polynôme caractéristique',
				'espace propre',
				'multiplicité',
				'forme bilinéaire',
				'isomorphisme'
			];
			return [
				{
					role: '📝 Cours — Synthèse',
					content: `Semaine ${w} : ${theme}

Cette semaine nous avons abordé le thème fondamental de ${theme.toLowerCase()}. 
Le concept central est que ${
						w <= 3
							? "les systèmes linéaires sont au cœur de l'algèbre : résoudre Ax = b revient à comprendre la structure de l'espace des solutions, qui est soit vide, soit un singleton, soit un sous-espace affine de dimension n−r où r est le rang de la matrice."
							: w <= 6
								? "les transformations linéaires préservent la structure d'espace vectoriel : T(λu + v) = λT(u) + T(v). Le noyau et l'image sont des sous-espaces, et le théorème du rang (dim(Ker T) + dim(Im T) = dim(E)) est l'un des résultats les plus importants du semestre."
								: w <= 9
									? "la diagonalisation est l'outil qui permet de simplifier radicalement un problème : si une matrice est diagonalisable, on peut travailler dans une base où elle est une simple matrice diagonale. Les valeurs propres sont les racines du polynôme caractéristique et la trace est la somme des valeurs propres."
									: w <= 12
										? "le produit scalaire donne une notion de longueur et d'angle dans les espaces vectoriels. Le procédé de Gram-Schmidt permet de construire une base orthonormale à partir d'une base quelconque, et les décompositions LU et QR sont des outils numériques essentiels pour résoudre des systèmes."
										: "la SVD est peut-être la décomposition la plus élégante et la plus utile : toute matrice se décompose en UΣV^T, où U et V sont orthogonales et Σ est diagonale. Cela permet la compression d'images (on ne garde que les plus grandes valeurs singulières), l'analyse en composantes principales, et le calcul du pseudo-inverse."
					}`
				},
				{
					role: '📖 Définitions clés',
					content: `Vocabulaire essentiel de la semaine ${w} :

Termes : ${concepts.slice(w % 8, (w % 8) + 4).join(', ')}.
${w <= 5 ? 'Un espace vectoriel est un ensemble muni de deux opérations (addition interne et multiplication externe) qui vérifient 8 axiomes. Les vecteurs canoniques e_i forment la base canonique de ℝ^n.' : ''}
${w > 5 && w <= 10 ? "Le polynôme caractéristique d'une matrice carrée A est det(A − λI). Ses racines sont les valeurs propres de A. La multiplicité algébrique d'une valeur propre est sa multiplicité comme racine du polynôme ; la multiplicité géométrique est la dimension de l'espace propre associé." : ''}
${w > 10 ? "La décomposition SVD d'une matrice A de taille m×n est A = UΣV^T, où U est m×m orthogonale, Σ est m×n diagonale (avec les valeurs singulières σ₁ ≥ σ₂ ≥ … ≥ 0 sur la diagonale), et V est n×n orthogonale. Les colonnes de U sont les vecteurs singuliers à gauche, les colonnes de V sont les vecteurs singuliers à droite." : ''}`
				},
				{
					role: '📐 Théorèmes & Résultats',
					content: `Théorèmes importants de la semaine ${w} :

${w <= 3 ? "Théorème de Rouché-Fontené : un système linéaire Ax = b admet des solutions ssi rang(A) = rang([A|b]). La solution générale est somme d'une solution particulière et de la solution générale du système homogène. Théorème : le rang d'une matrice est égal au nombre de pivots dans sa forme échelonnée réduite." : ''}
${w > 3 && w <= 6 ? 'Théorème du rang : pour une application linéaire T : E → F, dim(Ker T) + dim(Im T) = dim(E). Corollaire : T est injective ssi Ker T = {0}, surjective ssi Im T = F. Théorème : toute application linéaire entre espaces de dimension finie peut être représentée par une matrice.' : ''}
${w > 6 && w <= 9 ? 'Théorème : une matrice A (n×n) est diagonalisable ssi la somme des dimensions de ses espaces propres est n. Condition suffisante : si A a n valeurs propres distinctes, elle est diagonalisable. Théorème de Cayley-Hamilton : toute matrice carrée annule son polynôme caractéristique (p(A) = 0).' : ''}
${w > 9 && w <= 12 ? 'Théorème de Pythagore généralisé : si u et v sont orthogonaux dans un espace euclidien, alors ||u + v||² = ||u||² + ||v||². Inégalité de Cauchy-Schwarz : |⟨u,v⟩| ≤ ||u||·||v||, avec égalité ssi u et v sont colinéaires. Théorème : toute famille orthonormale peut être étendue en une base orthonormale.' : ''}
${w > 12 ? "Théorème de décomposition SVD : toute matrice A ∈ ℝ^{m×n} admet une décomposition A = UΣV^T où U et V sont orthogonales. Les valeurs singulières sont les racines carrées des valeurs propres de A^TA. La meilleure approximation de rang k de A (au sens de Frobenius) est obtenue en tronquant la SVD aux k plus grandes valeurs singulières (théorème d'Eckart-Young)." : ''}`
				},
				{
					role: '✏️ Exemples',
					content: `Exemples travaillés cette semaine :

${w === 1 ? 'Exemple 1 : Résoudre le système 2x + 3y − z = 5, x − y + 2z = 1, 3x + 2y − 4z = 0. En utilisant le pivot de Gauss, on obtient la matrice augmentée et on applique les opérations élémentaires L₂ ← L₂ − ½L₁, L₃ ← L₃ − ³/₂L₁... La solution est (x, y, z) = (1, 2, 3).' : ''}
${w === 2 ? "Exemple 1 : Soit A = [[1,2],[3,4]] et B = [[0,1],[1,0]]. Calculer AB, BA, A², et vérifier que AB ≠ BA (le produit matriciel n'est pas commutatif). Exemple 2 : La matrice identité I_n est l'élément neutre du produit : I_n A = A I_n = A pour toute A de taille n×n." : ''}
${w === 3 ? 'Exemple 1 : Calculer le déterminant de A = [[1,2,3],[4,5,6],[7,8,10]] par développement selon la première ligne. det(A) = 1·(5·10 − 6·8) − 2·(4·10 − 6·7) + 3·(4·8 − 5·7) = 1·(50−48) − 2·(40−42) + 3·(32−35) = 2 + 4 − 9 = −3.' : ''}
${w >= 4 && w <= 6 ? `Exemple 1 : Soit T(x,y) = (2x − y, x + 3y). Vérifier que T est linéaire. Sa matrice dans la base canonique est [[2,−1],[1,3]]. Son noyau Ker T = {(0,0)} donc T est injective. Son image est ℝ² donc T est bijective.` : ''}
${w > 6 && w <= 10 ? `Exemple 1 : Diagonaliser A = [[4,1],[2,5]]. Polynôme caractéristique : det(A − λI) = (4−λ)(5−λ) − 2 = λ² − 9λ + 18 = (λ−3)(λ−6). Valeurs propres : λ₁ = 3, λ₂ = 6. Vecteurs propres associés : v₁ = (1,−1), v₂ = (1,2). D = diag(3,6) et P = [[1,1],[−1,2]].` : ''}
${w > 10 ? `Exemple 1 : Compression d'image par SVD. Une image en niveaux de gris de 400×600 pixels est une matrice A. En calculant A = UΣV^T et en ne gardant que les 50 plus grandes valeurs singulières (sur 400), on obtient une approximation qui ne nécessite que 50×(1+400+600) ≈ 50 000 nombres au lieu de 240 000, soit une compression de ~80% avec une perte de qualité souvent acceptable.` : ''}`
				},
				{
					role: '📝 Exercices',
					content: `Exercices pour la semaine ${w} (à rendre vendredi) :

${
	w <= 3
		? '1. Résoudre les systèmes linéaires suivants par la méthode de Gauss : (a) 3x + 2y = 7, x − 4y = −5, (b) x + y + z = 6, 2x − y + z = 3, x + 2y − 3z = −4.\n2. Discuter le nombre de solutions du système paramétrique : x + ay = 1, ax + y = 1, en fonction de a ∈ ℝ.'
		: w <= 6
			? '1. Soit T : ℝ³ → ℝ³ définie par T(x,y,z) = (x−y, y+z, 2x+y−z). Trouver sa matrice, son noyau, son image, et vérifier le théorème du rang.\n2. Les vecteurs v₁ = (1,1,0), v₂ = (1,0,1), v₃ = (0,1,1) forment-ils une base de ℝ³ ?'
			: w <= 10
				? '1. Diagonaliser les matrices suivantes ou justifier pourquoi elles ne le sont pas : A = [[2,1],[0,3]], B = [[1,1],[0,1]], C = [[3,−1],[−1,3]].\n2. Calculer A^10 pour A = [[1,2],[3,2]] en utilisant la diagonalisation.'
				: '1. Appliquer le procédé de Gram-Schmidt à la famille {(1,1,0),(1,0,1),(0,1,1)}.\n2. Calculer la décomposition SVD de A = [[1,1],[0,1]].\n3. (Bonus) Écrire un programme qui comprime une image en niveaux de gris par SVD tronquée.'
}`
				},
				{
					role: '📚 Notes de lecture',
					content: `Références et lecture pour la semaine ${w} :

Obligatoire : Algèbre Linéaire (De Boeck) — Ch. ${w}.
Complémentaire : Axler "Linear Algebra Done Right" Ch. ${w + 1}.
Conseil : refaire les démonstrations des théorèmes sans les regarder.`
				},
				{
					role: '❓ Questions & points de blocage',
					content: `Questions pour le tutorat de cette semaine :

1. Pourquoi le déterminant est-il alterné ? Je comprends la définition mais pas l'intuition géométrique du signe.
2. Lien entre la diagonalisation et la décomposition en valeurs singulières — est-ce que la SVD est une généralisation de la diagonalisation aux matrices non carrées ?
3. À l'exercice 4, je trouve une solution différente de celle du corrigé mais les vérifications marchent — possible que les deux soient correctes ?
4. Quand on dit qu'une matrice est "définie positive", est-ce que ça a un rapport avec le fait que ses valeurs propres soient positives ?
Rendez-vous tutorat : jeudi 14h.`
				},
				{
					role: '✅ Résumé de la semaine',
					content: `Résumé — Semaine ${w} : ${theme}

Points clés à retenir :
✦ ${w <= 3 ? "Les systèmes linéaires se résolvent par élimination de Gauss-Jordan. Le rang détermine l'existence et l'unicité des solutions." : w <= 6 ? "Les applications linéaires sont des fonctions qui respectent les combinaisons linéaires. Le théorème du rang lie la dimension du noyau et de l'image." : w <= 9 ? 'Diagonaliser une matrice revient à trouver une base dans laquelle elle est diagonale. Cela simplifie tous les calculs (puissances, exponentielle, etc.).' : w <= 12 ? "Les produits scalaires généralisent le produit scalaire usuel de ℝ³. L'orthogonalité est un concept puissant pour décomposer les espaces." : 'La SVD est la décomposition ultime : elle existe pour toute matrice et a des applications en compression, réduction de dimension et calcul numérique.'}
✦ Objectif atteint : ${Math.random() > 0.2 ? '✅' : '🔄'} Cette semaine était dense mais les bases sont comprises.
✦ À revoir : la démonstration du théorème de ${w <= 3 ? 'Rouché-Fontené' : w <= 6 ? 'Cayley-Hamilton' : w <= 9 ? 'la diagonalisation des matrices symétriques' : w <= 12 ? 'la décomposition de Cholesky' : "l'algorithme SVD"} risque de tomber à l\'examen.`
				}
			];
		}
	},

	// ── Physics ──────────────────────────────────────────────────────────────
	{
		id: 'phy-301',
		title: 'PHY-301 — Mécanique Quantique',
		emoji: '⚛️',
		weeks: [
			'Introduction : dualité onde-particule et postulats',
			"Fonction d'onde et équation de Schrödinger",
			'Puits de potentiel et quantification',
			'Oscillateur harmonique quantique',
			'Moment cinétique et spin',
			"Atome d'hydrogène",
			'Théorie des perturbations indépendante du temps',
			'Méthodes variationnelles',
			'Particules identiques et statistiques quantiques',
			'Intrication et paradoxe EPR',
			'Téléportation quantique et information quantique',
			'Théorie quantique des champs : introduction',
			'Électrodynamique quantique (QED)',
			'Interprétations de la mécanique quantique',
			'Révision et problèmes de synthèse'
		],
		blocksForWeek(w: number) {
			return [
				{
					role: '📝 Cours — Synthèse',
					content: `Semaine ${w} : ${this.weeks[w - 1]}

${w === 1 ? "Cette semaine introductive a posé les bases conceptuelles de la mécanique quantique. La dualité onde-particule, illustrée par l'expérience des fentes de Young (où des particules individuelles créent une figure d'interférence), montre que les objets quantiques ne sont ni des ondes ni des particules classiques. Les trois postulats fondamentaux : (1) l'état d'un système est décrit par un vecteur dans un espace de Hilbert, (2) les observables sont des opérateurs hermitiens, (3) la mesure projette l'état sur un des états propres de l'observable avec une probabilité donnée par le carré du module du produit scalaire." : ''}
${w === 2 ? "L'équation de Schrödinger iℏ ∂ψ/∂t = Ĥψ est l'équation fondamentale de la mécanique quantique. Elle décrit l'évolution temporelle du système. Interprétation de Born : |ψ(x,t)|² est la densité de probabilité de présence de la particule. La fonction d'onde doit être de carré intégrable (normalisable) pour que l'interprétation probabiliste soit valide. Le principe de superposition est une conséquence directe de la linéarité de l'équation." : ''}
${w === 3 ? "Les puits de potentiel sont des modèles simples mais riches. Puits infini : niveaux d'énergie quantifiés E_n = n²π²ℏ²/(2mL²). Puits fini : nombre fini d'états liés, phénomène d'effet tunnel (probabilité non nulle de trouver la particule dans une zone classiquement interdite). L'effet tunnel est utilisé dans le microscope à effet tunnel (STM), les diodes tunnel, et la désintégration alpha." : ''}
${w === 4 ? "L'oscillateur harmonique quantique est le modèle le plus important car tout potentiel peut être approximé par un potentiel harmonique autour de son minimum. Énergies : E_n = ℏω(n + ½). États propres : polynômes d'Hermite multipliés par une gaussienne. Le niveau fondamental a une énergie non nulle E_0 = ½ℏω (énergie de point zéro), conséquence directe du principe d'incertitude." : ''}
${w === 5 ? "Le moment cinétique est un opérateur vectoriel dont les composantes satisfont [L_x, L_y] = iℏL_z. Les harmoniques sphériques Y_l^m(θ,φ) sont les fonctions propres communes de L² et L_z. Le spin est un moment cinétique intrinsèque (pas associé à un mouvement orbital). Pour l'électron : s = ½, avec deux états possibles : |↑⟩ et |↓⟩. L'expérience de Stern-Gerlach démontre la quantification du spin." : ''}
${w === 6 ? "L'atome d'hydrogène est l'un des rares systèmes exactement résolus. Potentiel coulombien V(r) = −e²/(4πε₀r). Les nombres quantiques : n (principal), l (orbital, 0 à n−1), m (magnétique, −l à l). L'énergie ne dépend que de n : E_n = −13.6 eV/n². Les orbitales atomiques (s, p, d, f) sont les fonctions propres spatiales. Le spin de l'électron ajoute le nombre quantique m_s = ±½, et le principe de Pauli interdit à deux fermions d'être dans le même état quantique." : ''}
${w === 7 ? "La théorie des perturbations indépendante du temps permet de traiter des systèmes proches d'un système soluble. Au premier ordre : ∆E_n^(1) = ⟨ψ_n⁰|H'|ψ_n⁰⟩. La correction aux états propres fait intervenir une somme sur tous les autres états. Condition de validité : |⟨ψ_m⁰|H'|ψ_n⁰⟩/(E_n⁰ − E_m⁰)| ≪ 1. Exemple typique : l'effet Stark (champ électrique constant perturbant les niveaux de l'atome d'hydrogène)." : ''}
${w === 8 ? "Les méthodes variationnelles sont utilisées quand la perturbation est trop forte. Principe : pour toute fonction d'essai ψ(α), ⟨ψ|Ĥ|ψ⟩ ≥ E_0 (énergie fondamentale). On minimise par rapport au paramètre variationnel α. Plus la fonction d'essai est proche de la vraie fonction, meilleure est l'estimation. Application classique : l'état fondamental de l'hélium (approximation avec écrantage)." : ''}
${w === 9 ? "Les particules identiques sont indiscernables en mécanique quantique. Bosons (spin entier) : fonction d'onde symétrique, statistique de Bose-Einstein. Fermions (spin demi-entier) : fonction d'onde antisymétrique, statistique de Fermi-Dirac, principe d'exclusion de Pauli. Applications : tableau périodique (Pauli explique la structure en couches), condensat de Bose-Einstein (BEC), matière dégénérée (naines blanches, étoiles à neutrons)." : ''}
${w === 10 ? "L'intrication est une corrélation quantique qui n'a pas d'équivalent classique. L'état EPR (Einstein-Podolsky-Rosen) est un état intriqué à deux particules. Le paradoxe EPR : si la mécanique quantique est complète, alors elle implique des \"actions fantômes à distance\" (ce qu'Einstein refusait). Inégalités de Bell : une expérience peut trancher entre les théories à variables cachées locales et la mécanique quantique. Les tests expérimentaux (Aspect, 1982) donnent raison à la mécanique quantique." : ''}
${w === 11 ? "L'information et la communication quantiques exploitent les phénomènes quantiques. Téléportation quantique : utiliser un état intriqué partagé (paire EPR) et deux bits classiques pour transférer un état quantique inconnu d'Alice à Bob. La cryptographie quantique (QKD, protocole BB84) permet une distribution de clé dont la sécurité est garantie par les lois de la physique. Calcul quantique : les qubits (bits quantiques) peuvent être en superposition, permettant un parallélisme exponentiel." : ''}
${w === 12 ? "Introduction à la théorie quantique des champs (QFT) : la synthèse de la mécanique quantique et de la relativité restreinte. Les particules sont des excitations des champs sous-jacents. Le champ de Klein-Gordon (spin 0), le champ de Dirac (spin ½), le champ électromagnétique (spin 1). L'antimatière émerge naturellement : pour chaque particule, il existe une antiparticule de même masse et charge opposée. Le positron (anti-électron) a été prédit par Dirac et découvert par Anderson en 1932." : ''}
${w === 13 ? "L'électrodynamique quantique (QED) est la théorie quantique des champs qui décrit l'interaction entre lumière et matière. La constante de couplage est la constante de structure fine α ≈ 1/137. Le calcul des diagrammes de Feynman permet de calculer des sections efficaces avec une précision extraordinaire. Le moment magnétique anormal de l'électron est prédit par QED avec 12 chiffres significatifs d'accord avec l'expérience — une des prédictions les plus précises de toute la physique." : ''}
${w === 14 ? "Les interprétations de la mécanique quantique sont nombreuses, sans consensus. Interprétation de Copenhague (Bohr, Heisenberg) : la fonction d'onde n'est qu'un outil de calcul, la mesure crée la réalité. Interprétation des mondes multiples (Everett) : toutes les possibilités sont réalisées dans des branches distinctes de l'univers. Interprétation de Bohm (variables cachées non locales) : les particules ont des trajectoires définies mais non locales. Décohérence : comment le monde classique émerge du monde quantique via l'interaction avec l'environnement." : ''}
${w === 15 ? "Semaine de révision et problèmes de synthèse. Nous avons revu les concepts clés du semestre : équation de Schrödinger, oscillateur harmonique, moment cinétique, atome d'hydrogène, perturbations, particules identiques. Trois problèmes de synthèse couvrent l'ensemble de la matière. L'examen final comportera deux problèmes (un de spectroscopie, un de théorie des perturbations) et des questions de cours. La difficulté est comparable aux problèmes de la semaine 15." : ''}`
				},
				{
					role: '📖 Définitions clés',
					content: `Vocabulaire — Semaine ${w} :

Hamiltonien, observable, état pur, état mixte, opérateur unitaire, commutation, valeur propre, décohérence, superposition quantique, principe d'incertitude d'Heisenberg, longueur d'onde de Broglie λ = h/p, paquet d'ondes, relation de dispersion, fonction de partition, opérateur densité, matrice S, symétrie et lois de conservation, théorème de Noether quantique.`
				},
				{
					role: '📐 Théorèmes & Résultats',
					content: `Théorèmes — Semaine ${w} :

${w <= 3 ? "Principe d'incertitude d'Heisenberg : Δx·Δp ≥ ℏ/2. Théorème d'Ehrenfest : la valeur moyenne des observables suit les équations classiques du mouvement. Théorème de Bloch : dans un potentiel périodique, les fonctions d'onde sont des ondes planes modulées par une fonction périodique." : ''}
${w > 3 && w <= 6 ? "Théorème : les valeurs propres de l'oscillateur harmonique sont E_n = ℏω(n + ½). Règles de commutation du moment cinétique : [J_i, J_j] = iℏε_{ijk}J_k. Théorème Wigner-Eckart : les éléments de matrice d'un opérateur tensoriel se factorisent en partie angulaire et partie réduite." : ''}
${w > 6 && w <= 10 ? "Théorème des perturbations (ordre 1 et 2). Inégalité variationnelle. Théorème de Pauli : les fermions ont une fonction d'onde antisymétrique. Théorème de Bell : toute théorie à variables cachées locales satisfait des inégalités incompatibles avec la mécanique quantique." : ''}
${w > 10 ? "Théorème de Noether quantique : toute symétrie continue de l'action correspond à une quantité conservée. Théorème spin-statistique : les particules de spin entier sont des bosons, de spin demi-entier sont des fermions. Théorème CPT : toute théorie quantique relativiste est invariante sous la combinaison de parité, conjugaison de charge et renversement du temps." : ''}`
				},
				{
					role: '✏️ Exercices',
					content: `Exercices — Semaine ${w} :

${w === 1 ? "1. Estimer l'énergie de point zéro d'un pendule de 1 m avec une masse de 100 g. Conclure. 2. Une particule de masse m est confinée dans une boîte 1D de taille L. Calculer les niveaux d'énergie. 3. Démontrer que Δx·Δp ≥ ℏ/2 à partir de la définition de la variance." : ''}
${w >= 2 && w <= 5 ? "1. Résoudre l'équation de Schrödinger pour un puits de potentiel infini de largeur L. Trouver les fonctions d'onde et l'énergie du niveau fondamental. 2. Calculer la probabilité de transition pour un système à deux niveaux soumis à une perturbation sinusoïdale. 3. Déterminer les valeurs propres du spin ½ pour l'opérateur S_x." : ''}
${w >= 6 && w <= 10 ? "1. Calculer le déplacement des niveaux d'énergie de l'atome d'hydrogène sous l'effet d'un champ électrique constant (effet Stark linéaire). Discuter quels niveaux sont dégénérés. 2. Estimer l'énergie fondamentale de l'hélium par la méthode variationnelle avec une fonction d'essai simple. 3. Montrer que l'état singulet de deux spins ½ est intriqué et violerait l'inégalité de Bell." : ''}
${w > 10 ? "1. Dans l'expérience de pensée EPR, montrer que la mesure de la position d'une particule détermine la position de l'autre instantanément. 2. Calculer la durée de vie d'un état excité par émission spontanée en QED. 3. Problème de synthèse : un électron dans une molécule diatomique. Modéliser par un potentiel à deux puits et discuter la liaison chimique." : ''}`
				},
				{
					role: '📚 Références',
					content: `Références — Semaine ${w} :

Obligatoire : Griffiths, "Introduction to Quantum Mechanics", Ch. ${w}.
Complémentaire : Feynman Lectures Vol. III, Ch. ${Math.ceil(w / 2)}.
Approfondissement : Sakurai, "Modern Quantum Mechanics", sections ${w}-${w + 1}.
Préparation examen : refaire les exercices du TD et les problèmes des années précédentes.`
				},
				{
					role: '❓ Questions',
					content: `Questions — Semaine ${w} :

1. Dans l'interprétation de Copenhague, où s'arrête le monde quantique et où commence le classique ? La frontière est-elle arbitraire ?
2. L'effet tunnel semble violer la conservation de l'énergie classique — peut-on le comprendre comme une fluctuation quantique permise par le principe d'incertitude temps-énergie ?
3. L'intrication permet-elle vraiment de transmettre de l'information plus vite que la lumière ? (Non, mais pourquoi exactement ?)
4. En QED, les diagrammes de Feynman avec des boucles divergent — comment la renormalisation résout-elle ce problème ?`
				},
				{
					role: '✅ Résumé',
					content: `Semaine ${w} — ${this.weeks[w - 1]}

✦ Concept principal : l'équation de Schrödinger et ses solutions.
✦ Compétences acquises : résolution de problèmes à une dimension, calcul de probabilités quantiques.
✦ Difficultés : ${w < 5 ? "le formalisme mathématique (espaces de Hilbert, opérateurs) demande encore de l'entraînement." : w < 10 ? 'la théorie des perturbations demande de bien comprendre les ordres de grandeur.' : "les concepts d'intrication et de non-localité sont contre-intuitifs."}
✦ Objectif semaine prochaine : ${w < 15 ? 'lire le chapitre ' + (w + 1) + ' avant le cours.' : "réviser l'ensemble du semestre pour l'examen final."}`
				}
			];
		}
	},

	// ── CS ────────────────────────────────────────────────────────────────────
	{
		id: 'cs-410',
		title: 'CS-410 — Algorithmes & Structures de Données',
		emoji: '💻',
		weeks: [
			'Analyse de complexité et notation asymptotique',
			'Algorithmes de tri : fusion, rapide, par tas',
			'Structures : piles, files, listes chaînées',
			'ABR et arbres équilibrés (AVL, rouge-noir)',
			'Tables de hachage et fonctions de hachage',
			'Files de priorité et tas binaires',
			'Algorithmes sur les graphes : BFS, DFS',
			'Chemins minimaux : Dijkstra, Bellman-Ford',
			'Union-Find et arbres couvrants (Kruskal, Prim)',
			'Programmation dynamique : principes et exemples',
			'Algorithmes gloutons',
			'Flot maximal (Ford-Fulkerson, Edmonds-Karp)',
			'Algorithmes de string matching (KMP, Rabin-Karp)',
			'Géométrie algorithmique : enveloppe convexe',
			'Révisions et problèmes de synthèse'
		],
		blocksForWeek(w: number) {
			return [
				{
					role: '📝 Cours — Synthèse',
					content: `Semaine ${w} : ${this.weeks[w - 1]}

${w === 1 ? "L'analyse de complexité est l'outil fondamental pour raisonner sur l'efficacité des algorithmes. La notation grand O (O, Ω, Θ, o) permet de comparer la croissance asymptotique des fonctions sans se soucier des constantes multiplicatives ou des termes d'ordre inférieur. Classes classiques : O(1) (constant), O(log n) (logarithmique), O(n) (linéaire), O(n log n), O(n²) (quadratique), O(2^n) (exponentiel). L'analyse au cas par cas (pire, moyen, meilleur) est essentielle. Exemple : recherche séquentielle O(n) dans le pire cas, mais Ω(1) dans le meilleur." : ''}
${w === 2 ? "Les algorithmes de tri sont les plus étudiés de l'informatique. Tri fusion (merge sort) : O(n log n) garanti, stable, utilise O(n) mémoire. Tri rapide (quick sort) : O(n log n) en moyenne, O(n²) dans le pire cas, en place (in-place) mais pas stable. Tri par tas (heap sort) : O(n log n) garanti, en place, pas stable. Le choix dépend du contexte : quicksort est généralement le plus rapide en pratique malgré son pire cas théorique." : ''}
${w === 3 ? "Structures de données linéaires fondamentales. Pile (stack) : LIFO, opérations push/pop en O(1). File (queue) : FIFO, opérations enqueue/dequeue en O(1). Listes chaînées : insertion/suppression en O(1) si on a le pointeur, accès en O(n). Listes doublement chaînées : permet la navigation dans les deux sens. Applications : piles pour l'évaluation d'expressions et le backtracking, files pour les algorithmes BFS et les buffers." : ''}
${w === 4 ? "Les arbres binaires de recherche (ABR) offrent recherche, insertion et suppression en O(h) où h est la hauteur. Dans le pire cas (arbre dégénéré), h = O(n). Les arbres équilibrés (AVL, rouge-noir) garantissent h = O(log n) en rééquilibrant après chaque insertion/suppression. Les arbres AVL sont plus strictement équilibrés (facteur d'équilibre −1, 0, +1), les arbres rouge-noir sont plus permissifs mais tournent moins souvent." : ''}
${w === 5 ? 'Les tables de hachage offrent une recherche en O(1) en moyenne. Fonction de hachage idéale : déterministe, uniforme, rapide à calculer. Résolution des collisions : chaînage (liste chaînée par bucket), adressage ouvert (sondage linéaire, quadratique, double hachage). Facteur de charge α = n/m : plus α est proche de 1, plus il y a de collisions. Réhachage (rehashing) quand α dépasse un seuil (souvent 0.75, comme dans HashMap de Java).' : ''}
${w === 6 ? "Les files de priorité permettent d'accéder à l'élément de priorité maximale/minimale en O(1). Implémentation classique : le tas binaire (binary heap) — arbre binaire presque complet où chaque parent a une priorité supérieure à ses enfants. Insertion : O(log n). Extraction du min/max : O(log n). Construction d'un tas à partir d'un tableau : O(n) (procédure heapify). Applications : tri par tas, algorithme de Dijkstra, codage de Huffman, ordonnancement de processus." : ''}
${w === 7 ? "Les graphes sont une structure omniprésente. BFS (parcours en largeur) : O(V + E) pour un graphe représenté par listes d'adjacence. Utilise une file, donne les chemins les plus courts en nombre d'arêtes dans un graphe non pondéré. DFS (parcours en profondeur) : O(V + E). Utilise une pile (récursif ou itératif). Applications : détection de cycles, ordre topologique (pour DAG), composantes fortement connexes (Tarjan, Kosaraju)." : ''}
${w === 8 ? "L'algorithme de Dijkstra trouve le plus court chemin d'une source à tous les autres nœuds dans un graphe pondéré à poids positifs. Complexité : O((V + E) log V) avec un tas binaire. Bellman-Ford : O(VE), gère les poids négatifs et détecte les cycles négatifs. Floyd-Warshall : O(V³), calcule tous les plus courts chemins entre toutes les paires en une fois. A* (vu rapidement) : Dijkstra avec heuristique pour guider la recherche." : ''}
${w === 9 ? "Union-Find (Disjoint Set Union) est une structure élégante pour gérer des ensembles disjoints. Opérations : find (trouve le représentant) et union (fusionne deux ensembles). Optimisations : compression de chemin (path compression) et union par rang/taille. Complexité quasi-constante : amorti O(α(n)) où α est l'inverse de la fonction d'Ackermann. Application star : l'algorithme de Kruskal pour l'arbre couvrant de poids minimal (MST). Prim : O(E log V) avec un tas, adapté aux graphes denses." : ''}
${w === 10 ? "La programmation dynamique (DP) est une méthode puissante pour les problèmes d'optimisation avec sous-structure optimale et sous-problèmes qui se chevauchent. Principe : résoudre chaque sous-problème une fois, mémoriser le résultat (mémoïsation, bottom-up). Exemples classiques : fibonacci (DP trivial), rendu de monnaie, distance d'édition (Levenshtein), plus longue sous-séquence commune (LCS), sac à dos (knapsack), multiplication de chaînes de matrices." : ''}
${w === 11 ? "Les algorithmes gloutons (greedy) font le choix optimal local à chaque étape, en espérant atteindre un optimum global. Ça ne marche que pour certaines classes de problèmes (matroïdes, etc.). Exemples qui marchent : rendu de monnaie avec système canonique, codage de Huffman, Kruskal/Prim, ordonnancement d'intervalles (sélection d'activités). Contre-exemple classique : le problème du rendu de monnaie avec un système non canonique." : ''}
${w === 12 ? "Le problème de flot maximal : combien de flux peut-on faire passer d'une source à un puits dans un réseau capacitif ? Algorithme de Ford-Fulkerson : tant qu'il existe un chemin augmentant (dans le graphe résiduel), on y ajoute du flot. Complexité : O(E·|f|) où |f| est la valeur du flot maximal. Edmonds-Karp (BFS pour trouver les chemins) : O(VE²). Applications : réseau de transport, ordonnancement (project selection problem), coupe minimale (théorème flot-max/coupe-min)." : ''}
${w === 13 ? "String matching : trouver toutes les occurrences d'un pattern dans un texte. Algorithme naïf : O(n·m). Algorithme KMP (Knuth-Morris-Pratt) : O(n + m) grâce à la fonction d'échec (prefix function / pi-table) qui évite de revenir en arrière dans le texte. Rabin-Karp : O(n + m) en moyenne, utilise une fonction de hachage roulante (rolling hash) pour comparer le pattern avec chaque fenêtre du texte en O(1). Applications : recherche dans un éditeur, détection de plagiat, bio-informatique." : ''}
${w === 14 ? "Géométrie algorithmique : algorithmes pour résoudre des problèmes géométriques. Question fondamentale : l'enveloppe convexe d'un ensemble de points. Algorithme de Graham Scan : O(n log n). Trier les points par angle polaire, puis \"parcourir\" en maintenant une pile. Marché de Jarvis (gift wrapping) : O(nh) où h est le nombre de points sur l'enveloppe. Applications : vision par ordinateur, détection de collision, analyse de données (shape analysis)." : ''}
${w === 15 ? 'Révision générale et problèmes de synthèse couvrant les thèmes suivants : tri avancé, hachage, structures arborescentes, graphes (chemin, MST, flot), programmation dynamique, string matching. Les problèmes mélangent les techniques. Examen : 3 problèmes, 3 heures. Un problème sur les graphes (type chemin critique), un de DP, un de string matching ou géométrie. Pas de notes autorisées sauf une feuille A4 manuscrite.' : ''}`
				},
				{
					role: '📖 Concepts & Définitions',
					content: `Concepts — Semaine ${w} :

Notation asymptotique, complexité temporelle et spatiale, pire/moyen/meilleur cas, analyse amortie, récurrences, master theorem, arbre de récursion, invariant de boucle, correction d'algorithme, terminaison.`
				},
				{
					role: '💻 Implémentation clé',
					content: `${w === 1 ? 'Analyse de quelques boucles : calcul de 1 + 2 + ... + n, O(n) vs O(n²) vs O(log n).' : ''}
${w === 2 ? 'Implémenter merge sort. Pseudo-code dans le cours. Noter la fusion (merge) en O(n) avec un tableau temporaire.' : ''}
${w === 3 ? 'Implémenter une pile avec un tableau dynamique (amorti O(1)). Attention au redimensionnement.' : ''}
${w === 4 ? "Implémenter l'insertion et la rotation dans un AVL. Cas : gauche-gauche, droite-droite, gauche-droite, droite-gauche." : ''}
${w === 5 ? 'Fonction de hachage pour les chaînes : polynomiale (h(s) = Σ s[i]·p^i mod m). p = 31 ou 131.' : ''}
${w === 6 ? "Implémenter la procédure heapify (construction en O(n)). L'astuce : descendre les éléments un par un." : ''}
${w === 7 ? 'BFS : utiliser une file, marquer les nœuds visités. Pour retrouver le chemin : stocker le parent.' : ''}
${w === 8 ? 'Dijkstra : tas binaire, relaxer les arêtes. Détection de cycle négatif : Bellman-Ford.' : ''}
${w === 9 ? 'Union-Find avec compression de chemin : find(x) { if (parent[x] != x) parent[x] = find(parent[x]); return parent[x]; }' : ''}
${w === 10 ? 'DP pour LCS : tableau 2D, remplir par lignes. Reconstruction : suivre les flèches.' : ''}
${w === 11 ? "Sélection d'activités : trier par fin, prendre la prochaine compatible la plus tôt." : ''}
${w === 12 ? 'Edmonds-Karp : BFS dans le graphe résiduel. Stocker le prédécesseur pour retrouver le chemin.' : ''}
${w === 13 ? 'KMP : construire la pi-table (longest proper prefix which is also suffix) en O(m).' : ''}
${w === 14 ? 'Graham Scan : tri par angle polaire (ou par x puis y), gift wrapping phase.' : ''}
${w === 15 ? 'Révisions : refaire tous les implémentations clés sans regarder le cours.' : ''}`
				},
				{
					role: '✏️ Exercices',
					content: `Exercices — Semaine ${w} :

${w <= 3 ? "1. Prouver par récurrence que le tri fusion est correct. 2. Comparer les performances empiriques de merge sort, quick sort (avec différents choix de pivot), et heap sort sur des tableaux de 10⁴ à 10⁶ éléments. 3. Écrire un algorithme de tri en O(n + k) où k est la taille de l'alphabet (tri par comptage)." : ''}
${w > 3 && w <= 6 ? '1. Insérer 10 éléments dans un AVL en montrant les rotations. 2. Discuter le choix de la fonction de hachage : pourquoi 31 est-il un bon multiplicateur pour les chaînes ? 3. Implémenter un cache LRU avec une hash map + liste doublement chaînée.' : ''}
${w > 6 && w <= 10 ? '1. Appliquer Dijkstra sur un petit graphe à la main. 2. Démontrer que Kruskal produit bien un MST (preuve par coupure). 3. Résoudre le problème du sac à dos en programmation dynamique (0/1).' : ''}
${w > 10 ? '1. Appliquer Ford-Fulkerson sur un réseau de 6 nœuds. 2. Calculer le plus long palindrome dans une chaîne en O(n²) puis O(n). 3. Résoudre le problème des "N Reines" par backtracking (application DFS).' : ''}`
				},
				{
					role: '📚 Références',
					content: `Références — Semaine ${w} :

Obligatoire : Introduction to Algorithms (CLRS), Ch. ${w * 2 + 10}.
Complémentaire : Grokking Algorithms (Aditya Bhargava) — excellent pour l'intuition.
Approfondissement : The Art of Computer Programming (Knuth) Vol. ${Math.ceil(w / 5)}.`
				},
				{
					role: '❓ Questions',
					content: `Questions — Semaine ${w} :

1. Pourquoi quick sort est-il plus rapide en pratique que merge sort malgré son pire cas O(n²) ? (Cache locality, moins de mouvements mémoire.)
2. Est-ce que P=NP ? (Non, probablement pas. Mais la question reste ouverte.)
3. Dans quelle mesure l'analyse asymptotique reflète-t-elle la réalité sur des données de taille modérée ?
4. La programmation dynamique est-elle toujours préférable à un algorithme glouton quand elle existe ? (Non : parfois le surcoût en mémoire et en code n'en vaut pas la peine pour des données structurées.)`
				},
				{
					role: '✅ Résumé',
					content: `Semaine ${w} — ${this.weeks[w - 1]}

✦ Compétences : analyse de complexité, implémentation de structures.
✦ Projet à rendre : ${w < 15 ? 'implémenter un analyseur de fréquence de mots avec une table de hachage, un ABR et un tas pour comparer les performances (deadline semaine ' + (w + 2) + ').' : 'projet final de synthèse : un petit moteur de recherche avec indexation et classement.'}
✦ Note : ${w < 8 ? "les concepts de cette semaine sont fondamentaux pour la suite — bien les maîtriser avant d'avancer." : 'les algorithmes de graphes sont cruciaux pour les entretiens techniques.'}`
				}
			];
		}
	},

	// ── Biology ──────────────────────────────────────────────────────────────
	{
		id: 'bio-202',
		title: 'BIO-202 — Biologie Moléculaire',
		emoji: '🧬',
		weeks: [
			"Structure de l'ADN et des chromosomes",
			"Réplication de l'ADN",
			'Transcription et maturation des ARN',
			'Traduction et code génétique',
			"Régulation de l'expression génique",
			"Réparation de l'ADN et recombinaison",
			'Génomique et séquençage',
			'Épigénétique et modifications des histones',
			'ARN non codants et interférence',
			'Biologie des cellules souches',
			'Cancérogenèse moléculaire',
			'Apoptose et voies de signalisation',
			'Technologies : CRISPR, PCR, séquençage nouvelle génération',
			'Biologie synthétique et ingénierie génétique',
			'Révision et synthèse'
		],
		blocksForWeek(w: number) {
			return [
				{
					role: '📝 Cours — Synthèse',
					content: `Semaine ${w} : ${this.weeks[w - 1]}

${w === 1 ? "L'ADN (acide désoxyribonucléique) est la molécule porteuse de l'information génétique. Structure en double hélice découverte par Watson & Crick (1953) grâce aux données de diffraction de Rosalind Franklin. Les nucléotides (A, T, G, C) s'apparient spécifiquement : A-T (2 liaisons hydrogène), G-C (3 liaisons hydrogène). Le génome humain contient ~3.2 milliards de paires de bases, organisés en 23 paires de chromosomes. Les télomères (extrémités des chromosomes) se raccourcissent à chaque division cellulaire — mécanisme clé du vieillissement." : ''}
${w === 2 ? "La réplication de l'ADN est semi-conservatrice (chaque brin sert de matrice au nouveau brin). Complexe de réplication : hélicase (déroule l'ADN), topoisomérase (relâche la torsion), primase (amorce ARN), ADN polymérase III (synthèse du brin leader en continu, brin retardé en fragments d'Okazaki), ADN polymérase I (remplace les amorces ARN par de l'ADN), ligase (relie les fragments). Fourche de réplication : les deux brins sont synthétisés dans des directions opposées. Précision : 1 erreur pour 10⁹ paires de bases." : ''}
${w === 3 ? "La transcription transforme l'ADN en ARN messager (ARNm). ARN polymérase II lit le brin matrice de 3' à 5' et synthétise l'ARNm de 5' à 3'. Chez les eucaryotes : maturation post-transcriptionnelle — ajout de la coiffe 5' (7-méthylguanosine), épissage (splicing) des introns par le spliceosome, et ajout de la queue poly-A en 3'. L'épissage alternatif permet de générer plusieurs protéines à partir d'un même gène — le génome humain de 20 000 gènes code peut-être 100 000 protéines différentes." : ''}
${w === 4 ? "La traduction synthétise les protéines à partir de l'ARNm sur les ribosomes. Le code génétique est universel (presque) : 64 codons (4³) codent pour 20 acides aminés + signal STOP. Code dégénéré : plusieurs codons pour le même acide aminé (souvent la 3e base varie). ARN de transfert (ARNt) : adaptateur entre codon et acide aminé. Anticodon s'apparie au codon selon l'appariement classique (A-U, G-C) avec un wobble en 3e position. Initiation (AUG → Met), élongation, terminaison (UAA/UAG/UGA). Activez les ribosomes : polysomes." : ''}
${w === 5 ? "La régulation de l'expression génique est essentielle pour que chaque cellule exprime les bons gènes au bon moment. Opéron lactose chez E. coli : exemple historique (Jacob & Monod, prix Nobel 1965). Chez les eucaryotes : facteurs de transcription (TF), enhancers/silencers, promoteurs, médiateur. Complexe de remodelage de la chromatine (SWI/SNF) : modifie l'accessibilité à l'ADN. Voie de signalisation : ligand → récepteur → cascade de phosphorylation → facteur de transcription → expression génique." : ''}
${w === 6 ? "Les dommages à l'ADN sont constants : rayons UV (dimères de thymine), radicaux libres (oxydation), erreurs de réplication. Mécanismes de réparation : réparation par excision de base (BER), réparation par excision de nucléotide (NER), réparation des mésappariements (MMR), réparation des cassures double-brin (NHEJ, recombination homologue). Syndrome Xeroderma Pigmentosum : mutation dans le système NER, les patients doivent éviter totalement le soleil. Les défauts de réparation sont associés à de nombreux cancers." : ''}
${w === 7 ? "La génomique étudie les génomes à grande échelle. Séquençage Sanger (méthode classique) : 500-1000 pb par réaction. NGS (next-generation sequencing, Illumina) : séquence des centaines de millions de fragments en parallèle. Génome humain : premier séquençage ~3 milliards $ (2003), aujourd'hui ~1000 $. Projets : 1000 Genomes Project, UK Biobank, Human Cell Atlas. Bio-informatique : alignement (BWA, Bowtie), assemblage (de Bruijn graphs), annotation (identification des gènes, variants)." : ''}
${w === 8 ? "L'épigénétique est l'étude des changements héréditaires qui n'altèrent pas la séquence d'ADN. Méthylation de l'ADN (sur les cytosines CpG) : généralement réprime la transcription. Modifications des histones : acétylation (active), méthylation (active ou répressive selon le contexte). Empreinte parentale (imprinting) : certains gènes ne sont exprimés que d'un seul parent. X-inactivation (corpuscule de Barr) : un des deux chromosomes X chez la femelle est inactivé aléatoirement. Les modifications épigénétiques peuvent être transmises aux descendants." : ''}
${w === 9 ? "Les ARN non codants (ncRNA) sont des ARN qui ne sont pas traduits en protéines. Micro-ARN (miRNA, 22 nt) : régulent l'expression génique en se liant à l'ARNm cible (bloquent la traduction ou induisent la dégradation). Petit ARN interférent (siRNA) : utilisés en thérapie pour faire taire des gènes spécifiques. ARN longs non codants (lncRNA) : >200 nt, rôles variés (régulation, échafaudage). CRISPR-Cas9 : système de défense bactérien adapté en outil d'édition génomique — révolutionne la biologie moléculaire." : ''}
${w === 10 ? 'Les cellules souches ont deux propriétés : auto-renouvellement et différenciation. Cellules souches embryonnaires (ES) : pluripotentes (donnent tous les types cellulaires). Cellules souches adultes : multipotentes (limitées à un tissu). Cellules iPS (Yamanaka, prix Nobel 2012) : cellules somatiques reprogrammées par 4 facteurs (Oct4, Sox2, Klf4, c-Myc). Applications : thérapie cellulaire (Parkinson, diabète, lésions médullaires), modèles de maladies (organoïdes), tests de médicaments. Défis : contrôle de la différenciation, tumorigenèse, aspects éthiques.' : ''}
${w === 11 ? "Le cancer est une maladie génétique : accumulation de mutations dans des gènes clés. Oncogènes : versions mutées de proto-oncogènes (Ras, Myc, PI3K) qui favorisent la prolifération. Gènes suppresseurs de tumeur : p53 (gardien du génome), Rb, BRCA1/2 (réparation ADN). Hallmarks du cancer (Hanahan & Weinberg) : auto-suffisance en signaux de croissance, insensibilité aux signaux anti-croissance, évasion de l'apoptose, potentiel réplicatif illimité, angiogenèse, invasion/métastases, reprogrammation métabolique, évasion immunitaire." : ''}
${w === 12 ? "L'apoptose (mort cellulaire programmée) est essentielle au développement et à l'homéostasie. Voie intrinsèque (mitochondriale) : stress cellulaire → perméabilisation de la membrane mitochondriale → libération du cytochrome c → activation des caspases. Voie extrinsèque (récepteurs de mort) : Fas/TNF → récepteur → cascade de caspases. Les caspases sont des protéases qui dégradent la cellule de l'intérieur. Bcl-2 : famille de protéines anti-apoptotiques (Bcl-2, Bcl-XL) et pro-apoptotiques (Bax, Bak). Le déséquilibre entre survie et mort est central dans le cancer et les maladies neurodégénératives." : ''}
${w === 13 ? "Technologies révolutionnaires : CRISPR-Cas9 (Doudna & Charpentier, prix Nobel 2020) : guide ARN + Cas9 = coupe spécifique d'un locus. Applications : knock-out, knock-in, correction de mutations, thérapie génique (ex : traitement de la drépanocytose, approuvé 2023). PCR (Kary Mullis, prix Nobel 1993) : amplification exponentielle de l'ADN. qPCR : quantification en temps réel. Séquençage nouvelle génération (Illumina, PacBio, Oxford Nanopore) : long reads (Nanopore : jusqu'à 2 Mb). Bio-informatique : analyse des variants (SNP, indels, SV), RNA-seq, ChIP-seq, single-cell seq." : ''}
${w === 14 ? 'La biologie synthétique vise à concevoir et construire des systèmes biologiques artificiels. Circuits génétiques : interrupteurs (toggle switch), oscillateurs (repressilator), biocapteurs. Synthèse de génomes : premier génome synthétique (Mycoplasma mycoides, Craig Venter 2010). Applications : production de biocarburants, médicaments (artémisinine synthétique), bioremédiation, matériaux bio-inspirés. Éthique : biosécurité, bioterrorisme, "dual use". Organismes génétiquement modifiés (OGM) : débats réglementaires et sociétaux.' : ''}
${w === 15 ? 'Révision du semestre. Thèmes principaux : (1) Structure et fonction de l\'ADN, (2) Flux d\'information (ADN → ARN → protéine), (3) Régulation de l\'expression, (4) Réparation et génomique, (5) Biologie cellulaire et moléculaire avancée. Examen : QCM (30%), questions de développement (40%), analyse de données de séquençage (30%). Préparez-vous en relisant les articles discutés en TD, notamment : "CRISPR-Cas9 : the gene-editing revolution" (Nature, 2024) et "Single-cell sequencing reveals new cell types" (Science, 2024).' : ''}`
				},
				{
					role: '🔬 Concepts clés',
					content: `Concepts — Semaine ${w} :

${w <= 3 ? 'Nucléotide, base azotée, complémentarité, double hélice, réplication semi-conservatrice, fourche de réplication, Okazaki, télomère, télomérase, transcription, promoteur, ARN polymérase, épissage, spliceosome, coiffe, poly-A, exon, intron.' : ''}
${w > 3 && w <= 7 ? "Ribosome, codon, anticodon, wobble, traduction, facteurs d'initiation, site A/P/E, polysome, opéron, facteur de transcription, enhancer, remodelage de la chromatine, dimère de thymine, NER, BER, NHEJ, recombinaison homologue, NGS, alignement, variant." : ''}
${w > 7 && w <= 11 ? 'Méthylation, histone, acétylation, épigénétique, imprinting, miARN, siARN, CRISPR, Cas9, ARN guide, cellule souche, iPS, Yamanaka, organoïde, oncogène, suppresseur de tumeur, p53, mutation, hallmarks of cancer.' : ''}
${w > 11 ? 'Caspase, apoptose, cytochrome c, Bcl-2, biologie synthétique, circuit génétique, biosécurité, dual use, thérapie génique.' : ''}`
				},
				{
					role: '🧪 Expérience clé',
					content: `${w === 1 ? "Expérience de Meselson-Stahl (1958) : marquage à l'azote lourd ¹⁵N, centrifugation en gradient de CsCl. Résultat : la réplication est semi-conservatrice." : ''}
${w === 2 ? "Observations de la fourche de réplication par microscopie électronique (Kornberg). Fragments d'Okazaki : 1000-2000 pb chez les procaryotes, 100-200 pb chez les eucaryotes." : ''}
${w === 3 ? "Expérience de split-gene : chez les eucaryotes, les gènes sont entrecoupés d'introns (Roberts & Sharp, prix Nobel 1993)." : ''}
${w === 4 ? "Expérience de Nirenberg (1961) : synthèse d'un ARNm poly-U → poly-phénylalanine. Premier codon décodé : UUU = Phénylalanine." : ''}
${w === 5 ? "Opéron lactose (Jacob & Monod) : en présence de lactose et absence de glucose, l'opéron est activé. Modèle de régulation génétique." : ''}
${w === 6 ? 'Expérience de la lampe UV (Setlow) : les dimères de thymine sont réparés par excision de nucléotide. Découverte de la réparation par excision.' : ''}
${w === 7 ? 'Projet Génome Humain (1990-2003). Séquençage Sanger vs NGS. Visualisation des données de séquençage avec IGV.' : ''}
${w === 8 ? "Expérience de la souris agouti : la méthylation de l'allèle agouti détermine la couleur du pelage et la santé de la descendance." : ''}
${w === 9 ? "Découverte de l'ARN interférence : Fire & Mello (prix Nobel 2006). Injection d'ARN double-brin chez C. elegans → extinction spécifique des gènes." : ''}
${w === 10 ? 'Reprogrammation cellulaire : Yamanaka (2006) — 4 facteurs suffisent à transformer des fibroblastes en cellules iPS.' : ''}
${w === 11 ? 'La mutation de p53 est présente dans >50% des cancers. "Guardian of the genome" : p53 arrête le cycle cellulaire en cas de dommage à l\'ADN.' : ''}
${w === 12 ? "Expérience de Kerr, Wyllie & Currie (1972) : première description morphologique de l'apoptose. Condensation nucléaire, corps apoptotiques." : ''}
${w === 13 ? "CRISPR-Cas9 : fabrication d'un guide ARN, formation du complexe, coupure spécifique. Réparation par NHEJ ou HDR." : ''}
${w === 14 ? 'Synthèse du premier génome bactérien (Mycoplasma laboratorium, JCVI-syn1.0, 2010). "Watermark" dans le génome : messages codés.' : ''}
${w === 15 ? "Travaux pratiques : extraction d'ADN, PCR du gène de la bêta-globine, électrophorèse sur gel, analyse de résultats." : ''}`
				},
				{
					role: '✏️ Exercices',
					content: `Exercices — Semaine ${w} :

${w <= 3 ? "1. Dessiner la double hélice et annoter les composants (phosphate, désoxyribose, bases, liaisons hydrogène). 2. Calculer le nombre de fragments d'Okazaki pour la réplication du chromosome humain (taille ~250 Mb, fragment ~150 pb). 3. Comparer la maturation des ARNm eucaryotes et procaryotes." : ''}
${w > 3 && w <= 6 ? "1. Traduire la séquence d'ARNm suivante : AUGGCUAAAUUUGCUAGUGAAGGU... 2. Expliquer pourquoi le code génétique est dégénéré et en quoi cela protège contre les mutations. 3. Décrire les mécanismes de réparation des cassures double-brin." : ''}
${w > 6 && w <= 10 ? "1. Conception d'une expérience CRISPR pour knock-out du gène TP53 dans des cellules HeLa. 2. Interpréter des données RNA-seq : identifier les gènes différentiellement exprimés. 3. Comparer les cellules souches embryonnaires et iPS en termes de potentiel, sécurité et éthique." : ''}
${w > 10 ? "1. Analyser les mutations d'un gène suppresseur de tumeur dans des données TCGA. 2. Expliquer le mécanisme d'action du Gleevec (inhibiteur de tyrosine kinase) dans la leucémie myéloïde chronique. 3. Concevoir un circuit génétique senseur de glucose chez E. coli." : ''}`
				},
				{
					role: '📚 Références',
					content: `Références — Semaine ${w} :

Obligatoire : Alberts et al., "Molecular Biology of the Cell", 7th ed. — Ch. ${w + 4}.
Complémentaire : Lodish et al., "Molecular Cell Biology".
Articles : Nature Reviews Molecular Cell Biology, Cell, Science.
Podcast : "This Week in Virology" (TWiV), épisode ${w * 5}.`
				},
				{
					role: '❓ Questions',
					content: `Questions — Semaine ${w} :

1. La méthylation de l\'ADN est-elle toujours répressive ? Exceptions connues.
2. Pourquoi certaines personnes sont-elles naturellement résistantes au VIH ? (Mutation CCR5-Δ32)
3. L\'épigénétique peut-elle expliquer des différences entre jumeaux monozygotes ?
4. CRISPR-Cas9 peut-elle être utilisée in vivo sans vecteur viral ? (Oui : nanoparticles lipidiques.)
5. Les cellules iPS sont-elles vraiment identiques aux cellules embryonnaires ?`
				},
				{
					role: '✅ Résumé',
					content: `Semaine ${w} — ${this.weeks[w - 1]}

✦ Points clés : ${w <= 3 ? "flux d'information génétique, réplication et transcription" : w <= 6 ? 'traduction, régulation, réparation ADN' : w <= 10 ? 'génomique, épigénétique, cellules souches' : 'cancer, apoptose, technologies avancées'}.
✦ Difficulté : ${w <= 5 ? 'mécanismes moléculaires — beaucoup de noms à retenir' : w <= 10 ? 'concepts intégrés — lien entre moléculaire et cellulaire' : 'applications thérapeutiques — comprendre la logique translationnelle'}.
✦ Prochain TP : manipulation de séquences avec Python (Biopython).`
				}
			];
		}
	},

	// ── Economics ────────────────────────────────────────────────────────────
	{
		id: 'eco-101',
		title: 'ECO-101 — Microéconomie',
		emoji: '📊',
		weeks: [
			"Introduction : rareté, choix, coût d'opportunité",
			'Offre et demande : équilibre de marché',
			'Élasticités et leurs applications',
			'Théorie du consommateur : utilité et budget',
			"Courbes d'indifférence et effet de substitution",
			'Production et coûts',
			'Concurrence parfaite',
			'Monopole et pouvoir de marché',
			'Concurrence monopolistique et oligopole',
			'Théorie des jeux : équilibre de Nash',
			'Externalités et biens publics',
			'Marché du travail et capital humain',
			'Économie du bien-être et efficacité',
			"Asymétrie d'information : sélection adverse, aléa moral",
			'Révision et examen blanc'
		],
		blocksForWeek(w: number) {
			return [
				{
					role: '📝 Cours — Synthèse',
					content: `Semaine ${w} : ${this.weeks[w - 1]}

${w === 1 ? "La microéconomie étudie les choix individuels dans un monde de rareté. Le coût d'opportunité est le concept fondamental : tout choix a un coût égal à la meilleure option non choisie. La frontière des possibilités de production (FPP) illustre les trade-offs : produire plus d'un bien implique d'en produire moins d'un autre. Efficacité : impossible d'améliorer la situation de quelqu'un sans détériorer celle d'un autre (efficacité Pareto). L'analyse marginale (comparer le bénéfice marginal au coût marginal) est l'outil de décision central." : ''}
${w === 2 ? "Le modèle de l'offre et de la demande est le fondement de la microéconomie. La loi de la demande : quantité demandée diminue quand le prix augmente (effet de substitution + effet de revenu). Loi de l'offre : quantité offerte augmente quand le prix augmente. L'équilibre de marché (intersection offre-demande) détermine le prix et la quantité échangée. Les chocs d'offre (ex : mauvaises récoltes) ou de demande (ex : changements de goûts) déplacent les courbes et créent un nouvel équilibre." : ''}
${w === 3 ? "L'élasticité mesure la sensibilité de la quantité demandée (ou offerte) aux variations de prix. Élasticité-prix de la demande : ε_D = |%ΔQ / %ΔP|. Si |ε_D| > 1 : demande élastique (luxe). Si |ε_D| < 1 : demande inélastique (nécessité, insuline). Élasticité-revenu : biens normaux (ε_R > 0) vs inférieurs (ε_R < 0). Élasticité croisée : biens substituables (ε_croisé > 0) vs complémentaires (ε_croisé < 0). Applications : taxation (la taxe pèse plus sur le côté le plus inélastique), pricing stratégique." : ''}
${w === 4 ? "Le consommateur maximise son utilité sous contrainte budgétaire. Utilité totale et marginale : loi de l'utilité marginale décroissante. Contrainte budgétaire : R = P_x·X + P_y·Y. Panier optimal : là où la droite de budget est tangente à la courbe d'indifférence, soit UM_x/P_x = UM_y/P_y (égalisation des utilités marginales par euro dépensé). Fonction d'utilité : Cobb-Douglas U = X^α Y^β, parfaitement substituables, compléments parfaits (Leontief)." : ''}
${w === 5 ? "Quand le prix d'un bien change, deux effets se produisent. Effet de substitution : le bien devient relativement plus cher, le consommateur le remplace par d'autres. Effet de revenu : le pouvoir d'achat change. Pour les biens normaux : les deux effets vont dans le même sens (baisse de prix → demande augmente). Pour les biens inférieurs : l'effet de revenu va dans le sens inverse (baisse de prix → demande diminue via l'effet revenu). Si l'effet de revenu domine l'effet de substitution → bien Giffen (très rare)." : ''}
${w === 6 ? "La production transforme les facteurs de production (capital K, travail L) en biens. Fonction de production : Q = f(K, L). Loi des rendements marginaux décroissants : au-delà d'un point, l'apport d'une unité supplémentaire d'un facteur (l'autre fixe) augmente la production de moins en moins. Court terme : au moins un facteur fixe. Long terme : tous les facteurs variables. Rendements d'échelle : croissants (f(λK, λL) > λQ), constants, décroissants. Coûts : fixe, variable, total (CT = CF + CV), moyen, marginal (Cm = ΔCT/ΔQ)." : ''}
${w === 7 ? "La concurrence parfaite est un modèle théorique caractérisé par : atomicité, homogénéité, transparence, libre entrée/sortie. Entreprise preneuse de prix (price taker) : sa courbe de demande horizontale. Maximisation du profit : Rm = Cm (ou P = Cm en concurrence parfaite). Court terme : profit positif ou négatif, l'entreprise produit tant que P > CVm. Long terme : entrée des concurrents → profit nul (P = Cm = CM). Surplus du consommateur et du producteur : mesure du bien-être social." : ''}
${w === 8 ? "Le monopole est un marché avec un seul vendeur. Barrières à l'entrée : brevets, ressources uniques, économies d'échelle, réglementation. Le monopole est faiseur de prix (price maker) : sa courbe de demande est descendante. Recette marginale < prix (car plus on vend, plus le prix baisse sur toutes les unités). Maximisation : Rm = Cm → prix plus élevé et quantité plus faible qu'en concurrence parfaite. Perte sèche (deadweight loss) : inefficacité allocative. Discrimination par les prix (1er, 2e, 3e degré) : capter du surplus." : ''}
${w === 9 ? "Concurrence monopolistique : nombreux vendeurs, différenciation du produit (marques, qualité, localisation). Courbe de demande descendante mais plus élastique qu'en monopole. Court terme : profit. Long terme : entrée → la demande se déplace jusqu'à profit nul (mais prix > Cm, donc inefficacité). Oligopole : quelques vendeurs interdépendants. Duopole de Cournot : concurrence en quantités. Duopole de Bertrand : concurrence en prix → paradoxe de Bertrand (deux concurrents suffisent au prix de concurrence parfaite). Collusion : cartel (illégal !)." : ''}
${w === 10 ? 'La théorie des jeux analyse les interactions stratégiques. Éléments : joueurs, stratégies, paiements. Équilibre de Nash : chaque joueur choisit sa meilleure réponse aux stratégies des autres (aucun incitation à dévier unilatéralement). Dilemme du prisonnier : coopération (tacite) vs trahison (rationalité individuelle). Stratégies dominantes : meilleure réponse quelle que soit la stratégie adverse. Jeux séquentiels : arbre de décision, induction à rebours (backward induction). Stratégies mixtes : randomisation. Application : enchères, négociations, concurrence.' : ''}
${w === 11 ? "Les externalités sont des effets d'une transaction sur des tiers non impliqués. Externalité négative (pollution) : coût social > coût privé. Externalité positive (éducation, recherche) : bénéfice social > bénéfice privé. Solutions de marché : théorème de Coase (si droits de propriété bien définis et faibles coûts de transaction, les agents négocient l'internalisation). Solutions publiques : taxe pigouvienne ( = coût social marginal), subvention, réglementation, quotas d'émission, permis négociables. Biens publics : non-rivaux et non-excluables → problème du passager clandestin." : ''}
${w === 12 ? "Le marché du travail : offre de travail (arbitrage travail/loisir), demande de travail (productivité marginale = salaire). Salaire d'équilibre. Rente de rareté pour les travailleurs très qualifiés. Capital humain : l'investissement dans l'éducation et la formation augmente la productivité et les salaires. Théorie du signal (Spence) : l'éducation peut n'être qu'un signal de capacité. Discrimination sur le marché du travail : tests de Becker, discrimination statistique. Salaire minimum : débat sur ses effets (perte d'emplois vs lutte contre la pauvreté)." : ''}
${w === 13 ? "L'économie du bien-être étudie l'efficacité et l'équité. Premier théorème du bien-être : tout équilibre concurrentiel est Pareto-optimal. Deuxième théorème : toute allocation Pareto-optimale peut être réalisée comme un équilibre concurrentiel après redistribution forfaitaire (lump-sum). Limites : nécessite concurrence parfaite, pas d'externalités, information parfaite. Fonction de bien-être social (Bentham utilitariste : somme des utilités ; Rawls maximin : maximiser le bien-être du plus défavorisé). Indice de Gini : mesure des inégalités (0 = égalité parfaite, 1 = inégalité totale)." : ''}
${w === 14 ? "L'asymétrie d'information : une partie a plus d'information que l'autre. Sélection adverse (adverse selection) : problème avant la transaction. Akerlof (1970) — \"The Market for Lemons\" : les mauvaises voitures chassent les bonnes du marché. Solutions : garanties, certification, signal. Aléa moral (moral hazard) : comportement risqué après la transaction (ex : assuré moins prudent). Solutions : franchise, incitations, monitoring. Relation principal-agent : l'agent agit pour le principal mais a des intérêts divergents. Problème du principal-agent dans l'entreprise (actionnaires/dirigeants), en politique (électeurs/élus)." : ''}
${w === 15 ? "Examen blanc transverse. Les thèmes suivants sont à réviser prioritairement : offre/demande et élasticités, théorie du consommateur, monopole et concurrence, théorie des jeux (dilemme du prisonnier), externalités et biens publics, asymétrie d'information. L'examen comportera : 10 QCM, 3 exercices de calcul, 2 questions de réflexion. Durée : 2h. Documents autorisés : une feuille A4 manuscrite recto-verso." : ''}`
				},
				{
					role: '📖 Définitions',
					content: `Vocabulaire — Semaine ${w} :

Coût d'opportunité, analyse marginale, équilibre partiel vs général, surplus, élasticité, utilité marginale, courbe d'indifférence, taux marginal de substitution (TMS), contrainte budgétaire, sentier d'expansion, rendements d'échelle, seuil de rentabilité, pouvoir de marché, indice de Lerner, concentration (HHI), équilibre de Nash, stratégie dominante, dilemme du prisonnier, externalité, bien public, taxe pigouvienne, sélection adverse, aléa moral.`
				},
				{
					role: '📐 Théorèmes & Modèles',
					content: `Modèles — Semaine ${w} :

${w <= 3 ? 'Loi de la demande : variation du prix → mouvement le long de la courbe. Variation des autres facteurs (revenu, goûts) → déplacement de la courbe. Élasticité-prix : formule du point milieu pour calculer entre deux points.' : ''}
${w > 3 && w <= 6 ? "Condition d'équilibre du consommateur : UM_x / P_x = UM_y / P_y. Fonction de Cobb-Douglas : parts budgétaires constantes. Loi des rendements décroissants. Relation entre CM et Cm : quand Cm < CM, le CM diminue ; quand Cm > CM, le CM augmente." : ''}
${w > 6 && w <= 10 ? 'Maximisation du profit en concurrence parfaite : P = Cm. En monopole : Rm = Cm. Équilibre de Nash en stratégies pures et mixtes. Dilemme du prisonnier : itéré → coopération possible (Friedman, 1971).' : ''}
${w > 10 ? 'Théorème de Coase : internalisation par négociation si droits de propriété et faibles coûts de transaction. Premier théorème du bien-être : efficacité de la concurrence parfaite. Modèle de Spence (signaling) : éducation comme signal de productivité.' : ''}`
				},
				{
					role: '✏️ Exercices',
					content: `Exercices — Semaine ${w} :

${w <= 3 ? "1. Une pizzeria vend 100 pizzas par jour à 12 €. Le prix passe à 14 €, les ventes chutent à 80. Calculer l'élasticité-prix de la demande. Interpréter. 2. Le revenu moyen des consommateurs augmente de 5%, les ventes de pizzas augmentent de 8%. Calculer l'élasticité-revenu. Type de bien ?" : ''}
${w > 3 && w <= 6 ? '1. Un consommateur a un revenu de 100 €. P_x = 5 €, P_y = 10 €. Écrire la contrainte budgétaire et tracer la droite. 2. U(X,Y) = X·Y. Trouver le panier optimal. 3. Fonction de production Q = 10·√(K·L). Calculer le produit marginal du travail pour K=16, L=25.' : ''}
${w > 6 && w <= 10 ? "1. Un monopole a Cm = 10 et une demande P = 100 − Q. Trouver la quantité qui maximise le profit et le prix. Comparer à la concurrence parfaite. 2. Matrice de gains du dilemme du prisonnier : identifier l'équilibre de Nash. 3. Deux entreprises en duopole de Cournot. Trouver l'équilibre." : ''}
${w > 10 ? "1. Une aciérie pollue une rivière. Coût marginal privé = 20 + Q, coût marginal externe = 10. Demande : P = 100 − Q. Trouver l'équilibre de marché et l'optimum social. Calculer la taxe pigouvienne optimale. 2. Marché des voitures d'occasion : les bonnes valent 20 000 €, les mauvaises 5 000 €. Les acheteurs n'observent pas la qualité. Expliquer l'équilibre de sélection adverse." : ''}`
				},
				{
					role: '📰 Application réelle',
					content: `Actualité — Semaine ${w} :

${w === 1 ? 'Le coût d\'opportunité des études supérieures : 3 ans de salaire perdu (~60 000 €) + frais de scolarité. Le "graduate premium" justifie-t-il cet investissement ?' : ''}
${w === 2 ? 'Le marché du pétrole en 2025 : offre (OPEP+), demande (transition énergétique), chocs géopolitiques. Prix du baril : ~75 $.' : ''}
${w === 3 ? "Taxe sur le soda en France. L'élasticité-prix de la demande de sodas est d'environ −0.8. La taxe réduit-elle efficacement la consommation ?" : ''}
${w === 4 ? 'Services de streaming : abonnement Netflix vs Disney+ vs Spotify. Les consommateurs maximisent-ils vraiment leur utilité ? Biais comportementaux.' : ''}
${w === 5 ? 'Le Giffen paradoxe (riz en Chine) : débat académique. Existe-t-il vraiment ? La famine irlandaise de la pomme de terre.' : ''}
${w === 6 ? "Tesla et les rendements d'échelle dans la production de batteries. Gigafactory : économies d'échelle massives." : ''}
${w === 7 ? 'Le marché du transport aérien low-cost (Ryanair) : concurrence parfaite ? Atomicité, homogénéité, transparence — pas vraiment.' : ''}
${w === 8 ? "Apple et l'App Store : monopole ? La commission de 30% est-elle abusive ? Affaire Epic Games vs Apple (2024 : la cour ordonne le sideloading)." : ''}
${w === 9 ? 'Marché des smartphones : Apple (iOS) vs Samsung/Google (Android) — duopole ? Concurrence monopolistique ?' : ''}
${w === 10 ? "Enchères du spectre 5G : théorie des jeux appliquée. L'enchère combinatoire de la FCC." : ''}
${w === 11 ? 'Taxe carbone aux frontières (CBAM, EU 2026) : externalité environnementale, taxe pigouvienne sur les importations carbonées.' : ''}
${w === 12 ? 'Salaire minimum : aux US, débat sur le "Fight for 15". Études récentes : impact faible sur l\'emploi (Card & Krueger).' : ''}
${w === 13 ? "Dépenses publiques : comparaison France (58% du PIB) vs États-Unis (37%). Efficacité de l'État-providence ?" : ''}
${w === 14 ? 'Marché des "lemons" dans la crypto : les mauvaises pièces chassent les bonnes. Régulation MiCA en Europe.' : ''}
${w === 15 ? "Révisions : revoir les applications réelles de chaque chapitre. Bonne chance pour l'examen !" : ''}`
				},
				{
					role: '❓ Questions de réflexion',
					content: `Questions — Semaine ${w} :

1. Le PIB est-il une bonne mesure du bien-être ? Quelles alternatives (IDH, Bonheur national brut, Better Life Index) ?
2. La rationalité parfaite est-elle réaliste ? Que nous apprend l\'économie comportementale (Kahneman, Tversky, Thaler) ?
3. Le marché peut-il tout réguler ? Y a-t-il des biens qui ne devraient pas être marchands (santé, éducation, organes) ?
4. La croissance économique est-elle compatible avec les limites planétaires ? Découplage possible ou décroissance ?`
				},
				{
					role: '✅ Résumé',
					content: `Semaine ${w} — ${this.weeks[w - 1]}

✦ Concept central : ${w <= 3 ? "l'équilibre de marché par la rencontre de l'offre et de la demande" : w <= 6 ? 'la maximisation sous contrainte (consommateur et producteur)' : w <= 10 ? "l'interdépendance stratégique et le pouvoir de marché" : 'les défaillances de marché et leurs remèdes'}.
✦ Mots-clés : ${this.weeks[w - 1].toLowerCase().split(' ').slice(0, 3).join(', ')}.
✦ Note de la semaine : ${Math.round(14 + Math.random() * 4)}/20.
✦ À faire : relire le chapitre ${w} et faire les exercices supplémentaires en ligne (site de l\'éditeur).`
				}
			];
		}
	},

	// ── Art History ──────────────────────────────────────────────────────────
	{
		id: 'art-101',
		title: "ART-101 — Histoire de l'Art Moderne",
		emoji: '🎨',
		weeks: [
			"Introduction : qu'est-ce que l'art moderne ?",
			'Impressionnisme : Monet, Renoir, Degas',
			'Post-Impressionnisme : Van Gogh, Gauguin, Cézanne',
			'Art Nouveau et Symbolisme',
			'Fauvisme et Expressionnisme',
			'Cubisme : Picasso, Braque, Gris',
			'Futurisme et Abstraction',
			'Dada et Surréalisme',
			'Bauhaus et le Modernisme',
			'Expressionnisme abstrait : Pollock, Rothko',
			'Pop Art : Warhol, Lichtenstein',
			'Minimalisme et Art conceptuel',
			'Art contemporain : installation, performance',
			'Art et technologie : numérique, IA',
			'Révision : synthèse des mouvements'
		],
		blocksForWeek(w: number) {
			return [
				{
					role: '📝 Cours — Synthèse',
					content: `Semaine ${w} : ${this.weeks[w - 1]}

${w === 1 ? "L'art moderne (1860-1970) est une rupture avec la tradition académique. L'invention de la photographie libère la peinture de son devoir de représentation réaliste. Trois grandes questions : qu'est-ce que l'art ? Qui décide ce qui est de l'art ? Quel est le rôle de l'artiste ? L'art moderne se caractérise par une remise en cause permanente des conventions — chaque mouvement rejette le précédent. Le Salon des Refusés (1863) marque le début de l'art officiel contesté. Les grands bouleversements : industrialisation, urbanisation, guerre mondiale, psychanalyse — tout change la perception du monde." : ''}
${w === 2 ? 'L\'Impressionnisme (1874-1886) est le premier mouvement résolument moderne. Les peintres quittent l\'atelier pour peindre en plein air ("en plein air"). Ils capturent la lumière changeante, les reflets sur l\'eau, la vie parisienne moderne. Monet : série des Nymphéas, des Cathédrales de Rouen (même sujet, lumières différentes). Renoir : le bonheur de vivre, les bals populaires (Bal du Moulin de la Galette). Degas : les danseuses, les courses, les femmes à leur toilette. La première exposition impressionniste (1874, atelier de Nadar) est un scandale. Le mot "impressionniste" était une insulte (venant de "Impression, soleil levant" de Monet).' : ''}
${w === 3 ? 'Le Post-Impressionnisme est un terme fourre-tout pour les successeurs de l\'Impressionnisme. Van Gogh : le peintre maudit (oreille coupée, suicide à 37 ans). Sa peinture est expression de l\'émotion intérieure par la couleur pure et la touche tourmentée. "La Nuit étoilée", "Les Tournesols", "La Chambre à Arles". Gauguin : fuit la civilisation pour Tahiti, couleurs vives, formes simplifiées, symbolisme. Cézanne : "traiter la nature par le cylindre, la sphère, le cône" — il annonce le cubisme. Les demoiselles d\'Avignon (Picasso, 1907) est influencé par Cézanne et l\'art africain.' : ''}
${w === 4 ? 'L\'Art Nouveau (1890-1910) est un mouvement décoratif total : architecture, mobilier, verrerie, affiche. Lignes courbes, inspiration végétale, rejet des styles historiques. Mucha : affiches de Sarah Bernhardt, femmes aux cheveux longs dans des volutes florales. Guimard : stations de métro parisiennes (les fameuses "libellules" vertes). Gaudi : Casa Batlló, Sagrada Familia à Barcelone. Le Symbolisme : plus littéraire, mystique. Moreau, Redon, Klimt. Le "Baiser" de Klimt : or, motifs décoratifs, érotisme contenu. Freud et la psychanalyse influencent l\'exploration des rêves et de l\'inconscient.' : ''}
${w === 5 ? 'Le Fauvisme (1905-1907) : la couleur comme émotion pure. Matisse, Derain, Vlaminck. "Fauves" = fauves, nom donné par le critique Vauxcelles scandalisé par la violence des couleurs. Matisse : "La Danse", "La Joie de Vivre" — couleurs pures, dessin simplifié, bonheur de peindre. L\'Expressionnisme allemand (1905-1925) : Munch ("Le Cri", 1893 — angoisse existentielle), Kirchner ("Die Brücke" — le Pont), Kandinsky avant l\'abstraction. L\'expressionnisme est l\'art de l\'émotion intérieure projetée sur la toile par la distorsion, la couleur arbitraire, la violence du trait.' : ''}
${w === 6 ? 'Le Cubisme (1907-1914) est peut-être la révolution la plus radicale de l\'art moderne. Picasso et Braque : décomposer les objets en facettes géométriques, montrer plusieurs points de vue simultanément. "Les Demoiselles d\'Avignon" (Picasso, 1907) : cinq prostituées, visages africains et ibériques, corps anguleux. Cubisme analytique (1909-1912) : monochrome, fragmentation extrême, difficile à lire. Cubisme synthétique (1912-1914) : collage, papiers collés, lettres, retour de la couleur. Juan Gris : le plus "pur" des cubistes. Conséquence libératrice : la peinture n\'a plus à imiter la réalité.' : ''}
${w === 7 ? 'Le Futurisme (1909-1914, Italie) : culte de la vitesse, de la machine, de la guerre ("seule hygiène du monde"). Marinetti, Boccioni, Balla. Peindre le mouvement, la simultanéité, la dynamique. "Le chien en laisse" de Balla : les pattes du chien sont multipliées. L\'Abstraction : Kandinsky (première aquarelle abstraite, 1910), Malevitch (Carré noir sur fond blanc, 1915 — "degré zéro de la peinture"), Mondrian (Composition avec rouge, jaune, bleu — néoplasticisme). Suprématisme, De Stijl. L\'abstraction est le grand projet de l\'art moderne : se libérer de toute référence au monde visible.' : ''}
${w === 8 ? 'Dada (1916-1923) : né à Zurich pendant la guerre, c\'est l\'anti-art. Rejet de toutes les conventions, provocation, absurdité. Duchamp : le readymade ("Fontaine" = urinoir signé, 1917). "L\'Héritage de Dada : l\'art peut être n\'importe quoi si l\'artiste le décide." Le Surréalisme (1924-1966) : Breton, "Manifeste du Surréalisme" (1924) — "Automatisme psychique pur." Explorer l\'inconscient, le rêve, l\'automatisme. Dali : montres molles ("La Persistance de la mémoire"), paranoïa-critique. Magritte : "Ceci n\'est pas une pipe" (La Trahison des images). Miró : biomorphisme abstrait. Ernst : frottage, collage. Buñuel : "Un chien andalou" (film).' : ''}
${w === 9 ? "Le Bauhaus (1919-1933) est la plus célèbre école d'art, de design et d'architecture du XXe siècle. Gropius, Meyer, Mies van der Rohe (directeurs). Principe : \"la forme suit la fonction\" — union de l'art et de l'artisanat, de l'esthétique et de l'industrie. Klee, Kandinsky, Itten, Moholy-Nagy (professeurs). Le Bauhaus a inventé le design moderne : mobilier (chaise Wassily de Breuer), typographie (sans-serif), architecture (toit plat, fenêtres en bande, verre et acier). Fermé par les nazis en 1933. Exil des artistes Bauhaus aux États-Unis → influence mondiale. Mies van der Rohe : \"Less is more.\"" : ''}
${w === 10 ? 'L\'Expressionnisme abstrait (1940-1950, New York — "École de New York") : première fois que l\'avant-garde mondiale n\'est pas en Europe. Action painting (Pollock) : dripping, all-over, le geste du peintre est l\'œuvre. "Autumn Rhythm", "Number 1". Pollock : "Je suis la nature." Color field painting (Rothko) : grands champs de couleur flottante, méditation spirituelle. Les "Chapel Rothko" à Houston : 14 toiles noires/marron — contemplation. De Kooning : "Woman" series — figure féminine agressive, gestuelle violente. La peinture américaine devient dominante. Le peintre est un héros tragique (mythe de l\'artiste maudit).' : ''}
${w === 11 ? 'Le Pop Art (1950-1960) : l\'art de la société de consommation. Warhol : "Dans le futur, tout le monde sera célèbre pendant 15 minutes." Sérigraphies de Marilyn, Elvis, Mao, boîtes de soupe Campbell\'s. "Factory" : production en série, l\'art comme business. Lichtenstein : BD agrandies, points Benday, "Whaam!". Oldenburg : sculptures molles d\'objets quotidiens (hamburger géant). Le Pop Art est anglais avant d\'être américain (Richard Hamilton, "Just what is it that makes today\'s homes so different, so appealing?"). Il abolit la frontière entre culture haute et culture populaire, art et marchandise.' : ''}
${w === 12 ? "Le Minimalisme (1960) : la réaction contre l'expressionnisme et le pop. Judd : \"Specific objects\" — boîtes métalliques identiques alignées au mur. Flavin : néons fluorescents. Serra : lames d'acier Corten (\"Tilted Arc\" — démontée après controverse). Art conceptuel (1965-1975) : l'idée prime sur l'objet. Kosuth : \"One and Three Chairs\" (chaise réelle + photo + définition du dictionnaire). Weiner : \"Having been torn, having been folded, having been erased.\" Le texte est l'œuvre. Art & Language : groupe britannique. L'art conceptuel pousse la question à l'extrême : si l'idée est l'œuvre, l'exécution peut être déléguée, voire inexistante." : ''}
${w === 13 ? 'L\'art contemporain (1970-aujourd\'hui) échappe aux classifications. Installation : l\'œuvre occupe tout l\'espace (Eliasson, "The Weather Project" au Tate Modern). Performance : l\'artiste donne son corps (Abramovic, "The Artist is Present" — assise en silence face aux visiteurs). Art relationnel : l\'interaction sociale est l\'œuvre (Rirkrit Tiravanija — cuisiner du curry dans une galerie). Bourgeois : araignées monumentales (Maman, 1999). Beuys : "Tout le monde est un artiste", "How to Explain Pictures to a Dead Hare". Hirst : requin dans le formol ("The Physical Impossibility of Death in the Mind of Someone Living"). Le marché de l\'art contemporain : foires (Art Basel, FIAC), maisons de vente (Christie\'s, Sotheby\'s).' : ''}
${w === 14 ? "L'art et la technologie : une histoire longue (Nam June Paik, vidéo art dès 1960). Art numérique : algorithme, génératif (Vera Molnár, Frieder Nake). Internet art : net.art, web as medium. Art IA : DALL-E, Midjourney, GAN — l'IA peut-elle être créatrice ? Œuvres : \"Portrait of Edmond Belamy\" (Obvious, 2018, vendu 432 000 $ chez Christie's). Hito Steyerl : vidéos sur la culture numérique (\"How Not to Be Seen: A Fucking Didactic Educational .MOV File\"). Art et réalité virtuelle : nouvelles expériences immersives. L'art à l'ère de la reproductibilité technique (Benjamin) revisitée par la block-chain : NFT, certificats d'authenticité numériques." : ''}
${w === 15 ? "Synthèse du semestre. Les grands mouvements en frise chronologique : Impressionnisme (1870) → Post-Impressionnisme (1885) → Fauvisme/Expressionnisme (1905) → Cubisme (1907) → Abstraction (1910) → Dada (1916) → Surréalisme (1924) → Bauhaus (1919) → Expressionnisme Abstrait (1945) → Pop Art (1955) → Minimalisme/Conceptuel (1965) → Contemporain (1970+). L'examen : identification d'œuvres (20 images), questions de contextualisation, un plan de dissertation. Œuvres à connaître absolument : Les Nymphéas (Monet), Les Demoiselles d'Avignon (Picasso), Le Cri (Munch), La Persistance de la Mémoire (Dali), Carré Noir (Malevitch), Campbell's Soup Cans (Warhol), Autumn Rhythm (Pollock), One and Three Chairs (Kosuth)." : ''}`
				},
				{
					role: '🖼️ Œuvres clés de la semaine',
					content: `Œuvres à retenir — Semaine ${w} :

${w === 1 ? '— "Impression, soleil levant" (Monet, 1872)\n— "Le Déjeuner sur l\'herbe" (Manet, 1863)\n— "Olympia" (Manet, 1863)' : ''}
${w === 2 ? '— "Impression, soleil levant" (Monet, 1872)\n— "Bal du moulin de la Galette" (Renoir, 1876)\n— "La Gare Saint-Lazare" (Monet, 1877)\n— "Les Nymphéas" (Monet, 1914-1926)' : ''}
${w === 3 ? '— "La Nuit étoilée" (Van Gogh, 1889)\n— "Les Tournesols" (Van Gogh, 1888)\n— "La Montagne Sainte-Victoire" (Cézanne, 1904-1906)\n— "D\'où venons-nous ? Que sommes-nous ? Où allons-nous ?" (Gauguin, 1897)' : ''}
${w === 4 ? '— "Le Baiser" (Klimt, 1908)\n— "Salomé" (Moreau, 1876)\n— Stations Guimard (Paris, 1900)\n— Sagrada Familia (Gaudi, 1882-...)' : ''}
${w === 5 ? '— "La Danse" (Matisse, 1910)\n— "Le Cri" (Munch, 1893)\n— "Paysage aux arbres jaunes" (Kirchner, 1913)\n— "Cheval bleu I" (Marc, 1911)' : ''}
${w === 6 ? '— "Les Demoiselles d\'Avignon" (Picasso, 1907)\n— "Nature morte à la chaise cannée" (Picasso, 1912)\n— "Portrait de Picasso" (Gris, 1912)\n— "Violon et palette" (Braque, 1909)' : ''}
${w === 7 ? '— "Carré noir sur fond blanc" (Malevitch, 1915)\n— "Composition II en rouge, jaune et bleu" (Mondrian, 1929)\n— "Le chien en laisse" (Balla, 1912)\n— "Formes uniques de la continuité dans l\'espace" (Boccioni, 1913)' : ''}
${w === 8 ? '— "Fontaine" (Duchamp, 1917)\n— "La Persistance de la mémoire" (Dali, 1931)\n— "Ceci n\'est pas une pipe" (Magritte, 1929)\n— "Le Jeu lugubre" (Dali, 1929)' : ''}
${w === 9 ? '— Chaise Wassily (Breuer, 1925)\n— "Zett" (Klee, 1927)\n— Bauhaus building Dessau (Gropius, 1926)\n— "Composition VIII" (Kandinsky, 1923)' : ''}
${w === 10 ? '— "Autumn Rhythm" (Pollock, 1950)\n— "No. 14 (Grey, Green, Blue, Yellow, Red)" (Rothko, 1952)\n— "Woman I" (De Kooning, 1952)\n— "Abstract Number 3" (Still, 1949)' : ''}
${w === 11 ? '— "Campbell\'s Soup Cans" (Warhol, 1962)\n— "Marilyn Diptych" (Warhol, 1962)\n— "Whaam!" (Lichtenstein, 1963)\n— "Floor Burger" (Oldenburg, 1962)' : ''}
${w === 12 ? '— "Untitled (Stack)" (Judd, 1967)\n— "One and Three Chairs" (Kosuth, 1965)\n— "The Equivalent of 8" (Flavin, 1966)\n— "Tilted Arc" (Serra, 1981)' : ''}
${w === 13 ? '— "Maman" (Bourgeois, 1999)\n— "The Physical Impossibility of Death in the Mind of Someone Living" (Hirst, 1991)\n— "The Weather Project" (Eliasson, 2003)\n— "The Artist is Present" (Abramovic, 2010)' : ''}
${w === 14 ? '— "Portrait of Edmond Belamy" (Obvious, 2018)\n— "TV Buddha" (Paik, 1974)\n— "How Not to Be Seen" (Steyerl, 2013)\n— "Everydays: The First 5000 Days" (Beeple, 2021)' : ''}
${w === 15 ? '— Toutes les œuvres du semestre à connaître.' : ''}`
				},
				{
					role: '📖 Concepts & Vocabulaire',
					content: `Vocabulaire artistique — Semaine ${w} :

Plein air, touche divisée, couleur locale vs couleur perçue, perspective chromatique, modelé, raccourci, hachure, grisaille, sfumato, clair-obscur, composition diagonale, symétrie/asymétrie, rythme, motif, all-over, figure/fond, négatif/positif, réserve, glacis, empâtement, dripping, grattage, frottage, collage, assemblage, installation, performance, ready-made, happening, fluxus.`
				},
				{
					role: '✏️ Exercices',
					content: `Exercices — Semaine ${w} :

1. Fiche d'analyse d'œuvre : choisir une œuvre de la semaine et répondre : contexte, description formelle, interprétation, postérité.
2. Comparaison formelle : mettre en parallèle deux œuvres de mouvements différents (ex : un Monet et un Pollock — que disent-ils de la lumière ?).
3. Dissertation (format examen) : "En quoi l'art moderne est-il une rupture ?" ou "Le beau est-il encore un critère de l'art contemporain ?"
4. Lecture : lire le texte correspondant dans Gombrich ("Histoire de l'Art") ou dans le manuel.`
				},
				{
					role: '📚 Références & Visites',
					content: `Références — Semaine ${w} :

Manuel : Ch. ${w + 18} de "Histoire de l\'Art" (Gombrich) ou ${w + 12} de "Art : A World History".
Lecture : ${w === 1 ? '"Qu\'est-ce que l\'art ?" (Tolstoy, 1897) — extraits' : w === 2 ? '"Le Peintre de la vie moderne" (Baudelaire, 1863)' : w === 8 ? '"Manifeste du Surréalisme" (Breton, 1924)' : w === 9 ? '"Le Bauhaus" (Wingler, 1969)' : w === 14 ? "\"L'Œuvre d'art à l'époque de sa reproductibilité technique\" (Benjamin, 1936)" : ''}
Musées : Musée d\'Orsay (Paris), MoMA (New York), Centre Pompidou, Tate Modern, Guggenheim Bilbao.`
				},
				{
					role: '❓ Discussion',
					content: `Questions pour la semaine ${w} :

1. Qu\'est-ce qui distingue un objet d\'art d\'un objet ordinaire ? (Duchamp a-t-il vraiment fait de l\'art en exposant un urinoir ?)
2. L\'art contemporain est-il accessible sans médiation (cartel, guide, cours) ? Doit-il être expliqué ?
3. Le marché de l\'art est-il compatible avec l\'intégrité artistique ? (Vente aux enchères, spéculation, blanchiment.)
4. L\'IA peut-elle faire de l\'art ? Qui est l\'auteur d\'une œuvre générée par IA ?`
				},
				{
					role: '✅ Résumé',
					content: `Semaine ${w} — ${this.weeks[w - 1]}

✦ Contexte historique : ${w <= 3 ? 'fin du XIXe siècle — industrialisation, vie moderne, découverte de la photographie.' : w <= 7 ? 'avant-gardes du début du XXe — guerres mondiales, psychanalyse, physique quantique.' : w <= 11 ? 'après-guerre — guerre froide, société de consommation, médias de masse.' : 'fin du XXe / début XXIe — mondialisation, numérique, crise écologique.'}
✦ Œuvre favorite perso : ${['Nymphéas', 'La Nuit étoilée', "Les Demoiselles d'Avignon", 'Le Cri', 'Fontaine', 'Autumn Rhythm', "Campbell's Soup Cans", 'One and Three Chairs'][w % 8]}.
✦ Niveau de compréhension : ${Math.round(6 + Math.random() * 4)}/10 — encore des progrès sur l\'analyse formelle.`
				}
			];
		}
	}
];

// ── Build all school blocks ──────────────────────────────────────────────────

for (const course of COURSES) {
	const courseId = id('school', course.id);
	add(courseId, 'school', `${course.emoji} ${course.title}`, 44);

	for (let w = 1; w <= 15; w++) {
		const weekId = id(courseId, `week-${w}`);
		const weekTheme = course.weeks[w - 1];
		add(weekId, courseId, `Semaine ${w} — ${weekTheme}`, 44 - w * 2);

		const blocks = course.blocksForWeek(w);
		for (let bi = 0; bi < blocks.length; bi++) {
			const block = blocks[bi];
			const contentId = id(weekId, `${w}-${bi}`);
			add(
				contentId,
				weekId,
				`${block.role}\n\n${block.content}`,
				44 - w * 2 + blocks.indexOf(block)
			);
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORK
// ═══════════════════════════════════════════════════════════════════════════════

// ── Projet Atlas — Migration Cloud ──────────────────────────────────────────

add('atlas', 'work', '☁️ Projet Atlas — Migration Cloud', 40);
add(
	'atlas/description',
	'atlas',
	`Projet Atlas — Migration de l'infrastructure on-premise vers le cloud (AWS).
Objectif : migrer 120 serveurs, 3 bases de données, et 15 microservices d'ici décembre 2025.
Budget : 450 k€. Équipe : 6 personnes (moi, 2 devops, 1 architecte cloud, 2 devs).
Stack cible : AWS EKS (Kubernetes), RDS PostgreSQL, ElastiCache Redis, S3, CloudFront.
Deadline : POC en mars, migration des premiers workloads en juin, migration complète en décembre.

Ma responsabilité : conception de l'architecture de migration, coordination des sprints, et implémentation du pipeline de synchronisation des données.`,
	38
);

add('atlas/specs', 'atlas', '📋 Spécifications techniques', 38);
add(
	'atlas/specs/architecture',
	'atlas/specs',
	`Architecture cible — Atlas Migration

┌─ Client ──────┬─────────────── Cloud AWS ──────────────────────────┐
│  CloudFront   │  ALB → EKS (Kubernetes) → Microservices            │
│  (CDN)        │              ↓                                     │
│               │  RDS PostgreSQL (Multi-AZ) ← DMS (migration)       │
│               │  ElastiCache Redis (Cluster mode)                  │
│               │  S3 (Backups, logs, static assets)                 │
│               │  SQS + SNS (Async messaging)                       │
│               │  Route53 (DNS) + ACM (Certificates)                │
│               │  CloudWatch (Logs, metrics, alarms)                │
└───────────────┴────────────────────────────────────────────────────┘

Principes d'architecture :
- Immutabilité des infrastructures (Terraform)
- Scalabilité horizontale (HPA + Cluster Autoscaler)
- Sécurité : VPC privé, WAF, Secrets Manager
- Observabilité : OpenTelemetry → Grafana + Tempo + Loki`,
	36
);
add(
	'atlas/specs/diagramme-sequence',
	'atlas/specs',
	`Diagramme de séquence — Synchronisation des données legacy → cloud

1. Application legacy écrit dans PostgreSQL on-premise
2. Debezium (CDC) capture les changements → Kafka topic "db-changes"
3. Kafka MirrorMaker 2 réplique le topic vers MSK (AWS Managed Kafka)
4. Kafka Connect S3 sink → backup dans S3 (format Parquet)
5. Application cloud lit depuis RDS PostgreSQL (réplication logique)
6. Phase finale : basculer le DNS → les nouvelles écritures vont directement dans RDS
7. Arrêt du legacy après vérification de l'intégrité des données

Rollback : en cas de problème, réactiver le DNS legacy et re-synchroniser les dernières écritures.`,
	34
);

// Atlas Sprints
const ATLAS_SPRINTS = [
	'Sprint 1 — Setup : Terraform, VPC, EKS cluster',
	'Sprint 2 — CI/CD : GitLab CI → ArgoCD, Helm charts',
	'Sprint 3 — Base de données : RDS setup, DMS, migration initiale',
	'Sprint 4 — Microservices : containerisation des 5 premiers services',
	'Sprint 5 — Cache & Messaging : Redis cluster, SQS queues',
	'Sprint 6 — Observabilité : OpenTelemetry, dashboards, alerting',
	'Sprint 7 — Migration intermédiaire : 30 serveurs non-critiques',
	'Sprint 8 — Sécurité : WAF, Secrets Manager, audit, pénétration test'
];

for (let i = 0; i < ATLAS_SPRINTS.length; i++) {
	const sprintId = id('atlas', `sprint-${i + 1}`);
	add(sprintId, 'atlas', `🏃 ${ATLAS_SPRINTS[i]}`, 36 - i * 3);
	add(
		id(sprintId, 'objectifs'),
		sprintId,
		`Objectifs du ${ATLAS_SPRINTS[i].split(' — ')[0]} :

- Finaliser la spec technique
- Implémenter les tickets Jira (ATLAS-${100 + i * 10} à ATLAS-${109 + i * 10})
- Code review avec l'équipe
- Tests d'intégration
- Documentation

Vélocité de l'équipe : 32 points/sprint (moyenne sur les 3 derniers sprints).
Risques identifiés : dépendance sur l'équipe réseau (disponibilité limitée).`,
		36 - i * 3 + 1
	);
	add(
		id(sprintId, 'retro'),
		sprintId,
		`Rétrospective ${ATLAS_SPRINTS[i].split(' — ')[0]} :

✅ Terminé : tous les objectifs sauf le ticket ATLAS-${105 + i * 10} (bloqué par la revue sécurité).
❌ Bloquant : la pipeline CI échoue sur l'étape de linting — à fixer en priorité.
📝 Leçons : prévoir plus de temps pour les code reviews la prochaine fois.
😊 Équipe : bonne dynamique, standup quotidien efficace.

Actions :
- Débloquer ATLAS-${105 + i * 10} avec l'équipe sécurité
- Fix le linting dans le Dockerfile (image de base trop récente)`,
		36 - i * 3 + 2
	);
}

// Atlas meetings
const MEETING_NOTES = [
	"Kickoff Atlas — Présentation au comité de direction. Budget validé, calendrier serré mais réalisable. Alignement avec la stratégie cloud-first de l'entreprise. Sponsors : CTO (direct), VP Engineering.",
	'Sprint planning #3 — Priorisation des user stories. Focus sur la base de données : migration du schéma legacy vers RDS. Leverage DMS pour la synchronisation initiale. Estimation : 21 story points.',
	'Architecture review — Validation du schéma multi-AZ RDS avec réplication logique. Débat sur le sharding : reporté à la V2. Utilisation de read replicas pour les requêtes analytics.',
	"Point sécurité — Audit de la configuration Terraform. WAF configuré pour bloquer les SQL injections. Secrets Manager pour les credentials. Recommandation : utiliser OIDC pour l'authentification GitLab → AWS.",
	"Démo sprint 4 — 5 microservices containerisés et déployés sur l'environnement de staging. Retour positif du PO. La migration des 30 premiers serveurs est prévue pour la semaine prochaine.",
	"Rétrospective globale — Bilan à mi-parcours. Retard de 2 semaines sur le calendrier (problèmes d'approvisionnement AWS). Plan d'attaque : mettre plus de monde sur la migration des bases de données.",
	'Review post-mortem sprint 7 — Incident : downtime de 15 minutes sur le service de notifications (cache Redis mal configuré). Root cause : reachabilité du cluster Redis dépassée. Fix : augmenter le nombre de shards et ajouter des read replicas.',
	"Préparation go-live — Check-list finale : backups automatisés, runbook d'incident, monitoring opérationnel, communication utilisateurs. Go / No-go : jeudi prochain."
];

for (let i = 0; i < MEETING_NOTES.length; i++) {
	const meetingId = id('atlas', `meeting-${i + 1}`);
	add(meetingId, 'atlas', `📅 Réunion — ${MEETING_NOTES[i].split(' — ')[0]}`, 38 - i * 3);
	add(
		id(meetingId, 'notes'),
		meetingId,
		`Compte-rendu : ${MEETING_NOTES[i]}

Décisions :
- ${i % 2 === 0 ? 'Architecture validée, passer en implémentation.' : "Points d'action répartis dans l'équipe."}
- Prochaine réunion : ${['lundi prochain', 'dans 2 semaines', 'après la démo'][i % 3]}.

Participants : ${['Tom (architecte)', 'Sarah (devops)', 'Lucas (dev)', 'Emma (PO)', 'Paul (CTO)'].slice(0, 2 + (i % 4)).join(', ')}.`,
		38 - i * 3 + 1
	);
}

// ── Projet Boreas — Refonte Frontend ───────────────────────────────────────

add('boreas', 'work', '🎨 Projet Boreas — Refonte Frontend', 42);
add(
	'boreas/description',
	'boreas',
	`Projet Boreas — Refonte complète de l'interface utilisateur de l'application.
Stack : React 19 + TypeScript, Next.js 15, Tailwind CSS 4, Zustand, TanStack Query.
Objectif : améliorer l'UX, réduire le temps de chargement (-60%), et harmoniser le design system.
Équipe : 4 devs frontend, 1 designer UX, 1 PO.

Ma responsabilité : lead dev frontend — architecture des composants, gestion d'état, performance.`,
	40
);
add(
	'boreas/design-system',
	'boreas',
	`Design System — Boreas (Atlas UI)

Principes : accessibilité (WCAG 2.1 AA), responsive mobile-first, dark mode support.
Composants : Button, Input, Select, Modal, Toast, Table, Card, Badge, Spinner, Tabs, Accordion.
Tokens : couleurs (brand, neutral, success, warning, error), typographie (Inter), espacements (4px base).
Storybook : chaque composant documenté avec variants, états (loading, empty, error), accessibilité.

Bibliothèque : shadcn/ui comme base, customisé pour nos besoins.
Tests : Vitest + Testing Library (unitaires), Playwright (E2E).`,
	38
);
add(
	'boreas/architecture',
	'boreas',
	`Architecture frontend — Boreas

Pages (Next.js App Router) :
- /dashboard — KPIs, graphiques, widgets customisables
- /projects — liste des projets, filtres, recherche
- /settings — profil, préférences, équipe
- /login, /register — authentification

Composants partagés dans @/components/ui/
Hooks custom dans @/hooks/ : useDebounce, useLocalStorage, useMediaQuery, useIntersectionObserver
État global (Zustand) : auth store, preferences store, notification store
Server state (TanStack Query) : tous les appels API, cache, optimistic updates

Performance :
- Dynamic imports (next/dynamic) pour les composants lourds
- Image optimization (next/image)
- Streaming SSR avec Suspense boundaries
- Bundle analysis avec @next/bundle-analyzer`,
	36
);

const BOREAS_SPRINTS = [
	'Sprint 1 — Init : Next.js setup, Storybook, CI, déploiement Vercel',
	'Sprint 2 — Design System : Button, Input, Modal, Toast — avec tests',
	'Sprint 3 — Auth : login, register, password reset, middleware, sessions',
	'Sprint 4 — Dashboard : KPIs, graphiques Recharts, widgets',
	'Sprint 5 — Projets : liste, filtres, recherche, pagination infinie',
	'Sprint 6 — Settings : profil, thème, notifications, équipe',
	'Sprint 7 — Performance : audit Lighthouse, bundle optimization, PWA',
	'Sprint 8 — Finalisation : bug fixes, documentation, déploiement production'
];

for (let i = 0; i < BOREAS_SPRINTS.length; i++) {
	const sprintId = id('boreas', `sprint-${i + 1}`);
	add(sprintId, 'boreas', `🏃 ${BOREAS_SPRINTS[i]}`, 40 - i * 3);
	add(
		id(sprintId, 'notes'),
		sprintId,
		`${BOREAS_SPRINTS[i]} — Notes

Tickets : BOREAS-${200 + i * 10} à BOREAS-${205 + i * 10}
Vélocité prévue : 28 points
Dépendances : équipe design (maquettes Figma), équipe API (endpoints GraphQL)

Risques : les maquettes arrivent souvent en retard.
Mitigation : commencer par les composants standards, intégrer le design plus tard.`,
		40 - i * 3 + 1
	);
}

// ── Réunions générales ─────────────────────────────────────────────────────

add('meetings', 'work', '📅 Réunions', 44);

const GEN_MEETINGS = [
	"All-hands janvier — Objectifs 2025 : croissance 30%, nouveau marché UK, embauches (+15 personnes). Nouveaux locaux à partir d'avril. Soirée d'équipe le 31.",
	"All-hands avril — Résultats Q1 : croissance 28% (on track). Problème de rétention : 3 départs dans l'équipe. Plan d'action : augmenter le budget formation et les salaires.",
	'All-hands juin — Mi-parcours. Projets Atlas et Boreas en bonne voie. Budget R&D augmenté de 15%. Lancement du programme de mentorat interne.',
	"All-hands septembre — Préparation H2. Revue des objectifs annuels. Réorganisation de l'équipe data en cours.",
	"All-hands décembre — Bilan annuel : croissance 32%, objectifs dépassés. Bonus collectif. Fêtes de fin d'année.",
	"1:1 avec Sarah (devops) — Discussion sur son évolution : envie de plus de responsabilités sur l'architecture. Plan : la mettre lead sur le projet de monitoring.",
	'1:1 avec Tom (architecte) — Préoccupations sur la dette technique du projet legacy. Proposition : budget trimestriel de refactoring. Validé.',
	'1:1 manager — Feedback : bon leadership sur Atlas, mais trop de tickets dans ma review queue. Déléguer les revues de code aux leads de chaque module.',
	"Brainstorming — Idées pour le hackathon interne de juin. Thèmes : IA générative, outils de productivité, green IT. Mon idée : un outil de code review automatique basé sur l'IA."
];

for (let i = 0; i < GEN_MEETINGS.length; i++) {
	add(id('meetings', `meeting-${i + 1}`), 'meetings', `📌 ${GEN_MEETINGS[i]}`, 45 - i * 2);
}

// ── Objectifs & évaluations ────────────────────────────────────────────────

add('objectifs', 'work', '🎯 Objectifs & Évaluations', 44);
add(
	'objectifs/2025',
	'objectifs',
	`Objectifs 2025

Objectif 1 : Migration cloud (Atlas) — mener le projet jusqu'à la migration complète.
  KR1: 120 serveurs migrés ✅
  KR2: downtime total < 4 heures
  KR3: coût cloud < 120% du coût on-premise

Objectif 2 : Refonte frontend (Boreas) — livrer la V1 en production.
  KR1: Lighthouse performance score > 90
  KR2: taille du bundle JS < 200 KB (initial)
  KR3: couverture de tests > 80%

Objectif 3 : Mentorat — encadrer deux développeurs juniors.
  KR1: 1 session de pair programming / semaine
  KR2: les deux juniors passent senior d'ici fin 2025`,
	42
);
add(
	'objectifs/eval-mid',
	'objectifs',
	`Évaluation mi-année 2025

Points forts :
- Très bonne exécution sur Atlas (POC livré dans les temps)
- Compétences techniques solides (architecture, cloud, frontend)
- Communication claire, appréciée de l'équipe

Axes d'amélioration :
- Déléguer plus — arrêter de micro-manager les détails d'implémentation
- Visibilité : présenter plus souvent en all-hands les avancées de l'équipe
- Documentation : rendre les décisions d'architecture plus accessibles

Note : 4.2/5
Augmentation : 4% (aligné avec la moyenne de l'entreprise)`,
	30
);

// ── Veille Technologique ──────────────────────────────────────────────────

add('veille', 'work', '🔬 Veille Technologique', 44);
add(
	'veille/articles',
	'veille',
	`Articles à lire (read-later) :

☐ "Building Netflix's Distributed Tracing Platform" — Netflix Tech Blog
☐ "How Cloudflare handles WebSocket connections at scale" — Cloudflare Blog
☐ "PostgreSQL 17 : What's New" — PostgreSQL Weekly
☐ "The State of WebAssembly 2025" — Mozilla Hacks
☐ "Svelte 5 Runes : Deep Dive" — Svelte Blog
☐ "Why we migrated from Next.js to Remix" — Shopify Engineering
☐ "Kubernetes 1.31 : Major Changes" — Kubernetes Blog
☐ "The GenAI Engineer's Handbook" — a16z
☐ "Rust in the Linux Kernel : 2025 Update" — LWN.net

Podcasts tech à écouter : Software Engineering Daily, The Changelog, Syntax FM.`,
	36
);
add(
	'veille/conferences',
	'veille',
	`Conférences & Events 2025

☐ KubeCon Europe (Londres, avril) — soumis un CFP sur l'opérateur Kubernetes pour la migration
☐ Devoxx Paris (avril) — billet pris ✅
☐ AWS re:Invent (Las Vegas, décembre) — budget demandé, en attente
☐ Svelte Summit (Berlin, septembre) — intéressant avec Svelte 5
☐ Paris Web (Paris, octobre) — accessible, bonne conf générale`,
	32
);
add(
	'veille/experiments',
	'veille',
	`Expérimentations personnelles 2025

- Bun vs Node.js : test de performance sur un serveur HTTP simple. Bun est 3x plus rapide à froid.
- Svelte 5 : développement d'une petite app de gestion de tâches pour tester les runes. Beaucoup plus simple que React pour des cas simples.
- WebGPU : joué avec des compute shaders. Algorithmes parallélisables faciles à implémenter (tri, matrices).
- Zig : langage fascinant, pas d'allocateur caché, cross-compilation native. À explorer plus.
- Local-first avec SQLite + ElectricSQL : prometteur pour les apps offline-first.`,
	28
);

// ═══════════════════════════════════════════════════════════════════════════════
// INBOX & QUICK CAPTURE
// ═══════════════════════════════════════════════════════════════════════════════

add('inbox/ideas', 'inbox', '💡 Idées diverses', 46);
add(
	'inbox/ideas/app',
	'inbox/ideas',
	`Idée d'application : un outil de suivi d'habitudes qui combine un journal, des streaks à la GitHub, et des rappels discrets (pas de notifications intrusives). Stack : Svelte 5 + SQLite local-first (ElectricSQL) + PWA. Le design : très minimal, tout est dans la simplicité. Pas de serveur, tout en local avec sync optionnelle. Nom potentiel : "Stride" ou "Trac". Prix : gratuit avec option donation.`,
	30
);
add(
	'inbox/ideas/blog',
	'inbox/ideas',
	`Idée d'article de blog : "Why I moved from React to Svelte 5 after 5 years" — raconter mon expérience de migration du frontend d'une app secondaire. Points clés : moins de boilerplate, runes plus intuitives que hooks, performances au top, bundle size réduit de 50%. Contreparties : écosystème plus petit, moins de ressources, recrutement plus difficile.`,
	28
);
add(
	'inbox/ideas/evenement',
	'inbox/ideas',
	`Organiser un "soirée code & pizza" mensuelle avec l'équipe. Format : 2h de coding sur un projet libre (hackathon léger), 30 min de présentation, pizza. Premier sujet : "Automatisez votre tâche la plus chiante avec un script."`,
	26
);

add('inbox/reminders', 'inbox', '⏰ Rappels', 46);
add(
	'inbox/reminders/todo',
	'inbox/reminders',
	`Rappels et tâches :

☐ Renouvellement passeport (juillet 2026, mais anticiper 6 mois)
☐ Vérifier l'assurance habitation (échéance octobre)
☐ Changer le filtre à eau de la cuisine (tous les 6 mois)
☐ Prendre RDV pour le bilan carbone personnel
☐ Commander les semis de printemps pour le jardin
☐ Remboursement prêt à Sarah (100 € — ne pas oublier)
☐ Écrire lettre de recommandation pour Tom (promis il y a 2 semaines)
☐ Nettoyer les gouttières avant l'automne`,
	32
);

add('inbox/links', 'inbox', '🔗 Liens utiles', 46);
add(
	'inbox/links/tech',
	'inbox/links',
	`Liens tech à explorer :

https://news.ycombinator.com — Hacker News (quotidien)
https://arxiv.org/list/cs.LG/recent — Machine Learning papers
https://bytes.dev/archives — JavaScript Weekly
https://svelte.dev/blog — Svelte official blog
https://bun.sh — Bun runtime
https://neovim.io — Mon éditeur, toujours à configurer
https://missing.csail.mit.edu — The Missing Semester (recommandé aux juniors)
https://learn.termius.com — Terminal & SSH tips`,
	28
);
add(
	'inbox/links/creative',
	'inbox/links',
	`Liens créatifs et inspiration :

https://www.are.na — Moodboards, collections d'images
https://www.awwwards.com — Web design awards
https://huemint.com — Palette de couleurs IA
https://coolors.co — Générateur de palettes
https://www.typewolf.com — Typographie web
https://open.spotify.com/playlist/37i9dQZF1DX4JAvHpjipBk — Playlist focus "Deep Focus"`,
	26
);

add('inbox/achats', 'inbox', '🛒 À acheter / Remplacer', 44);
add(
	'inbox/achats/liste',
	'inbox/achats',
	`Courses et achats à prévoir :

☐ Nouvelle chaise de bureau (Herman Miller Aeron ou équivalent) — budget max 800 €
☐ Clavier mécanique (Keychron Q1 ou Nuphy Air75) — pour le confort au quotidien
☐ Lampe de chevet LED avec gradation
☐ Housse de couette lavande (nouvelle, la mienne fatigue)
☐ Cadeau anniversaire Tom (juillet) — idée : un week-end en Normandie
☐ Cadeau Noël Sarah — à réfléchir, l'an dernier j'avais offert un cours de poterie
☐ Plantes pour le salon : monstera, pothos, sansevieria
☐ Nouveau sac à dos (transport ordi + tenue sport)`,
	24
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ids of every block the seeder creates. A database holding ONLY these (or
 * nothing at all) is considered fresh: the home hero is shown. One
 * user-created block (random UUID, not in this set) and the hero never
 * comes back. Built from `all` — stays in sync with the seed automatically.
 */
export const SEED_IDS: ReadonlySet<string> = new Set(all.map((b) => b.id));

export function seed(): void {
	const db = getDb();

	const count = db.transaction(() => {
		// Nuke existing data
		db.exec('DELETE FROM blocks_fts');
		db.exec('DELETE FROM blocks');

		const insertBlock = db.prepare(
			'INSERT INTO blocks (id, parent_id, content, position, created_at) VALUES (?, ?, ?, ?, ?)'
		);
		const insertFts = db.prepare('INSERT INTO blocks_fts (id, content) VALUES (?, ?)');

		for (const b of all) {
			insertBlock.run(b.id, b.parent_id, b.content, b.position, b.created_at);
			insertFts.run(b.id, b.content);
		}

		return all.length;
	})();

	console.log(`✅ Seed complete — ${count} blocks inserted.`);
}

// CLI entry: when run directly via `npx tsx seed.ts`, close the DB after seeding.
// When imported by initDb() in schema.ts, the caller manages the connection.
if (process.argv[1]?.endsWith('seed.ts')) {
	seed();
	closeDb();
}
