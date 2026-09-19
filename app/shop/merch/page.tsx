import type { Metadata } from "next";
import { PortalShell, SectionLabel } from "../../components/PortalShell";
import { SpreadShopEmbed } from "../../components/SpreadShopEmbed";

export const metadata: Metadata = {
  title: "Official Relics | Hell Harbor Entertainment",
  description: "Browse the official Hell Harbor Entertainment merchandise catalog.",
};

export default function MerchPage() {
  return (
    <PortalShell code="04.2" eyebrow="OFFICIAL RELICS" title={<>Wear the mark.<br /><em>Carry the Harbor.</em></>} intro="The official Hell Harbor merchandise vault, supplied by SpreadShop and presented inside the Castle. Browse current apparel, accessories and customizable goods below." actions={<><a className="portal-primary" href="#merch-catalog">OPEN THE VAULT <span>↓</span></a><a href="/shop">RETURN TO EXCHANGE <span>↙</span></a></>}>
      <section id="merch-catalog" className="portal-section portal-section--deep">
        <SectionLabel index="01">MERCHANDISE CATALOG</SectionLabel>
        <div className="portal-heading-row"><div><p className="kicker">THE MERCH VAULT</p><h2>Official<br />Hell Harbor goods.</h2></div><p>T-shirts, hoodies, stickers, mugs and more. The selection is updated as new designs emerge from the Harbor, with customization and fulfillment handled through the live SpreadShop system below.</p></div>
        <SpreadShopEmbed />
      </section>
      <section className="portal-callout"><span>LOOKING FOR DIGITAL RELEASES?</span><h2>The Main Exchange holds downloads, artist features and other offerings.</h2><a href="/shop">ENTER THE MAIN EXCHANGE <i>↗</i></a></section>
    </PortalShell>
  );
}

