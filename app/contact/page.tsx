import type { Metadata } from "next";
import { PortalShell, SectionLabel } from "../components/PortalShell";
import { publicContacts } from "../content/brand-registry";

export const metadata: Metadata = {
  title: "Castle Directory | Hell Harbor Entertainment",
  description: "Contact the business, booking, production, talent and support departments of Hell Harbor Entertainment.",
};

export default function ContactPage() {
  return (
    <PortalShell code="07" eyebrow="THE CASTLE DIRECTORY" title={<>Send word<br /><em>into the Harbor.</em></>} intro="A concise public directory for business, music, production, and support inquiries. Messages requiring another department are routed internally." actions={<><a className="portal-primary" href="#directory">OPEN THE DIRECTORY <span>↓</span></a><a href="mailto:support@HellHarbor.com">GENERAL SUPPORT <span>↗</span></a></>}>
      <section id="directory" className="portal-section">
        <SectionLabel index="01">DEPARTMENT DIRECTORY</SectionLabel>
        <div className="directory-grid">{publicContacts.map((department) => <article id={"id" in department ? department.id : undefined} key={department.code}><div><span>{department.code}</span><h2>{department.group}</h2></div><ul>{department.entries.map(([label, email]) => <li key={`${label}-${email}`}><small>{label}</small><a href={`mailto:${email}`}>{email}<i>↗</i></a></li>)}</ul></article>)}</div>
      </section>
      <section className="portal-section portal-section--deep">
        <SectionLabel index="02">ROUTING NOTE</SectionLabel>
        <div className="support-hours"><div><p className="kicker">NOT SURE WHERE TO START?</p><h2>Use the<br />general desk.</h2></div><p>For anything that does not fit a listed department, email <a href="mailto:contact@HellHarbor.com">contact@HellHarbor.com</a>. Your message will be routed to the appropriate project or brand.</p></div>
      </section>
    </PortalShell>
  );
}
