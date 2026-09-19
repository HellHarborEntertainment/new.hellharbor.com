"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const navItems = [
  { href: "/", label: "Castle" },
  { href: "/shop", label: "Exchange" },
  { href: "/shop/merch", label: "Merch" },
  { href: "/shop/features", label: "Features" },
  { href: "/shop/beats", label: "Beats" },
  { href: "/tickets", label: "Tickets" },
];

export function PortalHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="portal-header">
      <Link className="portal-brand" href="/" aria-label="Hell Harbor Entertainment home">
        <Image src="/media/hhe-logo-new.png" alt="" width={64} height={64} />
        <span><b>HELL HARBOR</b><small>ENTERTAINMENT</small></span>
      </Link>
      <button className="portal-menu" type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="portal-navigation">
        {open ? "CLOSE" : "DIRECTORY"}<i aria-hidden="true">{open ? "×" : "☰"}</i>
      </button>
      <nav id="portal-navigation" className={open ? "portal-nav portal-nav--open" : "portal-nav"} aria-label="Hell Harbor directory">
        {navItems.map((item) => <Link href={item.href} key={item.href} onClick={() => setOpen(false)}>{item.label}</Link>)}
        <Link className="portal-contact" href="/contact" onClick={() => setOpen(false)}>Contact the Harbor</Link>
      </nav>
    </header>
  );
}

export function PortalFooter() {
  return (
    <footer className="portal-footer">
      <div className="portal-footer-brand"><Image src="/media/hhe-logo-new.png" alt="" width={64} height={64} /><span><b>HELL HARBOR</b><small>ENTERTAINMENT</small></span></div>
      <div className="portal-footer-map">
        <Link href="/shop">Main Exchange</Link><Link href="/shop/merch">Merch Vault</Link><Link href="/shop/features">Artist Features</Link>
        <Link href="/shop/beats">Beat Forge</Link><Link href="/tickets">Event Registry</Link><Link href="/contact">Directory</Link>
      </div>
      <p>© 2018–2026 HELL HARBOR ENTERTAINMENT<br />MONTESANO · GRAYS HARBOR COUNTY, WASHINGTON</p>
    </footer>
  );
}
