import type { Metadata } from "next";
import { PortalShell, SectionLabel } from "../components/PortalShell";

export const metadata: Metadata = {
  title: "The Infernal Exchange | Hell Harbor Entertainment",
  description: "The official Hell Harbor Entertainment shop for digital media, merchandise, artist features, beats and licenses.",
};

const departments = [
  { code: "I", title: "Digital Offerings", copy: "Downloads, releases, cameos and special offerings distributed through the Harbor's Ko-Fi inventory.", href: "#live-catalog", action: "VIEW LIVE CATALOG" },
  { code: "II", title: "Official Relics", copy: "Shirts, hoodies, stickers, mugs and other physical goods carrying the marks of Hell Harbor.", href: "/shop/merch", action: "ENTER THE MERCH VAULT" },
  { code: "III", title: "Artist Features", copy: "Verses, hooks and collaborative performances from artists connected to Dab & Stab Records.", href: "/shop/features", action: "OPEN THE FEATURE DESK" },
  { code: "IV", title: "The Beat Forge", copy: "Production-ready instrumentals, BeatStars inventory, licensing information and producer bundles.", href: "/shop/beats", action: "ENTER THE BEAT FORGE" },
];

export default function ShopPage() {
  return (
    <PortalShell code="04" eyebrow="THE INFERNAL EXCHANGE" title={<>Take something<br /><em>back from Hell.</em></>} intro="The complete Hell Harbor marketplace now lives behind one gate. Browse every department without leaving the visual world of the Castle; outside services operate as the machinery behind the walls." actions={<><a className="portal-primary" href="#live-catalog">BROWSE THE LIVE CATALOG <span>↓</span></a><a href="/shop/merch">PHYSICAL MERCH <span>↗</span></a></>}>
      <section className="portal-section">
        <SectionLabel index="01">EXCHANGE DIRECTORY</SectionLabel>
        <div className="department-grid">
          {departments.map((item) => (
            <a className="department-card" href={item.href} key={item.code}>
              <span>{item.code}</span><small>HHE // EXCHANGE WING</small><h2>{item.title}</h2><p>{item.copy}</p><b>{item.action} <i>↗</i></b>
            </a>
          ))}
        </div>
      </section>
      <section id="live-catalog" className="portal-section portal-section--deep">
        <SectionLabel index="02">LIVE DIGITAL CATALOG</SectionLabel>
        <div className="portal-heading-row"><div><p className="kicker">POWERED BY KO-FI</p><h2>The Main<br />Exchange.</h2></div><p>Ko-Fi supplies the secure catalog and checkout system. It is embedded here as part of the Hell Harbor experience, while payment and fulfillment remain handled by the provider.</p></div>
        <div className="native-catalog">
          <article><span>DIGITAL MEDIA</span><h3>Downloads &amp; Releases</h3><p>Music, motion media and downloadable offerings distributed across the Hell Harbor houses.</p><a href="https://ko-fi.com/hellharbor/shop" target="_blank" rel="noreferrer">SECURE PROVIDER CHECKOUT <i>↗</i></a></article>
          <article><span>CUSTOM OFFERINGS</span><h3>Cameos &amp; Requests</h3><p>Limited custom offerings and commission-style products when they are available in the live Ko-Fi inventory.</p><a href="https://ko-fi.com/hellharbor/shop" target="_blank" rel="noreferrer">VIEW CURRENT AVAILABILITY <i>↗</i></a></article>
          <article><span>COLLABORATION</span><h3>Artist Feature Licenses</h3><p>Read the complete process and rights, choose an artist, then enter the secure transaction layer.</p><a href="/shop/features">ENTER THE FEATURE DESK <i>↗</i></a></article>
          <article><span>PATRONAGE</span><h3>Support the Harbor</h3><p>Contribute directly to independent music, film, software, publishing and live production.</p><a href="https://ko-fi.com/hellharbor" target="_blank" rel="noreferrer">OPEN THE SUPPORT GATE <i>↗</i></a></article>
        </div>
        <p className="provider-boundary"><b>WHY CHECKOUT OPENS SECURELY</b> Ko-Fi protects its payment pages from being framed inside other websites. The complete shopping context remains here; only the encrypted transaction step opens through the provider.</p>
      </section>
    </PortalShell>
  );
}
