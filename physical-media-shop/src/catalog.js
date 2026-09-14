// Server-authoritative catalog. The browser never supplies prices or Kunaki ProductIds.
// Replace placeholders with published Kunaki 10-character product IDs before activating items.
export const CATALOG = Object.freeze({
  "example-cd": Object.freeze({
    sku: "example-cd",
    title: "Example Album - CD",
    description: "Replace with a live Hell Harbor Entertainment CD title.",
    format: "CD",
    retailPriceCents: 1500,
    kunakiProductId: "TBD0000001",
    imageUrl: "",
    active: false,
    maxQuantity: 10
  }),
  "example-cassette": Object.freeze({
    sku: "example-cassette",
    title: "Example Album - Cassette",
    description: "Replace with a live Hell Harbor Entertainment cassette title.",
    format: "Cassette",
    retailPriceCents: 2000,
    kunakiProductId: "TBD0000002",
    imageUrl: "",
    active: false,
    maxQuantity: 10
  }),
  "example-vinyl": Object.freeze({
    sku: "example-vinyl",
    title: "Example Album - Vinyl",
    description: "Replace with a live Hell Harbor Entertainment vinyl title.",
    format: "Vinyl",
    retailPriceCents: 5000,
    kunakiProductId: "TBD0000003",
    imageUrl: "",
    active: false,
    maxQuantity: 4
  })
});

export function publicCatalog() {
  return Object.values(CATALOG)
    .filter((item) => item.active)
    .map(({ kunakiProductId, ...publicItem }) => publicItem);
}
