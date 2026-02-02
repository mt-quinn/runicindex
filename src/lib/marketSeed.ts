import type { MarketHourState } from "@/lib/types";

/**
 * Seed market: baked-in initial listing (25 companies) and initial headlines.
 * This is used only when there is no prior hour state in KV.
 */
export function makeSeedMarketHour(hourKey: string): MarketHourState {
  const companies = [
    { id: "FIRE", name: "Fireball", price: 14.6 },
    { id: "ORC", name: "Orc Mercenaries", price: 9.35 },
    { id: "PATRN", name: "Dark Patrons", price: 6.8 },
    { id: "SNEAK", name: "Sneak Attack", price: 11.2 },
    { id: "HEAL", name: "Sanctified Healing", price: 18.9 },
    { id: "PLAG", name: "Plague Wards", price: 12.4 },
    { id: "MITH", name: "Mithril", price: 22.3 },
    { id: "DRAGN", name: "Dragonfire Insurance", price: 8.75 },
    { id: "CARVN", name: "Caravan Guilds", price: 16.1 },
    { id: "PORTL", name: "Portal Networks", price: 19.4 },
    { id: "DIVIN", name: "Divination", price: 15.3 },
    { id: "RELIC", name: "Relic Trade", price: 5.6 },
    { id: "DWARF", name: "Dwarven Forges", price: 17.2 },
    { id: "ELIX", name: "Elixirs", price: 10.9 },
    { id: "GRIFF", name: "Griffon Riders", price: 13.7 },
    { id: "RUNE", name: "Runesmiths", price: 21.6 },
    { id: "NECRO", name: "Necromancy", price: 4.1 },
    { id: "FAE", name: "Fey Courts", price: 7.9 },
    { id: "BARD", name: "Bardic Colleges", price: 6.3 },
    { id: "GOLEM", name: "Golemworks", price: 20.2 },
    { id: "SHIP", name: "Spelljammers", price: 12.8 },
    { id: "CROWN", name: "Crown Tax Levies", price: 9.9 },
    { id: "BEAST", name: "Beast Taming", price: 8.2 },
    { id: "ALCH", name: "Alchemist Guild", price: 23.7 },
    { id: "WARD", name: "Ancient Wards", price: 14.1 },
  ].map((c) => ({
    id: c.id,
    name: c.name,
    concept: c.name,
    price: c.price,
    prevPrice: c.price,
    change: 0,
    changePct: 0,
    status: "LISTED" as const,
  }));

  const news = [
    {
      id: "seed-big-1",
      kind: "BIG" as const,
      hourKey,
      title: "Sky-Scar Comet Spurs Prophecy Rush",
      body: "A green-tailed comet carved a glowing wake over the Free Cities. Seers sell readings, star-mages buy reagents, and nervous caravans pay extra for wards against 'falling fire'.",
      impact:
        "Boosts divination, wards, and astral reagents; pressures caravan security costs; mild demand for fire mitigation.",
    },
    {
      id: "seed-big-2",
      kind: "BIG" as const,
      hourKey,
      title: "Saltmarsh Plague Fever Hits Dock Wards",
      body: "Dockside healers report a fever spreading through Saltmarsh wharves. Apothecaries raise prices, clerics are overwhelmed, and quarantine seals slow imports of herbs and reagents.",
      impact: "Healers and potions up; trade and smuggling volatility; herb supply tightens.",
    },
    {
      id: "seed-big-3",
      kind: "BIG" as const,
      hourKey,
      title: "Ironhold Issues Anti-Necromancy Edict",
      body: "The Ironhold Synod bans corpse-labor within its walls after a crypt incident. Enforcement squads seize grimoires and sanctify old tunnels; legitimate funerary guilds gain contracts.",
      impact:
        "Necromancy down; sanctified wards and funerary services up; black-market bone trade spikes.",
    },
  ];

  return {
    version: 1,
    hourKey,
    generatedAt: Date.now(),
    companies,
    delisted: [],
    news,
  };
}


