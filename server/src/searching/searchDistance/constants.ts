export const LOCATION_SCORING_VERSION = '7'

export interface CountryAlias {
  canonical: string
  aliases: string[]
}

export const COUNTRY_ALIASES: CountryAlias[] = [
  { canonical: 'united states', aliases: ['united states', 'united states of america', 'usa'] },
  { canonical: 'united kingdom', aliases: ['united kingdom', 'uk', 'great britain', 'britain', 'england'] },
  { canonical: 'canada', aliases: ['canada'] },
  { canonical: 'australia', aliases: ['australia'] },
  { canonical: 'new zealand', aliases: ['new zealand'] },
  { canonical: 'germany', aliases: ['germany', 'deutschland'] },
  { canonical: 'france', aliases: ['france'] },
  { canonical: 'spain', aliases: ['spain'] },
  { canonical: 'italy', aliases: ['italy'] },
  { canonical: 'netherlands', aliases: ['netherlands', 'holland'] },
  { canonical: 'sweden', aliases: ['sweden'] },
  { canonical: 'norway', aliases: ['norway'] },
  { canonical: 'denmark', aliases: ['denmark'] },
  { canonical: 'finland', aliases: ['finland'] },
  { canonical: 'ireland', aliases: ['ireland'] },
  { canonical: 'switzerland', aliases: ['switzerland'] },
  { canonical: 'austria', aliases: ['austria'] },
  { canonical: 'belgium', aliases: ['belgium'] },
  { canonical: 'portugal', aliases: ['portugal'] },
  { canonical: 'poland', aliases: ['poland', 'polska'] },
  { canonical: 'czechia', aliases: ['czechia', 'czech republic'] },
  { canonical: 'romania', aliases: ['romania'] },
  { canonical: 'hungary', aliases: ['hungary'] },
  { canonical: 'greece', aliases: ['greece'] },
  { canonical: 'india', aliases: ['india'] },
  { canonical: 'pakistan', aliases: ['pakistan'] },
  { canonical: 'bangladesh', aliases: ['bangladesh'] },
  { canonical: 'japan', aliases: ['japan'] },
  { canonical: 'south korea', aliases: ['south korea', 'korea'] },
  { canonical: 'singapore', aliases: ['singapore'] },
  { canonical: 'philippines', aliases: ['philippines'] },
  { canonical: 'thailand', aliases: ['thailand'] },
  { canonical: 'vietnam', aliases: ['vietnam'] },
  { canonical: 'indonesia', aliases: ['indonesia'] },
  { canonical: 'malaysia', aliases: ['malaysia'] },
  { canonical: 'united arab emirates', aliases: ['united arab emirates', 'uae'] },
  { canonical: 'saudi arabia', aliases: ['saudi arabia'] },
  { canonical: 'israel', aliases: ['israel'] },
  { canonical: 'turkiye', aliases: ['turkiye', 'turkey'] },
  { canonical: 'south africa', aliases: ['south africa'] },
  { canonical: 'nigeria', aliases: ['nigeria'] },
  { canonical: 'kenya', aliases: ['kenya'] },
  { canonical: 'egypt', aliases: ['egypt'] },
  { canonical: 'mexico', aliases: ['mexico'] },
  { canonical: 'brazil', aliases: ['brazil'] },
  { canonical: 'argentina', aliases: ['argentina'] },
  { canonical: 'chile', aliases: ['chile'] },
  { canonical: 'colombia', aliases: ['colombia'] },
  { canonical: 'peru', aliases: ['peru'] },
]

export const LOCATION_COUNTRY_HINTS: CountryAlias[] = [
  { canonical: 'united kingdom', aliases: ['cambridgeshire', 'reading'] },
  { canonical: 'belgium', aliases: ['brussels'] },
]
