// Starting values every new farm gets. All of them can be changed in the app.

// Ghana monthly PAYE bands as a starting example. Confirm with an accountant before real payroll.
export const PAYE_BANDS = [
  { width: 49000, bps: 0 },
  { width: 11000, bps: 500 },
  { width: 13000, bps: 1000 },
  { width: 316667, bps: 1750 },
  { width: 1600000, bps: 2500 },
  { width: 3052000, bps: 3000 },
  { width: null, bps: 3500 },
];

// A starting vaccination schedule. Confirm it with your vet.
export const TEMPLATES = [
  ...[
    [1, "Marek's", "Injection"],
    [7, "Newcastle + IB", "Drinking water"],
    [14, "Gumboro", "Drinking water"],
    [21, "Newcastle + IB booster", "Drinking water"],
    [28, "Gumboro booster", "Drinking water"],
    [42, "Fowl pox", "Wing web"],
    [56, "Newcastle booster", "Drinking water"],
    [112, "Newcastle + IB pre-lay", "Injection"],
  ].map(([dayOfAge, vaccine, route]) => ({ birdType: "LAYER", dayOfAge: Number(dayOfAge), vaccine: String(vaccine), route: String(route) })),
  ...[
    [7, "Newcastle + IB", "Drinking water"],
    [14, "Gumboro", "Drinking water"],
    [21, "Newcastle booster", "Drinking water"],
  ].map(([dayOfAge, vaccine, route]) => ({ birdType: "BROILER", dayOfAge: Number(dayOfAge), vaccine: String(vaccine), route: String(route) })),
  { birdType: "TURKEY", dayOfAge: 21, vaccine: "Newcastle", route: "Drinking water" },
  { birdType: "TURKEY", dayOfAge: 56, vaccine: "Fowl pox", route: "Wing web" },
];
