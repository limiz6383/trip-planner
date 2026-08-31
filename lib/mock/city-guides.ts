/**
 * Curated destination guides for demo mode.
 *
 * Covers every city in `lib/mock/places.ts`, so any destination a visitor can
 * pick from autocomplete gets real, recognisable highlights rather than
 * templated filler. Without this a self-created demo trip is offered
 * "{City} old town" and "The regional house speciality", which makes the
 * guide picker look like a stub.
 *
 * Keyed by the short city name, lower-cased.
 */

export interface CuratedGuide {
  known_for: string;
  top_spots: { name: string; why: string }[];
  must_try_foods: { name: string; why: string }[];
}

export const CITY_GUIDES: Record<string, CuratedGuide> = {
  "paros municipality": {
    known_for:
      "A Cycladic island that stayed liveable: whitewashed lanes and blue domes without Santorini's crowds or prices. Ferries make it an easy hop, the interior hides marble villages, and the north coast is a windsurfing magnet.",
    top_spots: [
      { name: "Naoussa", why: "A working fishing harbour that turns into the island's best dinner and nightlife scene." },
      { name: "Parikia", why: "The port town, built around the 4th-century Panagia Ekatontapiliani church." },
      { name: "Lefkes", why: "Marble-paved mountain village, the old capital, cool even in August." },
      { name: "Kolymbithres Beach", why: "Wind-sculpted granite coves separating pockets of calm turquoise water." },
      { name: "Golden Beach (Chrissi Akti)", why: "Long sandy stretch on the southeast coast, a windsurfing world-cup venue." },
      { name: "Petaloudes (Butterfly Valley)", why: "A shaded walled garden that fills with Jersey tiger moths in summer." },
    ],
    must_try_foods: [
      { name: "Gouna", why: "Sun-dried mackerel grilled over coals — the island's signature dish." },
      { name: "Karavoli (snails)", why: "Cooked with rosemary and vinegar; a Cycladic taverna staple." },
      { name: "Kopanisti cheese", why: "Sharp, peppery, fermented soft cheese spread on bread." },
      { name: "Revithada", why: "Slow-baked chickpea stew, traditionally cooked overnight in a wood oven." },
      { name: "Souma", why: "The local distilled spirit, poured after dinner whether you ask or not." },
    ],
  },

  athens: {
    known_for:
      "Layered rather than pretty: 2,500-year-old ruins sit directly above a loud, young, graffitied modern city. Mornings belong to the ancient sites before the heat, evenings to rooftop bars and long tavern dinners in Psyri and Koukaki.",
    top_spots: [
      { name: "Acropolis & Parthenon", why: "The reason people come; go at opening or late afternoon to avoid the worst heat." },
      { name: "Acropolis Museum", why: "Glass-floored galleries over an excavated neighbourhood; see it after the hill itself." },
      { name: "Plaka", why: "The old quarter under the Acropolis — touristy but genuinely lovely early in the day." },
      { name: "Ancient Agora", why: "Where Socrates argued; quieter than the Acropolis and better for wandering." },
      { name: "Monastiraki Flea Market", why: "Sprawling Sunday market with an Acropolis view from the square." },
      { name: "Mount Lycabettus", why: "The city's highest point — funicular up, sunset over the whole basin." },
    ],
    must_try_foods: [
      { name: "Souvlaki", why: "Grilled meat in pita with tzatziki; the city's default fast meal." },
      { name: "Moussaka", why: "Layered aubergine, mince and béchamel — the classic taverna order." },
      { name: "Greek salad (horiatiki)", why: "No lettuce, a slab of feta on top, drowned in good olive oil." },
      { name: "Spanakopita", why: "Spinach and feta in filo, eaten standing up from a bakery." },
      { name: "Loukoumades", why: "Honey-drenched dough balls, the traditional after-dinner sweet." },
    ],
  },

  santorini: {
    known_for:
      "A drowned volcano whose caldera rim gives the most photographed sunset in Greece. Expensive and busy, but the cliff villages, black-sand beaches and Bronze Age ruins genuinely earn it.",
    top_spots: [
      { name: "Oia", why: "The blue-domed sunset village; arrive well before dusk for a spot." },
      { name: "Fira", why: "The capital, strung along the caldera edge with the best cliff walks." },
      { name: "Akrotiri", why: "A Minoan town buried by eruption in 1600 BC — a Bronze Age Pompeii." },
      { name: "Fira to Oia caldera hike", why: "Ten clifftop kilometres with the whole caldera below you." },
      { name: "Red Beach", why: "Dramatic iron-red cliffs dropping into the sea near Akrotiri." },
      { name: "Santo Wines", why: "Terrace tasting of Assyrtiko looking straight across the caldera." },
    ],
    must_try_foods: [
      { name: "Tomatokeftedes", why: "Fritters of the island's tiny, intense sun-dried tomatoes." },
      { name: "Fava", why: "Split-pea purée with olive oil and onion; a Santorini PDO product." },
      { name: "White aubergine", why: "Sweeter and less bitter than usual, grown only here." },
      { name: "Assyrtiko wine", why: "Bone-dry white from vines coiled on the ground against the wind." },
      { name: "Chloro cheese", why: "Fresh goat cheese from Santorini, served with tomato and rusk." },
    ],
  },

  tokyo: {
    known_for:
      "Less one city than thirty dense ones stitched by rail. Immaculate, endlessly deep, and best approached neighbourhood by neighbourhood — a temple morning, a department-store basement lunch, a tiny bar at midnight.",
    top_spots: [
      { name: "Senso-ji", why: "Tokyo's oldest temple, approached through the Nakamise market street in Asakusa." },
      { name: "Meiji Jingu", why: "A forest shrine in the middle of the city, minutes from Harajuku." },
      { name: "Shibuya Crossing", why: "The scramble; watch it from the Shibuya Sky deck or a nearby café." },
      { name: "Tsukiji Outer Market", why: "The wholesale market moved, but the eating streets stayed." },
      { name: "teamLab", why: "Immersive digital-art rooms — book well ahead, they sell out." },
      { name: "Shinjuku Golden Gai", why: "A few alleys of six-seat bars that survived the war and the bubble." },
    ],
    must_try_foods: [
      { name: "Sushi", why: "Best at a counter at breakfast time; omakase if you can get a seat." },
      { name: "Ramen", why: "Regional styles all represented; queue at the ticket machine and eat fast." },
      { name: "Tempura", why: "Fried at a counter piece by piece, not the heavy version served abroad." },
      { name: "Yakitori", why: "Charcoal-grilled skewers under the train tracks in Yurakucho." },
      { name: "Monjayaki", why: "Tokyo's runnier answer to okonomiyaki, cooked on the table in Tsukishima." },
    ],
  },

  kyoto: {
    known_for:
      "A thousand years of capital, spared the wartime bombing, so the temples, machiya townhouses and geisha districts survive intact. Rewards early starts — the famous sites are serene at 7am and mobbed by ten.",
    top_spots: [
      { name: "Fushimi Inari Taisha", why: "Thousands of vermilion torii up the mountain; go at dawn or after dark." },
      { name: "Kinkaku-ji", why: "The Golden Pavilion mirrored in its pond — brief visit, unforgettable image." },
      { name: "Arashiyama Bamboo Grove", why: "Best before 8am; pair it with Tenryu-ji temple next door." },
      { name: "Gion", why: "The geisha quarter — wooden teahouses, and real maiko hurrying between engagements." },
      { name: "Kiyomizu-dera", why: "A vast wooden stage over the hillside, with the old lanes of Ninenzaka below." },
      { name: "Nishiki Market", why: "Five covered blocks of pickles, tofu, knives and street snacks." },
    ],
    must_try_foods: [
      { name: "Kaiseki", why: "Multi-course seasonal haute cuisine; Kyoto is its home." },
      { name: "Yudofu", why: "Simmered tofu, a Zen temple dish taken more seriously here than anywhere." },
      { name: "Matcha sweets", why: "Uji, just south, is Japan's most famous green-tea region." },
      { name: "Yatsuhashi", why: "Cinnamon rice-flour sweets, raw or baked; the standard Kyoto gift." },
      { name: "Saba-zushi", why: "Pressed mackerel sushi, from the days when fish arrived salted over the mountains." },
    ],
  },

  osaka: {
    known_for:
      "Japan's kitchen and its loudest city — a merchant town that cares more about eating and joking than about decorum. Compact, cheap by Japanese standards, and a good base for Kyoto and Nara.",
    top_spots: [
      { name: "Dotonbori", why: "Neon canal-side strip with the Glico running man; peak Osaka at night." },
      { name: "Osaka Castle", why: "Reconstructed keep in a huge park, spectacular in cherry-blossom season." },
      { name: "Kuromon Ichiba Market", why: "Covered market where you eat the seafood where you buy it." },
      { name: "Shinsekai", why: "Retro-futurist district from 1912, built around Tsutenkaku tower." },
      { name: "Umeda Sky Building", why: "Two towers joined by a floating rooftop observatory." },
      { name: "Sumiyoshi Taisha", why: "One of Japan's oldest shrines, with its steep arched bridge." },
    ],
    must_try_foods: [
      { name: "Takoyaki", why: "Octopus batter balls; the street food Osaka is known for nationwide." },
      { name: "Okonomiyaki", why: "Savoury cabbage pancake griddled at your table." },
      { name: "Kushikatsu", why: "Deep-fried skewers in Shinsekai — and no double-dipping the sauce." },
      { name: "Kitsune udon", why: "Thick noodles with sweet fried tofu; said to have been invented here." },
      { name: "Horumon", why: "Grilled offal, a working-class Osaka speciality done properly." },
    ],
  },

  berlin: {
    known_for:
      "A city that wears its 20th century openly — the wall, the bullet holes, the empty lots turned into parks and clubs. Green, cheap for a capital, and organised around distinct neighbourhoods rather than one centre.",
    top_spots: [
      { name: "Brandenburg Gate", why: "The symbol of the divided and reunified city." },
      { name: "East Side Gallery", why: "The longest surviving stretch of wall, painted by artists in 1990." },
      { name: "Museum Island", why: "Five major collections on one UNESCO-listed island; the Pergamon is the headline." },
      { name: "Reichstag dome", why: "Free glass cupola over the parliament chamber — register in advance." },
      { name: "Tempelhofer Feld", why: "A decommissioned airport turned enormous public park; picnic on the runway." },
      { name: "Memorial to the Murdered Jews of Europe", why: "2,711 concrete slabs you walk into and lose your bearings in." },
    ],
    must_try_foods: [
      { name: "Currywurst", why: "Sliced sausage, curried ketchup — the city's own invention." },
      { name: "Döner kebab", why: "The Berlin-Turkish version became the template for all of Europe." },
      { name: "Berliner Pfannkuchen", why: "Jam doughnut; just call it a Pfannkuchen while you're here." },
      { name: "Königsberger Klopfe", why: "Meatballs in caper cream sauce, a Prussian classic." },
      { name: "Bulette", why: "The Berlin fried meat patty, eaten cold from a bakery counter." },
    ],
  },

  munich: {
    known_for:
      "Bavaria's prosperous, conservative, surprisingly relaxed capital — beer halls and BMW, baroque churches and a river people surf on. The Alps are an hour away and it shows in the weekend rhythm.",
    top_spots: [
      { name: "Marienplatz", why: "The central square; time it for the Glockenspiel at 11am." },
      { name: "English Garden", why: "Bigger than Central Park, with a standing wave surfers ride year-round." },
      { name: "Viktualienmarkt", why: "Daily food market with a permanent beer garden in the middle." },
      { name: "Nymphenburg Palace", why: "The Wittelsbachs' summer palace and its long formal canal." },
      { name: "Deutsches Museum", why: "Enormous science and technology collection; budget half a day." },
      { name: "Hofbräuhaus", why: "Touristy and worth it once, for the scale and the brass band." },
    ],
    must_try_foods: [
      { name: "Weisswurst", why: "White veal sausage eaten before noon, peeled, with sweet mustard." },
      { name: "Brezn (pretzel)", why: "Big, soft and salty; the default accompaniment to everything." },
      { name: "Schweinshaxe", why: "Roast pork knuckle with crackling — order one between two." },
      { name: "Obatzda", why: "Whipped camembert with paprika and onion, a beer-garden spread." },
      { name: "Radler", why: "Beer cut with lemonade, invented for cyclists and perfect in summer." },
    ],
  },

  paris: {
    known_for:
      "Dense, walkable and organised in a spiral of arrondissements, with world-class museums a few streets from ordinary neighbourhood life. Best treated as a city to sit in — markets, terraces, parks — rather than only to tick off.",
    top_spots: [
      { name: "Louvre", why: "Too big to finish; pick two wings and book a timed entry." },
      { name: "Musée d'Orsay", why: "The Impressionists, in a converted Beaux-Arts railway station." },
      { name: "Eiffel Tower", why: "Better viewed from the Champ de Mars or Trocadéro than climbed." },
      { name: "Montmartre & Sacré-Cœur", why: "Steep village streets and the best free view over the city." },
      { name: "Le Marais", why: "Medieval lanes, the Jewish quarter, and the best falafel in the city." },
      { name: "Jardin du Luxembourg", why: "Where Parisians actually spend their Sundays." },
    ],
    must_try_foods: [
      { name: "Croissant", why: "From a bakery with a queue; the difference is enormous." },
      { name: "Jambon-beurre", why: "Ham and butter on baguette — the classic cheap lunch." },
      { name: "Steak frites", why: "The default bistro order; ask for saignant if you want it French-rare." },
      { name: "Escargots", why: "Garlic-parsley butter is the actual point of the dish." },
      { name: "Macarons", why: "Ladurée and Pierre Hermé argue about who does it best; try both." },
    ],
  },

  lisbon: {
    known_for:
      "Built over seven hills above the Tagus, with tiled facades, wheezing funiculars and viewpoints on every ridge. Sunlight, seafood and fado — and still one of Western Europe's better-value capitals.",
    top_spots: [
      { name: "Belém Tower", why: "Manueline fortress from the age of exploration, right on the water." },
      { name: "Jerónimos Monastery", why: "Extraordinary carved cloister; go early, the queue is real." },
      { name: "Alfama", why: "The oldest quarter — a maze that survived the 1755 earthquake." },
      { name: "Tram 28", why: "The classic yellow tram route through the old city; ride it early." },
      { name: "São Jorge Castle", why: "Moorish walls with the best panorama over the rooftops." },
      { name: "Time Out Market", why: "The city's best-known chefs under one roof at a food hall." },
    ],
    must_try_foods: [
      { name: "Pastel de nata", why: "Custard tart, best at Pastéis de Belém, dusted with cinnamon." },
      { name: "Bacalhau à Brás", why: "Salt cod with shredded potato and egg; one of a thousand cod dishes." },
      { name: "Bifana", why: "Marinated pork sandwich, the workaday Lisbon lunch." },
      { name: "Grilled sardines", why: "Charred whole over coals, at their best in June." },
      { name: "Ginjinha", why: "Sour-cherry liqueur, drunk standing at a hole-in-the-wall bar." },
    ],
  },

  porto: {
    known_for:
      "Granite, tile and river fog — a working city steeper and grittier than Lisbon, with the port lodges lined up across the Douro. Compact enough to cover on foot if your calves cooperate.",
    top_spots: [
      { name: "Ribeira", why: "The UNESCO-listed riverfront of stacked, crooked houses." },
      { name: "Dom Luís I Bridge", why: "Eiffel-school double-deck iron bridge; walk the top level." },
      { name: "Livraria Lello", why: "Neo-gothic bookshop with the famous red staircase; ticketed." },
      { name: "Port cellars, Vila Nova de Gaia", why: "Cross the bridge and tour a lodge — tastings included." },
      { name: "Clérigos Tower", why: "225 steps to the best view of the old city." },
      { name: "São Bento Station", why: "Twenty thousand azulejo tiles in a working railway hall." },
    ],
    must_try_foods: [
      { name: "Francesinha", why: "A sandwich of several meats under melted cheese and beer sauce. Enormous." },
      { name: "Port wine", why: "Try a white port and tonic as an aperitif, not just the sweet ruby." },
      { name: "Tripas à moda do Porto", why: "Tripe and bean stew; the reason locals are nicknamed tripeiros." },
      { name: "Bolinhos de bacalhau", why: "Salt-cod fritters, the standard bar snack." },
      { name: "Pastel de nata", why: "Portuense bakeries hold their own against Lisbon's." },
    ],
  },

  barcelona: {
    known_for:
      "Modernista architecture, a grid designed with chamfered corners, and a beach the city only reclaimed for the 1992 Olympics. Catalan first, Spanish second — and it matters to people here.",
    top_spots: [
      { name: "Sagrada Família", why: "Gaudí's unfinished basilica; book a timed slot and go up a tower." },
      { name: "Park Güell", why: "Mosaic terraces above the city; the monumental zone is ticketed." },
      { name: "Casa Batlló", why: "The most inventive of Gaudí's apartment blocks on Passeig de Gràcia." },
      { name: "Gothic Quarter", why: "Roman walls and medieval lanes packed behind the cathedral." },
      { name: "La Boqueria", why: "The Rambla's covered market; eat at a counter at the back." },
      { name: "Montjuïc", why: "Castle, gardens and the Miró Foundation on the hill above the port." },
    ],
    must_try_foods: [
      { name: "Pa amb tomàquet", why: "Bread rubbed with tomato and oil — served with everything." },
      { name: "Patatas bravas", why: "Fried potatoes with spicy sauce; every bar claims the best." },
      { name: "Fideuà", why: "Like paella but with short noodles; a Catalan coastal speciality." },
      { name: "Crema catalana", why: "Custard with a torched sugar crust, Catalonia's answer to crème brûlée." },
      { name: "Vermut", why: "House vermouth on tap before Sunday lunch is a local ritual." },
    ],
  },

  madrid: {
    known_for:
      "Spain's high, dry capital — grand boulevards, three of Europe's great art museums within a few blocks, and a nightlife that genuinely starts after midnight. Landlocked but obsessed with seafood.",
    top_spots: [
      { name: "Prado Museum", why: "Velázquez, Goya and Bosch; go straight to Las Meninas." },
      { name: "Reina Sofía", why: "Twentieth-century Spanish art, built around Picasso's Guernica." },
      { name: "Retiro Park", why: "The city's back garden, with a boating lake and the Crystal Palace." },
      { name: "Royal Palace", why: "Europe's largest functioning royal palace by floor area." },
      { name: "Plaza Mayor", why: "Arcaded 17th-century square, still the centre of the old city." },
      { name: "Mercado de San Miguel", why: "Iron-and-glass market turned tapas hall beside Plaza Mayor." },
    ],
    must_try_foods: [
      { name: "Cocido madrileño", why: "Chickpea and meat stew served in courses; a winter institution." },
      { name: "Bocadillo de calamares", why: "Fried squid in a roll, eaten near Plaza Mayor." },
      { name: "Churros con chocolate", why: "At San Ginés, traditionally at the end of a long night." },
      { name: "Tortilla española", why: "Potato omelette; the argument is whether it should be runny." },
      { name: "Huevos rotos", why: "Broken eggs over fried potatoes and jamón." },
    ],
  },

  rome: {
    known_for:
      "An open-air layer cake of empire, papacy and postwar cinema, where a 2,000-year-old temple sits in an ordinary piazza. Walkable, chaotic, and best eaten in Trastevere or Testaccio rather than near the sights.",
    top_spots: [
      { name: "Colosseum", why: "Book a combined ticket with the Forum and go at opening." },
      { name: "Roman Forum & Palatine Hill", why: "The political centre of the empire, and where the emperors lived." },
      { name: "Vatican Museums & Sistine Chapel", why: "Reserve ahead; the queue without a booking is punishing." },
      { name: "Pantheon", why: "The best-preserved Roman building anywhere, still domed in unreinforced concrete." },
      { name: "Trastevere", why: "Ivy, cobbles and the city's most enjoyable dinner neighbourhood." },
      { name: "Borghese Gallery", why: "Bernini sculptures in a garden villa; strictly timed entry." },
    ],
    must_try_foods: [
      { name: "Cacio e pepe", why: "Pecorino and black pepper — three ingredients, endlessly argued over." },
      { name: "Carbonara", why: "Guanciale, egg, pecorino. No cream, and don't ask for it." },
      { name: "Supplì", why: "Fried rice balls with a mozzarella core; the Roman street snack." },
      { name: "Pizza al taglio", why: "Rectangular pizza sold by weight from a bakery counter." },
      { name: "Carciofi alla giudia", why: "Flattened deep-fried artichokes from the Jewish Ghetto." },
    ],
  },

  florence: {
    known_for:
      "The Renaissance in one small walkable centre — and small is the point: you can cross it in twenty minutes and pass a dozen masterpieces. Tuscan food is plain and excellent, and the hills start immediately.",
    top_spots: [
      { name: "Uffizi Gallery", why: "Botticelli, Leonardo, Caravaggio; book a slot or lose half a day queuing." },
      { name: "Duomo & Brunelleschi's Dome", why: "463 steps up between the inner and outer shells." },
      { name: "Accademia", why: "Michelangelo's David — bigger and stranger in person than in photographs." },
      { name: "Ponte Vecchio", why: "The medieval bridge of goldsmiths that the retreating Germans spared." },
      { name: "Palazzo Pitti & Boboli Gardens", why: "The Medici's later palace and its terraced gardens." },
      { name: "Piazzale Michelangelo", why: "Walk up at sunset for the classic view over the Arno." },
    ],
    must_try_foods: [
      { name: "Bistecca alla fiorentina", why: "Thick T-bone, grilled rare, sold by weight and shared." },
      { name: "Lampredotto", why: "Tripe sandwich from a street cart; the real Florentine lunch." },
      { name: "Ribollita", why: "Reboiled bread and bean soup — peasant food done seriously." },
      { name: "Cantucci and Vin Santo", why: "Almond biscuits dunked in sweet wine to finish a meal." },
      { name: "Schiacciata", why: "Flat salty focaccia, split and filled at a bakery." },
    ],
  },

  "mexico city": {
    known_for:
      "One of the world's great capitals — Aztec ruins under the cathedral, Art Deco avenues, world-class museums, and a street-food culture that outclasses most restaurant scenes. Vast, high, and greener than you expect.",
    top_spots: [
      { name: "Zócalo & Metropolitan Cathedral", why: "The main square, built over the Aztec ceremonial centre." },
      { name: "Museo Nacional de Antropología", why: "Among the best museums on earth; the Aztec hall alone justifies the trip." },
      { name: "Frida Kahlo Museum", why: "La Casa Azul in Coyoacán, where she lived and worked. Book ahead." },
      { name: "Teotihuacán", why: "Pyramids of the Sun and Moon, an hour out; go at opening." },
      { name: "Xochimilco", why: "Pre-Hispanic canals navigated in painted trajinera boats." },
      { name: "Roma & Condesa", why: "Tree-lined Art Deco neighbourhoods; the best eating and drinking." },
    ],
    must_try_foods: [
      { name: "Tacos al pastor", why: "Pork off a vertical spit with pineapple — the city's signature." },
      { name: "Chilaquiles", why: "Fried tortilla in salsa; the standard hangover breakfast." },
      { name: "Mole", why: "Complex chilli-and-chocolate sauce, most often over turkey or chicken." },
      { name: "Elote / esquites", why: "Grilled corn with mayo, cheese and chilli, on the cob or in a cup." },
      { name: "Churros at El Moro", why: "Open since 1935, best at an absurd hour of the night." },
    ],
  },

  "new york": {
    known_for:
      "Five boroughs of relentless density, best experienced on foot and by subway. The museums are world class, but the actual character is in neighbourhood blocks — a bagel counter, a park bench, a bar that has not changed since 1950.",
    top_spots: [
      { name: "Central Park", why: "843 acres; enter at the Ramble rather than the crowded south end." },
      { name: "The Met", why: "Encyclopedic and enormous; pick three departments and stop." },
      { name: "Brooklyn Bridge", why: "Walk it toward Manhattan at sunrise for the skyline and no crowds." },
      { name: "The High Line", why: "Elevated freight rail turned linear park through Chelsea." },
      { name: "Staten Island Ferry", why: "Free, and it passes the Statue of Liberty both ways." },
      { name: "MoMA", why: "Starry Night, Les Demoiselles d'Avignon, and a very good film programme." },
    ],
    must_try_foods: [
      { name: "New York slice", why: "Thin, foldable, from a counter — not a sit-down restaurant." },
      { name: "Bagel with lox", why: "Boiled then baked; Russ & Daughters is the benchmark." },
      { name: "Pastrami on rye", why: "Katz's since 1888; hand-carved, and tip the carver." },
      { name: "Halal cart chicken over rice", why: "The late-night staple, with both sauces." },
      { name: "New York cheesecake", why: "Dense and unadorned — no fruit, no biscuit crust." },
    ],
  },

  "san francisco": {
    known_for:
      "Forty-odd hills, fog that rolls in by afternoon, and an unusual density of very good food for a city this size. Small enough to cross quickly, and the coast and redwoods are close.",
    top_spots: [
      { name: "Golden Gate Bridge", why: "Walk or cycle it; the fog usually clears by late morning." },
      { name: "Alcatraz", why: "Ferry to the island prison; tickets sell out weeks ahead." },
      { name: "Ferry Building", why: "Marketplace and farmers' market on the Embarcadero." },
      { name: "Golden Gate Park", why: "Bigger than Central Park; the de Young and Japanese Tea Garden are inside." },
      { name: "Mission District", why: "Murals, taquerias and the city's best weather." },
      { name: "Chinatown", why: "The oldest in North America; go up Waverly Place, not Grant." },
    ],
    must_try_foods: [
      { name: "Sourdough bread", why: "The local wild yeast genuinely does make it different." },
      { name: "Mission burrito", why: "Rice, beans and the whole thing steamed in foil — invented here." },
      { name: "Cioppino", why: "Tomato seafood stew from the city's Italian fishing community." },
      { name: "Dungeness crab", why: "In season November to June, cracked and served cold." },
      { name: "Irish coffee at the Buena Vista", why: "They have been making it the same way since 1952." },
    ],
  },

  "santa fe": {
    known_for:
      "The oldest state capital in the US, at 7,000 feet, built in adobe and held to it by ordinance. An outsized art scene, high-desert light that draws painters, and a food culture built entirely on one chile.",
    top_spots: [
      { name: "Georgia O'Keeffe Museum", why: "The largest collection of her work, in the city she made her base." },
      { name: "Canyon Road", why: "Half a mile of adobe galleries; walk it in the late afternoon." },
      { name: "Santa Fe Plaza", why: "The centre since 1610, with Native artisans under the Palace portal." },
      { name: "Loretto Chapel", why: "The spiral staircase built with no visible means of support." },
      { name: "Meow Wolf", why: "House of Eternal Return — an immersive art installation you climb through." },
      { name: "Bandelier National Monument", why: "Ancestral Puebloan cliff dwellings, 45 minutes away." },
    ],
    must_try_foods: [
      { name: "Green chile", why: "On everything. Asked 'red or green?', answer 'Christmas' for both." },
      { name: "Sopaipillas", why: "Puffed fried bread with honey, served alongside the main course." },
      { name: "Blue corn enchiladas", why: "Stacked flat rather than rolled, usually with a fried egg." },
      { name: "Posole", why: "Hominy stew with pork, traditional at Christmas and New Year." },
      { name: "Frito pie", why: "Chile and cheese served in the corn-chip bag. Unimprovable." },
    ],
  },

  prague: {
    known_for:
      "A centre that escaped wartime destruction, so gothic, baroque and art nouveau all stand intact within a walkable bend of the Vltava. Beer is cheaper than water and taken seriously.",
    top_spots: [
      { name: "Charles Bridge", why: "Thirty baroque statues; cross at 6am to have it nearly to yourself." },
      { name: "Prague Castle", why: "The largest ancient castle complex in the world, with St Vitus inside." },
      { name: "Old Town Square", why: "The Astronomical Clock performs hourly; the square is better than the show." },
      { name: "Josefov", why: "The Jewish Quarter — six synagogues and the extraordinary old cemetery." },
      { name: "Petřín Hill", why: "Funicular up to gardens and a small Eiffel-style lookout tower." },
      { name: "Vyšehrad", why: "The other castle: quiet ramparts, a cemetery of national figures, no crowds." },
    ],
    must_try_foods: [
      { name: "Svíčková", why: "Beef in root-vegetable cream sauce with dumplings and cranberry." },
      { name: "Guláš", why: "Thicker and less paprika-forward than the Hungarian version." },
      { name: "Smažený sýr", why: "Fried cheese in a bun — the national late-night food." },
      { name: "Trdelník", why: "Touristy and not actually Czech, but the queue is part of the experience." },
      { name: "Pilsner Urquell", why: "The original pale lager; order it hladinka, with a proper head." },
    ],
  },

  vienna: {
    known_for:
      "Imperial on a scale the modern country can't quite justify — palaces, riding schools and gilt concert halls, plus the coffee house as a genuine institution. Orderly, green, and consistently rated the world's most liveable city.",
    top_spots: [
      { name: "Schönbrunn Palace", why: "The Habsburg summer residence and its formal gardens and Gloriette." },
      { name: "Belvedere", why: "Two baroque palaces; the Upper holds Klimt's The Kiss." },
      { name: "St Stephen's Cathedral", why: "The tiled gothic roof at the exact centre of the city." },
      { name: "Hofburg", why: "The winter palace — Sisi Museum, treasury and the Spanish Riding School." },
      { name: "Naschmarkt", why: "A long market of stalls and restaurants, best on Saturday." },
      { name: "Prater", why: "The 1897 ferris wheel and a big informal park behind it." },
    ],
    must_try_foods: [
      { name: "Wiener schnitzel", why: "Veal, pounded thin, fried so the crumb puffs away from the meat." },
      { name: "Sachertorte", why: "Dense chocolate cake with apricot; the Hotel Sacher version is the original." },
      { name: "Apfelstrudel", why: "Pastry stretched until you can read through it." },
      { name: "Tafelspitz", why: "Boiled beef with horseradish; the emperor supposedly ate it daily." },
      { name: "Melange", why: "The Viennese coffee order — and sitting for hours is expected." },
    ],
  },

  seoul: {
    known_for:
      "Palaces and hanok lanes wedged between glass towers, mountains inside the city limits, and a 24-hour eating and drinking culture. Superb public transport and free wifi almost everywhere.",
    top_spots: [
      { name: "Gyeongbokgung Palace", why: "The main Joseon palace; entry is free if you wear hanbok." },
      { name: "Bukchon Hanok Village", why: "Traditional wooden houses on the hill between two palaces." },
      { name: "Gwangjang Market", why: "The oldest market, and the best place in the city to eat cheaply." },
      { name: "N Seoul Tower", why: "Namsan mountain cable car for the view over the whole basin." },
      { name: "Hongdae", why: "University district — street performers, live music, late-night everything." },
      { name: "DMZ day trip", why: "The border with the North, two hours out; passport required." },
    ],
    must_try_foods: [
      { name: "Korean BBQ", why: "Grilled at your table; samgyeopsal pork belly is the standard." },
      { name: "Bibimbap", why: "Rice with vegetables and gochujang, mixed hard before eating." },
      { name: "Tteokbokki", why: "Chewy rice cakes in sweet chilli sauce; the national street snack." },
      { name: "Korean fried chicken", why: "Twice-fried, glazed, and eaten with beer — chimaek." },
      { name: "Bingsu", why: "Shaved milk ice with red bean or fruit; a summer necessity." },
    ],
  },

  bangkok: {
    known_for:
      "Hot, loud and endlessly good to eat in — gilded temples beside malls beside canal-side shophouses. The river and the Skytrain are far better ways around than the traffic.",
    top_spots: [
      { name: "Grand Palace & Wat Phra Kaew", why: "The Emerald Buddha; strict dress code, go early." },
      { name: "Wat Pho", why: "The 46-metre Reclining Buddha, and the country's traditional massage school." },
      { name: "Wat Arun", why: "Porcelain-encrusted riverside spire; best photographed from the far bank at dusk." },
      { name: "Chatuchak Market", why: "Fifteen thousand weekend stalls; wear something you can lose." },
      { name: "Chao Phraya express boat", why: "The cheapest and best sightseeing in the city." },
      { name: "Jim Thompson House", why: "Teak houses assembled by the American who revived Thai silk." },
    ],
    must_try_foods: [
      { name: "Pad thai", why: "Best from a street cart, with lime, chilli flakes and crushed peanut." },
      { name: "Som tam", why: "Green papaya salad pounded to order; say how much chilli you actually want." },
      { name: "Tom yum goong", why: "Hot-and-sour prawn soup with lemongrass and galangal." },
      { name: "Boat noodles", why: "Tiny intense bowls, ordered several at a time." },
      { name: "Mango sticky rice", why: "In season March to May, and worth planning around." },
    ],
  },

  istanbul: {
    known_for:
      "The only city on two continents, and it feels like it — Byzantine, Ottoman and modern Turkish layered along the Bosphorus. Enormous, hilly, and best broken into a few neighbourhoods with ferries between.",
    top_spots: [
      { name: "Hagia Sophia", why: "Cathedral, then mosque, then museum, now a mosque again — 1,500 years of it." },
      { name: "Blue Mosque", why: "Six minarets and 20,000 Iznik tiles, just across the park." },
      { name: "Topkapı Palace", why: "Ottoman court complex; the Harem is a separate and worthwhile ticket." },
      { name: "Grand Bazaar", why: "4,000 shops under one roof since the 15th century." },
      { name: "Basilica Cistern", why: "A sunken forest of columns, with two Medusa heads at the back." },
      { name: "Bosphorus ferry", why: "Cross to Kadıköy on the Asian side for the best eating." },
    ],
    must_try_foods: [
      { name: "Turkish breakfast", why: "A whole table of cheeses, olives, eggs and jams. Clear the morning." },
      { name: "Balık ekmek", why: "Grilled fish in bread, from the boats at Eminönü." },
      { name: "Kebab", why: "Far more varied than abroad — try Adana and İskender." },
      { name: "Simit", why: "Sesame bread ring from a street cart; the standard walking breakfast." },
      { name: "Baklava", why: "Pistachio, in syrup, ideally from Karaköy Güllüoğlu." },
    ],
  },
};

/** Curated guide for a destination label, if one exists. */
export function findCityGuide(destination: string): CuratedGuide | undefined {
  const short = destination.split(",")[0].trim().toLowerCase();
  if (CITY_GUIDES[short]) return CITY_GUIDES[short];
  // Tolerate labels like "Paros" for "Paros Municipality".
  const key = Object.keys(CITY_GUIDES).find(
    (k) => k.startsWith(short) || short.startsWith(k)
  );
  return key ? CITY_GUIDES[key] : undefined;
}
