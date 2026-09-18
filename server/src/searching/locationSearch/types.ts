export interface LocationOption {
  value: string
  label: string
  country?: string
  state?: string
  displayLabel: string
  lat: number
  lng: number
}

export interface ParsedPostalQuery {
  countryCode: string
  postalCode: string
}
