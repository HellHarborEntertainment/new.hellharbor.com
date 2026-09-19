import type { Metadata } from "next";
import { PortalShell, SectionLabel } from "../../../components/PortalShell";

export const metadata: Metadata = {
  title: "Beat Shop FAQ | Hell Harbor Entertainment",
  description: "Answers about Hell Harbor beat licenses, stream limits, upgrades, vocal tags, royalties and exclusive instrumentals.",
};

const questions = [
  { q: "What are the differences between the available beat licenses?", a: <>The shop offers Basic, Premium, Unlimited and Exclusive licenses. Each tier changes commercial distribution limits, royalty splits and synchronization rights. Review the complete <a href="/shop/beats/licenses">License Archive</a> before purchasing.</> },
  { q: "What happens if I stream or sell more than my lease allows?", a: <>You can upgrade your license at a discounted rate. Contact <a href="mailto:support@HellHarbor.com">support@HellHarbor.com</a> before exceeding the original terms.</> },
  { q: "Are vocal tags removed when I purchase a beat?", a: <>Yes. All tags are removed except for one lower-volume producer tag in the introduction. Removal of that final tag may be available for Premium leases or higher; contact the Beat Forge team.</> },
  { q: "How do I negotiate changes to royalty splits?", a: <>Email <a href="mailto:support@HellHarbor.com">support@HellHarbor.com</a>. The Harbor team will review the project and connect you with the appropriate producer or licensing representative.</> },
  { q: "How do I obtain an Exclusive License?", a: <>Contact <a href="mailto:support@HellHarbor.com">support@HellHarbor.com</a>. The team will connect you with the producers to discuss the available beat or commission a customized exclusive instrumental for your project.</> },
];

export default function FaqPage() {
  return (
    <PortalShell code="04.4.F" eyebrow="THE SUPPORT DOSSIER" title={<>Questions enter.<br /><em>Answers return.</em></>} intro="Everything artists most often need to know before licensing an instrumental through the Hell Harbor Beat Forge." actions={<><a className="portal-primary" href="#questions">OPEN THE DOSSIER <span>↓</span></a><a href="/shop/beats/licenses">LICENSE ARCHIVE <span>↗</span></a></>}>
      <section id="questions" className="portal-section portal-section--deep">
        <SectionLabel index="01">FREQUENTLY ASKED QUESTIONS</SectionLabel>
        <div className="faq-list">{questions.map((item, index) => <details key={item.q} open={index === 0}><summary><span>0{index + 1}</span><b>{item.q}</b><i>+</i></summary><div>{item.a}</div></details>)}</div>
        <div className="support-strip"><div><small>QUESTION NOT IN THE ARCHIVE?</small><h2>Contact the Beat Forge.</h2></div><a href="mailto:support@HellHarbor.com">support@HellHarbor.com <span>↗</span></a></div>
      </section>
    </PortalShell>
  );
}

