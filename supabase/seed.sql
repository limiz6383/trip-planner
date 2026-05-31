-- =============================================================
-- Trip Planner v1 — Community Posts Seed
-- File: supabase/seed.sql
--
-- Provides mock community posts for Tokyo and Berlin.
-- ~20 posts per city with a realistic mix of:
--   author_type: local, tourist, blogger, unknown
--   locality_score: spread across [0.1, 0.9]
--
-- Run AFTER the migration:
--   psql -h <host> -U postgres -d postgres -f supabase/seed.sql
-- =============================================================

-- Truncate any existing seed data (idempotent re-run)
TRUNCATE TABLE community_posts RESTART IDENTITY CASCADE;

INSERT INTO community_posts
  (destination, title, author, author_type, source, content, tags, estimated_cost_usd, locality_score, place_name, location_lat, location_lon)
VALUES

-- ============================================================
-- TOKYO — 20 posts
-- ============================================================

-- Locals (high locality_score)
(
  'Tokyo', 'Hidden standing ramen shop in Shinjuku basement',
  'shinjuku_salaryman', 'local', 'reddit_r_japanlife',
  'Most tourists never find this place — it''s down a flight of stairs in the Golden Gai alley system. Counter seating only, no English menu, but the master will mime the options. Tonkotsu for ¥850.',
  '{"food","budget","ramen","local-secret"}', 8.50, 0.92,
  'Fuunji', 35.6921, 139.7010
),
(
  'Tokyo', 'Yanaka Ginza: last old-town shopping street in Tokyo',
  'yanaka_local', 'local', 'blog',
  'Yanaka escaped WWII bombing so the prewar street grid is intact. The shotengai (shopping street) has family shops that have been here 60+ years. Get the menchi-katsu (fried meat patty) from Hamachiya — locals line up on weekends.',
  '{"culture","food","history","neighborhood"}', 5.00, 0.90,
  'Yanaka Ginza', 35.7267, 139.7714
),
(
  'Tokyo', 'Sunday morning at Tsurukame Yu public bathhouse',
  'sento_addict', 'local', 'reddit_r_japanlife',
  'This is a real neighborhood sento, not a tourist onsen. ¥520 entrance, bring your own toiletries. Regulars are surprised to see foreigners but friendly. Best visited early morning (opens 6am) or after midnight.',
  '{"culture","wellness","local"}', 5.20, 0.88,
  'Tsurukame Yu', 35.7010, 139.7756
),
(
  'Tokyo', 'Depachika basement food halls — best free lunch in Tokyo',
  'isetan_regular', 'local', 'reddit_r_japanlife',
  'The basement food halls (depachika) of Isetan in Shinjuku or Mitsukoshi in Ginza have extraordinary prepared food. The trick locals know: go at 6:30pm when they start marking down bento sets 30–50%. Quality is identical.',
  '{"food","budget","shopping"}', 12.00, 0.82,
  'Isetan Shinjuku B2F', 35.6917, 139.7033
),
(
  'Tokyo', 'Koenji — the anti-Harajuku neighborhood for vintage',
  'koenji_resident', 'local', 'reddit_r_japanlife',
  'Koenji is where Tokyo''s actual subculture lives. Dozens of second-hand and vintage shops along Look Shopping Street. No hype brands, just genuine vintage at 1/3 the price of Omotesando. Best on weekday afternoons.',
  '{"shopping","culture","neighborhood"}', 20.00, 0.85,
  'Look Shopping Street Koenji', 35.7052, 139.6487
),

-- Bloggers (mid-high locality_score)
(
  'Tokyo', 'The perfect Tokyo convenience store breakfast ritual',
  'tokyofoodlab', 'blogger', 'blog',
  'FamilyMart and 7-Eleven in Japan are genuinely excellent. The made-fresh onigiri (¥120–180), steamed buns, and egg salad sandwiches are far better than tourist food. This is what office workers eat every morning. Try the tamago sando.',
  '{"food","budget","breakfast"}', 4.00, 0.75,
  '7-Eleven Shinjuku', 35.6907, 139.6994
),
(
  'Tokyo', 'Shimokitazawa deep dive: vinyl, theater, coffee',
  'shimokita_wanderer', 'blogger', 'blog',
  'Shimokitazawa ("Shimokita") is a 20-minute train from Shibuya. It has the highest density of second-hand vinyl shops and indie theater in Tokyo. Coffee at Bear Pond Espresso if you get there before they run out (they do, by noon).',
  '{"culture","music","coffee","neighborhood"}', 15.00, 0.78,
  'Bear Pond Espresso', 35.6613, 139.6681
),
(
  'Tokyo', 'Toyosu Fish Market — better than Tsukiji for serious eaters',
  'tokyofoodwriter', 'blogger', 'blog',
  'The wholesale tuna auction (apply 2 months in advance, free) runs 5:25am. After, eat at the inner market restaurants — quality matches Tsukiji at lower prices since tourists haven''t fully discovered it yet. The kaisen-don at Sushidai Toyosu is outstanding.',
  '{"food","culture","seafood"}', 25.00, 0.65,
  'Toyosu Market', 35.6467, 139.7829
),
(
  'Tokyo', 'Akihabara beyond the anime: radio kaikan deep cuts',
  'akiba_culture', 'blogger', 'blog',
  'Most tourists hit the big electronics stores. The interesting stuff is the tiny specialist shops in Radio Kaikan building — floors dedicated to vintage electronics components, military surplus, rare hobby parts. Bring cash.',
  '{"shopping","culture","tech"}', 30.00, 0.62,
  'Radio Kaikan', 35.6987, 139.7730
),

-- Tourists (lower locality_score)
(
  'Tokyo', 'Senso-ji temple at 6am beats the crowds completely',
  'globetrotter_dave', 'tourist', 'reddit_r_JapanTravel',
  'Every guidebook says Senso-ji is crowded. True at 10am. At 6am it is empty and the atmosphere is genuinely special — vendors setting up, locals doing morning routines, the gate lit by early light. Worth the early alarm.',
  '{"culture","history","temples"}', 0.00, 0.35,
  'Senso-ji Temple', 35.7147, 139.7967
),
(
  'Tokyo', 'teamLab Borderless — book 3 weeks out or you won''t get in',
  'tech_tourist_2025', 'tourist', 'reddit_r_JapanTravel',
  'The new teamLab Borderless location in Azabudai Hills is worth the ¥3800. Completely different rooms from the old location. Book online as far in advance as possible — sold out most days. Go early, the lines inside grow.',
  '{"culture","art","tech","popular"}', 38.00, 0.30,
  'teamLab Borderless Azabudai', 35.6581, 139.7384
),
(
  'Tokyo', 'Shibuya Crossing: the timing that actually works',
  'travel_blogger_anna', 'tourist', 'blog',
  'Everyone comes here. The tricks: (1) view from Starbucks second floor is free but crowded — go to the Mag''s Park rooftop instead; (2) the crossing is least chaotic on weekday mornings at 8am; (3) it''s genuinely impressive, ignore the cynicism.',
  '{"culture","iconic","photography"}', 0.00, 0.25,
  'Shibuya Crossing', 35.6595, 139.7004
),
(
  'Tokyo', 'Harajuku Takeshita-dori on a Tuesday',
  'harajuku_weekender', 'tourist', 'reddit_r_JapanTravel',
  'The famous Harajuku street. Weekends are a wall of people. On weekdays it is still buzzing but navigable. The crepe stands are genuinely delicious and cheap (¥500–800). Ignore the overpriced souvenir shops.',
  '{"shopping","food","fashion"}', 8.00, 0.28,
  'Takeshita Street', 35.6708, 139.7082
),

-- Unknown (mid locality_score)
(
  'Tokyo', 'Ueno Park sakura logistics — what no one tells you',
  'tokyoparkvisitor', 'unknown', 'reddit_r_travel',
  'During cherry blossom season Ueno Park has 6000+ people on blue tarps by 9am. The park itself is free. If you want to actually see the blossoms, go to Shinjuku Gyoen instead (¥500 entry keeps the crowds manageable). Off-season Ueno is great for the zoo and museums.',
  '{"nature","parks","sakura"}', 5.00, 0.50,
  'Ueno Park', 35.7156, 139.7736
),
(
  'Tokyo', 'Odaiba sunset from the waterfront promenade',
  'bayarea_walker', 'unknown', 'reddit_r_travel',
  'The promenade along Odaiba''s waterfront facing Rainbow Bridge is free and underrated at sunset. Combine with the teamLab Planets (different from Borderless — more visceral, shorter). The artificial beach is weirdly pleasant.',
  '{"outdoor","views","free"}', 0.00, 0.48,
  'Odaiba Beach', 35.6275, 139.7752
),
(
  'Tokyo', 'Tsukiji outer market: what remains and what is actually good',
  'tsukiji_repeat', 'unknown', 'blog',
  'The inner wholesale market moved to Toyosu. The outer market (surrounding streets) still operates with retail stalls and restaurants. Tamagoyaki (sweet egg) from Marutake is excellent. The tamagoyaki-on-a-stick is the move. Lines are shorter than they used to be.',
  '{"food","seafood","market"}', 10.00, 0.55,
  'Tsukiji Outer Market', 35.6654, 139.7706
),
(
  'Tokyo', 'Nakameguro canal walk: when to go and what to skip',
  'meguro_weekend', 'unknown', 'reddit_r_JapanTravel',
  'Nakameguro is genuinely lovely for a canal walk — lined with boutiques and coffee shops. Skip it during cherry blossom season unless you enjoy wall-to-wall bodies. Best in late October when leaves turn. The coffee shops are quality but pricey (¥800+ for a flat white).',
  '{"outdoor","neighborhood","coffee"}', 8.00, 0.58,
  'Nakameguro Canal', 35.6440, 139.6987
),
(
  'Tokyo', 'Ginza Six vs. actual Ginza shopping: the honest comparison',
  'ginza_observer', 'unknown', 'reddit_r_JapanTravel',
  'Ginza Six is spectacular architecture but the brands are the same global luxury names you can find anywhere. The interesting Ginza is the small gallery floors of the old department stores (free entry) and the back streets with specialist shops. Itoya stationery store is a must.',
  '{"shopping","culture","art"}', 50.00, 0.45,
  'Itoya Ginza', 35.6720, 139.7650
),
(
  'Tokyo', 'Shinjuku Golden Gai: the honest guide',
  'goldengai_first', 'unknown', 'blog',
  'Golden Gai is 6 alleys with ~200 tiny bars (5–8 seats each). Many bars have a "cover charge" (¥500–1000) — this is normal, not a scam. The vibe is authentic but tourists have found it; go on weeknights and pick bars with hand-written menus over ones with picture boards.',
  '{"food","nightlife","bars"}', 20.00, 0.60,
  'Golden Gai', 35.6930, 139.7040
),
(
  'Tokyo', 'Day trip to Nikko from Tokyo: what actually takes all day',
  'day_tripper_tokyo', 'tourist', 'blog',
  'Nikko is 2 hours from Tokyo (Tobu Nikko line, cheaper than shinkansen). The UNESCO shrines are genuinely impressive but the walk between them plus the Toshogu complex takes 4–5 hours minimum. Leave Tokyo by 7am. Buy the 2-day pass even if you only go once — it pays off.',
  '{"culture","history","day-trip"}', 50.00, 0.30,
  'Toshogu Shrine Nikko', 36.7582, 139.5990
),

-- ============================================================
-- BERLIN — 20 posts
-- ============================================================

-- Locals
(
  'Berlin', 'Markthalle Neun Thursday Streetfood: the Berlin food market that locals actually use',
  'kreuzberg_resident', 'local', 'reddit_r_germany',
  'Every Thursday 5–10pm. Unlike the tourist markets around Mitte, this is in Kreuzberg and the clientele is mixed local. International food stalls with genuinely good quality. The Bao Bun stall and the Georgian khachapuri vendor are consistently excellent. Cash only for most stalls.',
  '{"food","market","neighborhood"}', 10.00, 0.88,
  'Markthalle Neun', 52.4990, 13.4268
),
(
  'Berlin', 'Swimming in the Spree at Badeschiff',
  'berlin_swimmer', 'local', 'reddit_r_berlin',
  'Badeschiff is a real swimming pool installed in the Spree river (not IN the Spree — it''s a contained pool floating ON it). ¤6–8 entry. Berlin locals use this from June–September. The adjacent beach bar is excellent. Located in Treptow — 20 minutes from Mitte on the U1.',
  '{"outdoor","sports","summer","local"}', 8.00, 0.90,
  'Badeschiff Berlin', 52.4948, 13.4578
),
(
  'Berlin', 'Bergmannstrasse on a Sunday morning',
  'bergmann_local', 'local', 'blog',
  'Bergmannstrasse in Kreuzberg is one of the few areas where Sunday shopping is legal in Berlin (tourist zone exemption). The street has bakeries, a covered market (Marheineke Markthalle), and independent shops. Arrive before 10am to avoid the weekend crush.',
  '{"food","shopping","neighborhood"}', 15.00, 0.85,
  'Bergmannstrasse', 52.4898, 13.3888
),
(
  'Berlin', 'Tempelhofer Feld: the airport that became a park',
  'tempelhof_regular', 'local', 'reddit_r_berlin',
  'The old Tempelhof airport has been a public park since 2010. 386 hectares of flat open space — people bring grills, windsurf on the old runways, grow community gardens. Zero tourist infrastructure intentionally. Bring your own food/drinks and just walk the runways.',
  '{"outdoor","parks","history","free"}', 0.00, 0.87,
  'Tempelhofer Feld', 52.4739, 13.3991
),
(
  'Berlin', 'Prinzessinnenstraße: the Turkish market and surrounding food',
  'neukölln_regular', 'local', 'reddit_r_berlin',
  'The Turkish market along the Landwehrkanal (Maybachufer) runs Tuesday and Friday 11am–6pm. Fresh produce, fabrics, cheeses, and the best Gözleme (Turkish flatbread) in the city. The surrounding Neukölln streets have excellent Syrian, Vietnamese, and West African food at non-tourist prices.',
  '{"food","market","multicultural"}', 8.00, 0.84,
  'Turkish Market Maybachufer', 52.4872, 13.4257
),

-- Bloggers
(
  'Berlin', 'Street art guide to Berlin that isn''t just the East Side Gallery',
  'berlin_street_art', 'blogger', 'blog',
  'The East Side Gallery is impressive but it''s a managed tourist destination. The raw street art is in: (1) the RAW Gelände complex in Friedrichshain; (2) the walls along Revaler Strasse; (3) the Haus Schwarzenberg courtyard in Mitte (free entry). These change constantly — worth revisiting.',
  '{"culture","art","free","neighborhood"}', 0.00, 0.72,
  'Haus Schwarzenberg', 52.5231, 13.4019
),
(
  'Berlin', 'East German food nostalgia tour of Berlin',
  'ostalgie_foodie', 'blogger', 'blog',
  'Currywurst is the iconic Berlin street food (Currywurst Museum has closed but the stands remain — Konnopke''s under the U2 tracks in Prenzlauer Berg since 1930). For full Ostalgie: Zur Letzten Instanz restaurant (oldest in Berlin, 1621). The DDR-era Ketwurst (hotdog in a bread roll with ketchup hole) is at the Alexanderplatz Imbiss.',
  '{"food","history","culture","local"}', 5.00, 0.70,
  'Konnopke''s Imbiss', 52.5394, 13.4138
),
(
  'Berlin', 'Day club culture in Berlin for people who don''t do nightclubs',
  'berlin_daytime', 'blogger', 'blog',
  'Berlin''s club culture is famous but there''s a daylife parallel: Klunkerkranich is a rooftop bar/garden on top of a parking garage in Neukölln (free access before 6pm, ¤2 after). Bar Tausend under the S-Bahn arches. Sisyphos on weekends runs 24-hour events but opens at noon.',
  '{"nightlife","outdoor","culture"}', 10.00, 0.68,
  'Klunkerkranich', 52.4820, 13.4370
),
(
  'Berlin', 'Jewish Museum Berlin: a genuine architectural experience',
  'museum_blogger', 'blogger', 'blog',
  'Daniel Libeskind''s Jewish Museum is one of the few buildings where the architecture itself is the exhibit. The void spaces and the garden of exile are disorienting in an intentional, powerful way. Budget 3 hours minimum. The exhibition is extensive. ¤10 entry, closed Saturdays.',
  '{"culture","history","architecture","museum"}', 10.00, 0.55,
  'Jewish Museum Berlin', 52.5025, 13.3954
),

-- Tourists
(
  'Berlin', 'Checkpoint Charlie is a tourist trap — what to do instead',
  'history_realist', 'tourist', 'reddit_r_travel',
  'Checkpoint Charlie itself is a reconstruction with actors for photo ops and overpriced cafes. Walk 10 minutes to the Topography of Terror (free, outdoors) for actual history about the SS and Gestapo. Far more serious and informative. Then the nearby DDR Museum (¤13.50) for the everyday life angle.',
  '{"history","culture","museum"}', 13.50, 0.28,
  'Topography of Terror', 52.5066, 13.3837
),
(
  'Berlin', 'The Pergamon Museum situation (currently under renovation)',
  'museum_tourist', 'tourist', 'reddit_r_travel',
  'The famous Pergamon altar is under renovation until 2027 and not viewable. The rest of the museum (Ishtar Gate, Roman Market Gate of Miletus) IS open. Still worth ¤21 entry despite the closure. Book online — same-day tickets often sell out. Museum Island pass ¤29 if you want multiple museums.',
  '{"culture","history","art","museum"}', 21.00, 0.32,
  'Pergamon Museum', 52.5213, 13.3968
),
(
  'Berlin', 'Brandenburg Gate crowds: the timing and angles that work',
  'berlin_first_timer', 'tourist', 'reddit_r_JapanTravel',
  'Brandenburg Gate is genuinely iconic and worth seeing. Best times: pre-8am or after 9pm. The view from Pariser Platz is the postcard shot. The Reichstag dome (free, must book 2–3 weeks in advance online) gives an elevated view. Bring ID for Reichstag.',
  '{"history","culture","iconic","free"}', 0.00, 0.25,
  'Brandenburg Gate', 52.5163, 13.3777
),
(
  'Berlin', 'Berlin Wall Memorial (Bernauer Strasse) is better than you expect',
  'history_tourist', 'tourist', 'blog',
  'Unlike Checkpoint Charlie, the Bernauer Strasse Berlin Wall Memorial preserves an actual section of the wall with the death strip intact. Free outdoor area open always, documentation centre (free) open Tue–Sun. The outdoor audio guide app is excellent. Allow 2 hours.',
  '{"history","culture","free","outdoor"}', 0.00, 0.35,
  'Berlin Wall Memorial', 52.5352, 13.3882
),

-- Unknown
(
  'Berlin', 'Prenzlauer Berg for coffee and Sunday farmers market',
  'prenzlauerberg_visitor', 'unknown', 'reddit_r_travel',
  'The area around Helmholtzplatz has the highest density of good independent cafes in Berlin. Bonanza Coffee Roasters is the quality benchmark (single-origin, ¤4–6). The Sunday farmers market at Kollwitzplatz (9am–4pm) has the best bread and cheese in the city. Bring a bag.',
  '{"coffee","food","neighborhood","market"}', 12.00, 0.62,
  'Kollwitzplatz', 52.5381, 13.4185
),
(
  'Berlin', 'Humboldthain flak tower: bizarre and free Berlin attraction',
  'urban_explorer', 'unknown', 'blog',
  'On top of Humboldthain park there are the ruins of a WWII anti-aircraft tower — the Allies blew up what they could and buried the rest in rubble to create the park hill. Free guided tours run on weekends. The view from the top is surprisingly good and few tourists find this.',
  '{"history","outdoor","free","off-the-beaten-path"}', 0.00, 0.58,
  'Humboldthain Flak Tower', 52.5456, 13.3832
),
(
  'Berlin', 'East Side Gallery: how to actually experience it',
  'east_side_visitor', 'unknown', 'reddit_r_travel',
  '1.3km of the Berlin Wall painted by artists in 1990. The murals are preserved and genuinely moving. Early morning (before 9am) it''s calm. The adjacent Ostbahnhof area has food options. The most photographed mural (Bruderkuss — Honecker and Brezhnev kissing) is in the middle section.',
  '{"history","art","outdoor"}', 0.00, 0.45,
  'East Side Gallery', 52.5053, 13.4401
),
(
  'Berlin', 'Neukölln for dinner: the honest restaurant guide',
  'neukölln_diner', 'unknown', 'reddit_r_berlin',
  'Neukölln''s Sonnenallee area has the best and most affordable Middle Eastern food in Berlin. The Lebanese on Sonnenallee proper are excellent (shawarma ¤4–6). For Vietnamese, the area around Karl-Marx-Strasse. Avoid anything with English menus in Neukölln — sign of tourist pricing.',
  '{"food","neighborhood","budget"}', 7.00, 0.68,
  'Sonnenallee', 52.4760, 13.4355
),
(
  'Berlin', 'Berlin''s underground bunker tours',
  'underground_berlin', 'unknown', 'blog',
  'The Berliner Unterwelten runs professional tours of the WWII and Cold War tunnel system. The "Dark Worlds" tour is the classic — ¤15, 90 minutes, into the actual flak tower bunker under Gesundbrunnen. Book in advance. Not for claustrophobics. The museum shop has the best Berlin history books.',
  '{"history","culture","off-the-beaten-path"}', 15.00, 0.55,
  'Berliner Unterwelten', 52.5504, 13.3885
),
(
  'Berlin', 'Schloss Charlottenburg gardens: free and underrated',
  'palace_walker', 'unknown', 'blog',
  'The palace itself has an entry fee (¤19 for the full combo). The gardens are free and extensive — baroque, English landscape, and a small lake section. Local families use it as a park. Combined with the Charlottenburg neighborhood (Savignyplatz area for restaurants) makes a full half-day.',
  '{"outdoor","culture","history","free"}', 0.00, 0.42,
  'Schloss Charlottenburg', 52.5208, 13.2957
),
(
  'Berlin', 'Flea markets in Berlin: the good ones',
  'berlin_flea', 'blogger', 'blog',
  'The Mauerpark flea market (Sunday, free to browse) is famous but mostly overpriced vintage. The better ones for actual bargains: Flohmarkt am Mauerpark''s smaller northern section, Flohmarkt Ostbahnhof (Sat/Sun), and the Nowkoelln Flowmarkt (floating market on the canal, twice monthly). Check Instagram for dates.',
  '{"shopping","outdoor","culture","local"}', 10.00, 0.72,
  'Flohmarkt Ostbahnhof', 52.5072, 13.4346
);
