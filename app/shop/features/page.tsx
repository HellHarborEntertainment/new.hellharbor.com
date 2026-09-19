import type { Metadata } from "next";
import { PortalShell, SectionLabel } from "../../components/PortalShell";
import { featureArtists } from "../../content/brand-registry";

export const metadata: Metadata = {
  title: "Artist Features | Hell Harbor Entertainment",
  description: "License verses, hooks and artist features through Hell Harbor Entertainment and Dab & Stab Records.",
};

export default function FeaturesPage() {
  return (
    <PortalShell code="04.3" eyebrow="THE FEATURE DESK" title={<>Open the line.<br /><em>Build the record.</em></>} intro="Feature requests begin with the Dab & Stab Records booking desk. Availability, creative scope, rights, deadlines, and pricing are confirmed before any transaction." actions={<><a className="portal-primary" href="#roster">VIEW AVAILABILITY <span>↓</span></a><a href="mailto:booking@DabNStabRecords.com">CONTACT BOOKING <span>↗</span></a></>}>
      <section className="portal-section">
        <SectionLabel index="01">BEFORE YOU PURCHASE</SectionLabel>
        <div className="process-grid">
          <article><span>01</span><h2>Open the line.</h2><p>Contact the booking department or join the Hell Harbor Discord and open an Artist Feature ticket before purchasing a package.</p></article>
          <article><span>02</span><h2>Confirm the artist.</h2><p>We establish a direct line between you and the requested artist, confirming availability, scope, deadlines and the creative direction.</p></article>
          <article><span>03</span><h2>Review the agreement.</h2><p>Rights, credits, royalties, delivery terms, and payment are documented for the specific collaboration before work begins.</p></article>
        </div>
      </section>
      <section className="portal-section portal-section--deep">
        <SectionLabel index="02">RIGHTS &amp; TERMS</SectionLabel>
        <div className="license-pair">
          <article><small>PROJECT-SPECIFIC</small><h2>No one-size-fits-all license.</h2><p>Every feature is negotiated for its actual release plan. No blanket royalty, publishing, or exclusivity promise applies until both parties approve a written agreement.</p></article>
          <article><small>CONFIRM BEFORE PAYMENT</small><h2>Know what the agreement covers.</h2><p>The booking desk confirms usage rights, credits, revisions, delivery, splits, and any exclusivity terms before directing a collaborator to an approved payment method.</p></article>
        </div>
      </section>
      <section id="roster" className="portal-section">
        <SectionLabel index="03">FEATURE ROSTER</SectionLabel>
        <div className="feature-roster">
          {featureArtists.map((artist, index) => <article key={artist.name}><div><span>OPTION 0{index + 1}</span><h2>{artist.name}</h2><small>{artist.role}</small></div><div><a href="mailto:booking@DabNStabRecords.com">{artist.availability}<i>↗</i></a></div></article>)}
        </div>
        <p className="transaction-note">Poltergyst is preserved in the DNSR alumni archive and is not listed as a currently available feature artist.</p>
      </section>
      <section className="portal-callout"><span>NEED A CUSTOM ARRANGEMENT?</span><h2>Open a direct line with the booking department before purchase.</h2><a href="mailto:booking@DabNStabRecords.com">CONTACT BOOKING <i>↗</i></a></section>
    </PortalShell>
  );
}
