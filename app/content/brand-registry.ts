export const company = {
  name: "Hell Harbor Entertainment",
  founded: 2018,
  location: "Grays Harbor County, Washington",
  summary:
    "An independent entertainment company connecting music, screen, interactive media, publishing, and live production.",
} as const;

export const houses = [
  {
    mark: "D&S",
    name: "Dab & Stab Records",
    type: "Active music division",
    status: "Active",
    copy: "The founding label for underground hip hop, metal-rap, horrorcore, experimental releases, and the DNSR catalog.",
    href: "https://dabnstabrecords.com",
  },
  {
    mark: "IDS",
    name: "Infamous Development Studios",
    type: "Games and software",
    status: "Active",
    copy: "Interactive systems, roleplay experiences, private servers, and experimental software projects.",
    href: "https://infamousdevstudios.com",
  },
  {
    mark: "MMM",
    name: "Mystic Mirage Motion",
    type: "Film and television",
    status: "Active",
    copy: "The screen-production identity for film, television, and visual storytelling projects.",
    href: "/contact",
  },
  {
    mark: "HHP",
    name: "Hell Harbor Publishing",
    type: "Publishing",
    status: "In development",
    copy: "The planned home for books, comics, production documents, and original written worlds.",
    href: "/contact",
  },
] as const;

export const publicContacts = [
  {
    group: "General & Business",
    code: "GENERAL",
    entries: [
      ["General Contact", "contact@HellHarbor.com"],
      ["Business Office", "business@HellHarbor.com"],
    ],
  },
  {
    group: "Music & Talent",
    code: "TALENT",
    id: "booking",
    entries: [
      ["Music Bookings", "booking@DabNStabRecords.com"],
      ["JesterTheRyda", "jestertheryda@HellHarbor.com"],
    ],
  },
  {
    group: "Screen & Voice",
    code: "PERFORMANCE",
    entries: [
      ["Screen Acting Bookings", "screenbookings@HellHarbor.com"],
      ["Voice Acting Bookings", "voicebookings@HellHarbor.com"],
    ],
  },
  {
    group: "Production & Support",
    code: "PRODUCTION",
    entries: [
      ["Production Office", "production@HellHarbor.com"],
      ["General Support", "support@HellHarbor.com"],
    ],
  },
] as const;

export const featureArtists = [
  {
    name: "JesterTheRyda",
    role: "Current DNSR solo artist",
    availability: "Availability confirmed before purchase",
  },
] as const;

export const activeProjects = [
  {
    name: "Badass Backyard Wrestling",
    type: "Sports entertainment",
    status: "Active",
  },
] as const;

export const eventStatus = {
  hasPublishedEvents: false,
  emptyTitle: "No public events are currently announced.",
  emptyCopy:
    "New dates will appear in the event registry after they are confirmed. Venue, festival, and appearance inquiries remain open.",
} as const;
