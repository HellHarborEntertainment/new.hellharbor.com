import type { Metadata } from "next";
import { PortalShell, SectionLabel } from "../components/PortalShell";
import { ProviderFrame } from "../components/ProviderFrame";
import { eventStatus } from "../content/brand-registry";

export const metadata: Metadata = {
  title: "Touring & Tickets | Hell Harbor Entertainment",
  description: "Upcoming Hell Harbor Entertainment and Dab & Stab Records events, tickets, tour passes and VIP upgrades.",
};

export default function TicketsPage() {
  return (
    <PortalShell code="05" eyebrow="THE EVENT REGISTRY" title={<>Meet us<br /><em>at the gates.</em></>} intro="Confirmed Hell Harbor Entertainment and Dab & Stab Records appearances are listed here when public ticketing is available." actions={<><a className="portal-primary" href="#schedule">VIEW THE SCHEDULE <span>↓</span></a><a href="/contact#booking">BOOK AN EVENT <span>↗</span></a></>}>
      <section className="portal-section">
        <SectionLabel index="01">CURRENT STATUS</SectionLabel>
        <div className="ticket-page-grid"><article><span>00</span><small>PUBLIC EVENT BOARD</small><h2>{eventStatus.emptyTitle}</h2><p>{eventStatus.emptyCopy}</p><ul><li>Confirmed dates only</li><li>Event-specific ticket details</li><li>Provider-secured checkout when available</li></ul></article></div>
      </section>
      <section id="schedule" className="portal-section portal-section--deep">
        <SectionLabel index="02">CURRENT SHOW SCHEDULE</SectionLabel>
        <div className="portal-heading-row"><div><p className="kicker">POWERED BY TICKETLEAP</p><h2>The live<br />event registry.</h2></div><p>Browse upcoming appearances and complete ticket purchases through the embedded Ticketleap registry. When no public dates are listed, the Harbor is between announced events.</p></div>
        <ProviderFrame src="https://www.ticketleap.events/events/hellharbor" title="Hell Harbor Entertainment Ticketleap event schedule" tall />
        <div className="empty-registry-note"><span>NO LISTING VISIBLE?</span><p>{eventStatus.emptyCopy}</p><a href="/contact#booking">CONTACT BOOKING <i>↗</i></a></div>
      </section>
      <section className="portal-callout"><span>VENUES · PROMOTERS · FESTIVALS</span><h2>Bring a Hell Harbor event to your city.</h2><a href="mailto:touring@HellHarbor.com">CONTACT THE TOURING DEPARTMENT <i>↗</i></a></section>
    </PortalShell>
  );
}
