import type { ReactNode } from "react";
import { PortalFooter, PortalHeader } from "./PortalChrome";

type PortalShellProps = {
  code: string;
  eyebrow: string;
  title: ReactNode;
  intro: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function PortalShell({ code, eyebrow, title, intro, children, actions }: PortalShellProps) {
  return (
    <main className="portal-site">
      <PortalHeader />
      <section className="portal-hero">
        <div className="portal-hero-image" aria-hidden="true" />
        <div className="portal-hero-grid" aria-hidden="true" />
        <div className="portal-hero-copy">
          <p className="portal-code">GATE {code} · AUTHORIZED PUBLIC ACCESS</p>
          <p className="kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          {actions && <div className="portal-actions">{actions}</div>}
        </div>
        <div className="portal-status"><span>CASTLE NETWORK</span><b>ONLINE</b></div>
      </section>
      {children}
      <PortalFooter />
    </main>
  );
}

export function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return <div className="portal-section-label"><span>{index}</span><b>{children}</b></div>;
}
