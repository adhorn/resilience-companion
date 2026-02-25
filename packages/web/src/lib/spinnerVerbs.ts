/**
 * Fun spinner verbs shown while the AI is thinking.
 * Inspired by Claude Code's spinner verbs.
 * Source: https://github.com/wynandw87/claude-code-spinner-verbs
 */

const SPINNER_VERBS = [
  // Claude Code built-in defaults
  "Accomplishing", "Actioning", "Actualizing", "Architecting", "Baking",
  "Beaming", "Beboppin'", "Befuddling", "Billowing", "Blanching",
  "Bloviating", "Boogieing", "Boondoggling", "Booping", "Bootstrapping",
  "Brewing", "Burrowing", "Calculating", "Canoodling", "Caramelizing",
  "Cascading", "Catapulting", "Cerebrating", "Channeling", "Choreographing",
  "Churning", "Clauding", "Coalescing", "Cogitating", "Combobulating",
  "Composing", "Computing", "Concocting", "Considering", "Contemplating",
  "Cooking", "Crafting", "Creating", "Crunching", "Crystallizing",
  "Cultivating", "Deciphering", "Deliberating", "Determining",
  "Dilly-dallying", "Discombobulating", "Doodling", "Drizzling",
  "Ebbing", "Effecting", "Elucidating", "Embellishing", "Enchanting",
  "Envisioning", "Evaporating", "Fermenting", "Fiddle-faddling",
  "Finagling", "Flambeing", "Flibbertigibbeting", "Flowing", "Flummoxing",
  "Fluttering", "Forging", "Forming", "Frolicking", "Frosting",
  "Gallivanting", "Galloping", "Garnishing", "Generating", "Germinating",
  "Grooving", "Gusting", "Harmonizing", "Hashing", "Hatching",
  "Herding", "Hullaballooing", "Hyperspacing", "Ideating", "Imagining",
  "Improvising", "Incubating", "Inferring", "Infusing", "Ionizing",
  "Jitterbugging", "Julienning", "Kneading", "Leavening", "Levitating",
  "Lollygagging", "Manifesting", "Marinating", "Meandering",
  "Metamorphosing", "Misting", "Moonwalking", "Moseying", "Mulling",
  "Mustering", "Musing", "Nebulizing", "Nesting", "Noodling",
  "Nucleating", "Orbiting", "Orchestrating", "Osmosing", "Perambulating",
  "Percolating", "Perusing", "Philosophising", "Photosynthesizing",
  "Pollinating", "Pondering", "Pontificating", "Pouncing", "Precipitating",
  "Prestidigitating", "Processing", "Proofing", "Propagating", "Puttering",
  "Puzzling", "Quantumizing", "Razzle-dazzling", "Razzmatazzing",
  "Recombobulating", "Reticulating", "Roosting", "Ruminating", "Sauteing",
  "Scampering", "Schlepping", "Scurrying", "Seasoning", "Shenaniganing",
  "Shimmying", "Simmering", "Skedaddling", "Sketching", "Slithering",
  "Smooshing", "Sock-hopping", "Spelunking", "Spinning", "Sprouting",
  "Stewing", "Sublimating", "Swirling", "Swooping", "Symbioting",
  "Synthesizing", "Tempering", "Tinkering", "Tomfoolering",
  "Topsy-turvying", "Transfiguring", "Transmuting", "Twisting",
  "Undulating", "Unfurling", "Unravelling", "Vibing", "Waddling",
  "Wandering", "Warping", "Whatchamacalliting", "Whirlpooling", "Whirring",
  "Whisking", "Wibbling", "Wrangling", "Zesting", "Zigzagging",

  // Absurd/Nonsense
  "Flibberblasting", "Quibblewomping", "Splutterglooping",
  "Gobbledygooking", "Glimmerfizzing", "Zorpifying", "Bumblefrizzling",
  "Flooperdoodling",

  // Sci-Fi/Space
  "Teleporting", "Wormholing", "Hyperdriving", "Quantumleaping",
  "Planetforming", "Warp-driving", "Nebula-hopping", "Tractor-beaming",

  // Whimsical
  "Giggling", "Daydreaming", "Twinkling", "Bouncing", "Hopscotching",
  "Whistling", "Glimmering", "Sparkling", "Stargazing", "Galumphing",
  "Bamboozling",

  // Food
  "Pickling", "Sourdough-starting", "Kombucha-brewing", "Dry-aging",
  "Spherifying",

  // Music/Dance
  "Beatboxing", "Breakdancing", "Freestyling", "Voguing", "Jamming",
  "Two-stepping",

  // Onomatopoeia
  "Swooshing", "Fizzing", "Buzzing", "Boinging", "Ka-powing",

  // Animals
  "Otter-sliding", "Squirreling", "Penguin-waddling", "Fox-trotting",
  "Prowling",
];

let lastIndex = -1;

/** Returns a random spinner verb, avoiding repeats. */
export function getSpinnerVerb(): string {
  let index: number;
  do {
    index = Math.floor(Math.random() * SPINNER_VERBS.length);
  } while (index === lastIndex && SPINNER_VERBS.length > 1);
  lastIndex = index;
  return SPINNER_VERBS[index];
}
