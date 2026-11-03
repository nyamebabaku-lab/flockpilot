export const BIRD_TYPES: Record<string, string> = {
  LAYER: "Layers",
  BROILER: "Broilers",
  TURKEY: "Turkeys",
  DUCK: "Ducks",
  GUINEA_FOWL: "Guinea fowl",
  OTHER: "Other birds",
};

export const ROLES: Record<string, string> = { OWNER: "Owner", MANAGER: "Manager", WORKER: "Worker" };

export const MORTALITY_CAUSES = ["Unknown", "Disease", "Heat stress", "Predator", "Injury", "Smothering", "Culled sick"];

export const ITEM_CATEGORIES: Record<string, string> = {
  FEED: "Feed",
  DRUG: "Drugs",
  VACCINE: "Vaccines",
  EQUIPMENT: "Equipment",
  EGGS: "Eggs",
  OTHER: "Other",
};

export const EXPENSE_CATEGORIES = ["Feed", "Chicks", "Drugs and vaccines", "Labour", "Utilities", "Transport", "Repairs", "Other"];

export const SALE_KINDS: Record<string, string> = { EGGS: "Eggs (crate)", BIRDS: "Birds", MANURE: "Manure", OTHER: "Other" };

export const MOMO_NETWORKS: Record<string, string> = { MTN: "MTN Mobile Money", TELECEL: "Telecel Cash", AT: "AT Money" };

export const EGGS_PER_CRATE = 30;
