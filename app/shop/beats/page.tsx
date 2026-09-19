import type { Metadata } from "next";
import { PortalShell, SectionLabel } from "../../components/PortalShell";
import { ProviderFrame } from "../../components/ProviderFrame";

export const metadata: Metadata = {
  title: "The Beat Forge | Hell Harbor Entertainment",
  description: "Browse instrumentals produced by RydaGangProd and licensed through Hell Harbor Entertainment.",
};

export default function BeatsPage() {
  return (
    <PortalShell code="04.4" eyebrow="THE BEAT FORGE" title={<>Find the pulse.<br /><em>Forge the record.</em></>} intro="Production by RydaGangProd, officially licensed, endorsed and distributed by Hell Harbor Entertainment. Preview the live catalog, compare license paths and enter the forge without leaving the Castle." actions={<><a className="portal-primary" href="#beat-catalog">HEAR THE CATALOG <span>↓</span></a><a href="/shop/beats/licenses">COMPARE LICENSES <span>↗</span></a></>}>
      <section className="portal-section">
        <SectionLabel index="01">FORGE DIRECTORY</SectionLabel>
        <div className="beat-directory">
          <a href="#beat-catalog"><span>01</span><small>LIVE INVENTORY</small><h2>BeatStars Catalog</h2><p>Preview and license current RydaGangProd instrumentals through the embedded player.</p><b>OPEN PLAYER ↘</b></a>
          <a href="/shop/beats/licenses"><span>02</span><small>TERMS &amp; RIGHTS</small><h2>License Archive</h2><p>Compare Basic, Premium, Unlimited and Exclusive license rights before purchasing.</p><b>READ LICENSES ↗</b></a>
          <a href="/shop/beats/faq"><span>03</span><small>SUPPORT DOSSIER</small><h2>Beat Shop FAQ</h2><p>Answers covering streams, upgrades, vocal tags, royalty negotiations and exclusives.</p><b>OPEN THE FAQ ↗</b></a>
        </div>
      </section>
      <section id="beat-catalog" className="portal-section portal-section--deep">
        <SectionLabel index="02">RYDAGANGPROD LIVE CATALOG</SectionLabel>
        <div className="portal-heading-row"><div><p className="kicker">PRODUCED BY RYDAGANGPROD</p><h2>Sound from<br />beneath the Castle.</h2></div><p>The BeatStars player is the live inventory and transaction engine. Preview tracks and select a license directly inside the Harbor interface.</p></div>
        <ProviderFrame src="https://player.beatstars.com/?storeId=145076" title="RydaGangProd BeatStars catalog" tall />
      </section>
      <section className="portal-section">
        <SectionLabel index="03">BEAT BUNDLES</SectionLabel>
        <article className="bundle-card"><div><small>ARCHIVE STATUS // IN DEVELOPMENT</small><h2>RGP Underground Beat Pack <em>Vol. 1</em></h2><p>A curated bundle designed to give artists a diverse selection of instrumentals and the strongest possible value. The first volume is being prepared for release.</p></div><span>COMING<br />SOON</span></article>
      </section>
    </PortalShell>
  );
}

