export type JournalPlace = {
  lat: number
  lng: number
}

// Add one entry here for each exact Place value used by a Journal post.
// Coordinates are intentionally local: no visitor request is sent to a geocoding service.
export const journalPlaces: Record<string, JournalPlace> = {
  'Maui, Hawaii': {
    lat: 20.7984,
    lng: -156.3319,
  },
  'Mexico City, Mexico': {
    lat: 19.4326,
    lng: -99.1332,
  },
  'New Haven, Connecticut': {
    lat: 41.3083,
    lng: -72.9279,
  },
  'New York City, New York': {
    lat: 40.7128,
    lng: -74.0060,
  },
  'New Hampshire, United States': {
    lat: 43.1939,
    lng: -71.5724,
  },
  'Barcelona, Spain': {
    lat: 41.3851,
    lng: 2.1734,
  },
  'Madrid, Spain': {
    lat: 40.4168,
    lng: -3.7038,
  },
}
export function findJournalPlace(locationName: string | null): JournalPlace | null {
  return locationName ? journalPlaces[locationName] ?? null : null
}
