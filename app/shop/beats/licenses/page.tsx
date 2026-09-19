import type { Metadata } from "next";
import { PortalShell, SectionLabel } from "../../../components/PortalShell";

export const metadata: Metadata = {
  title: "Beat License Archive | Hell Harbor Entertainment",
  description: "Compare the Basic, Premium, Unlimited and Exclusive beat licenses offered by Hell Harbor Entertainment.",
};

const licenses = [
  { tier: "I", name: "Basic Lease", type: "NON-EXCLUSIVE", streams: "100,000", physical: "1,000", royalty: "50% producer split", sync: "Not included", copy: "Commercial release as a single, album or mixtape; for-profit live performance permitted with proper PRO registration." },
  { tier: "II", name: "Premium Lease", type: "NON-EXCLUSIVE", streams: "500,000", physical: "50,000", royalty: "50% producer split", sync: "Not included", copy: "Expanded commercial distribution limits, live performance rights and use within a properly registered release." },
  { tier: "III", name: "Unlimited License", type: "NON-EXCLUSIVE", streams: "Unlimited", physical: "Unlimited", royalty: "25% producer split", sync: "Unlimited", copy: "Unlimited digital and physical distribution, live performance, synchronization and broadcast rights." },
  { tier: "IV", name: "Exclusive License", type: "EXCLUSIVE", streams: "Unlimited", physical: "Unlimited", royalty: "100% writer/publishing", sync: "Unlimited", copy: "Unlimited distribution and usage. The producer may no longer resell the beat after the exclusive license is executed." },
];

export default function LicensesPage() {
  return (
    <PortalShell code="04.4.L" eyebrow="THE LICENSE ARCHIVE" title={<>Know the rights.<br /><em>Choose your path.</em></>} intro="Every instrumental carries a defined set of commercial rights. Compare the available license tiers here before entering the live catalog." actions={<><a className="portal-primary" href="#license-grid">COMPARE LICENSES <span>↓</span></a><a href="/shop/beats">RETURN TO THE FORGE <span>↙</span></a></>}>
      <section id="license-grid" className="portal-section">
        <SectionLabel index="01">LICENSE COMPARISON</SectionLabel>
        <div className="license-grid">
          {licenses.map((license) => <article key={license.tier}><div className="license-card-head"><span>{license.tier}</span><small>{license.type}</small></div><h2>{license.name}</h2><p>{license.copy}</p><dl><div><dt>Digital downloads / streams</dt><dd>{license.streams}</dd></div><div><dt>Physical sales</dt><dd>{license.physical}</dd></div><div><dt>Royalty structure</dt><dd>{license.royalty}</dd></div><div><dt>Sync / broadcast</dt><dd>{license.sync}</dd></div></dl></article>)}
        </div>
        <div className="license-notice"><b>READ BEFORE PURCHASE</b><p>All releases must be properly registered with a performing rights organization where applicable. The executed purchase agreement controls if its terms differ from this summary.</p><a href="mailto:support@HellHarbor.com">ASK THE LICENSING DESK <span>↗</span></a></div>
      </section>
    </PortalShell>
  );
}

