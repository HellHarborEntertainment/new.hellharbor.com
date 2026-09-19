"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { eventStatus, houses } from "./content/brand-registry";

const divisions = [
  { numeral: "I", title: "Talent & Booking", copy: "Management and booking support for artists, actors, voices, and projects within the Hell Harbor family." },
  { numeral: "II", title: "Music & Records", copy: "Recording, artist development and distribution through the rebellious bloodline that began with Dab & Stab Records." },
  { numeral: "III", title: "Film & Television", copy: "Active film, television, voice, and visual-storytelling development through Mystic Mirage Motion." },
  { numeral: "IV", title: "Games & Software", copy: "Active interactive systems, roleplay experiences, private servers, and software work through Infamous Development Studios." },
  { numeral: "V", title: "Publishing · In Development", copy: "The planned home for books, comics, production documents, and original written worlds." },
  { numeral: "VI", title: "Distribution", copy: "Release and campaign support for projects produced within Hell Harbor Entertainment and Dab & Stab Records." },
  { numeral: "VII", title: "Live Entertainment", copy: "Confirmed appearances, event production, and the active Badass Backyard Wrestling sports-entertainment project." },
];

const shopDepartments = [
  {
    mark: "01",
    title: "The Main Exchange",
    subtitle: "Official Ko-Fi Shop",
    copy: "Artist features, cameos and digital media distributed by Dab & Stab Records, Mystic Mirage Motion and Hell Harbor Entertainment.",
    href: "/shop",
    action: "ENTER THE MAIN EXCHANGE",
  },
  {
    mark: "02",
    title: "Official Relics",
    subtitle: "Hell Harbor Merchandise",
    copy: "T-shirts, hoodies, stickers, mugs and more through the official customizable Hell Harbor SpreadShop.",
    href: "/shop/merch",
    action: "BROWSE THE MERCH VAULT",
  },
  {
    mark: "03",
    title: "Summon a Voice",
    subtitle: "Artist Features",
    copy: "Request a verse, hook or collaboration from currently available Dab & Stab Records talent.",
    href: "/shop/features",
    action: "VIEW ARTIST FEATURES",
  },
  {
    mark: "04",
    title: "The Beat Forge",
    subtitle: "RydaGangProd Beat Shop",
    copy: "Official beats, licenses and beat bundles produced by RydaGangProd and endorsed by Hell Harbor Entertainment.",
    href: "/shop/beats",
    action: "ENTER THE BEAT SHOP",
  },
];

export default function Home() {
  const [entered, setEntered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 40);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <main className={entered ? "site-entered" : ""}>
      <header className={`site-header ${scrolled ? "site-header--scrolled" : ""}`}>
        <a className="brand" href="#top" onClick={closeMenu} aria-label="Hell Harbor Entertainment home">
          <Image src="/media/hhe-logo-new.png" alt="" width={64} height={64} />
          <span><b>HELL HARBOR</b><small>ENTERTAINMENT</small></span>
        </a>
        <button className="menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="main-navigation">
          <span /> <span /> <span /><em>{menuOpen ? "CLOSE" : "MENU"}</em>
        </button>
        <nav id="main-navigation" className={menuOpen ? "nav-open" : ""} aria-label="Main navigation">
          <a href="#origin" onClick={closeMenu}>Origin</a>
          <a href="#empire" onClick={closeMenu}>The Empire</a>
          <a href="#houses" onClick={closeMenu}>The Houses</a>
          <a href="/shop" onClick={closeMenu}>Shop</a>
          <a href="/tickets" onClick={closeMenu}>Tickets</a>
          <a href="#chronicle" onClick={closeMenu}>Chronicle</a>
          <a className="nav-cta" href="#contact" onClick={closeMenu}>Cross the Threshold</a>
        </nav>
      </header>

      <section id="top" className="hero">
        <div className="hero-image" aria-hidden="true" />
        <div className="ash" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} />)}</div>
        <div className="gate gate--left" aria-hidden="true"><span /></div>
        <div className="gate gate--right" aria-hidden="true"><span /></div>
        <div className="hero-vignette" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow"><span /> The Castle of Hell Harbor · Est. 2018 <span /></p>
          <Image className="hero-sigil" src="/media/hhe-logo-new.png" alt="Hell Harbor Entertainment" width={240} height={240} priority />
          <h1><span>Welcome to</span>Hell Harbor</h1>
          <p className="hero-lede">Where strange worlds are forged, rebellious voices are amplified, and every production carries a little fire out into the dark.</p>
          <div className="hero-actions">
            <button type="button" onClick={() => setEntered(true)}>{entered ? "THE GATES STAND OPEN" : "ENTER THE EMPIRE"}<i>↘</i></button>
            <a href="#origin">DISCOVER OUR ORIGIN <i>↓</i></a>
          </div>
        </div>
        <div className="hero-rail"><span>MONTESANO · GRAYS HARBOR COUNTY, WASHINGTON</span><span>THE COURTHOUSE ASCENDS</span></div>
        <div className="scroll-mark" aria-hidden="true"><i /><span>DESCEND</span></div>
      </section>

      <section id="origin" className="origin section-shell">
        <div className="section-index"><span>01</span><b>THE ORIGIN</b></div>
        <div className="origin-grid">
          <div className="origin-heading">
            <p className="kicker">THE EMPIRE BEFORE THE EMPIRE</p>
            <h2>It began with<br /><em>a blade and a beat.</em></h2>
          </div>
          <div className="origin-story">
            <p className="lead">Hell Harbor Entertainment began in 2018 as the independent record label Dab &amp; Stab Records.</p>
            <p>What started as a home for underground sound refused to stay in one medium. By 2020, the walls expanded into film, television, games, publishing, live entertainment, distribution and talent management. The label became an empire, but the original instinct never changed.</p>
            <blockquote>Build the strange thing. Protect the voice behind it. Let the work speak loud enough to wake the dead.</blockquote>
          </div>
        </div>
        <div className="timeline" aria-label="Hell Harbor history">
          <article><span>2018</span><b>THE SPARK</b><p>Dab &amp; Stab Records opens the first door.</p></article>
          <article><span>2020</span><b>THE ASCENSION</b><p>Hell Harbor Entertainment rises as the parent empire.</p></article>
          <article><span>NOW</span><b>THE EXPANSION</b><p>Independent worlds grow across every form of entertainment.</p></article>
        </div>
      </section>

      <section id="empire" className="empire section-shell">
        <div className="section-index"><span>02</span><b>THE EMPIRE</b></div>
        <div className="empire-heading">
          <div><p className="kicker">SEVEN GATES. ONE BANNER.</p><h2>What we summon<br />into the world.</h2></div>
          <p>Hell Harbor connects active production work with longer-term development areas. Availability and scope are confirmed through the appropriate project or inquiry desk.</p>
        </div>
        <div className="division-grid">
          {divisions.map((division) => (
            <article className="division-card" key={division.numeral}>
              <div className="division-top"><span>{division.numeral}</span><i>✦</i></div>
              <h3>{division.title}</h3>
              <p>{division.copy}</p>
              <b>ENTER DIVISION <span>↗</span></b>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto">
        <div className="manifesto-bg" aria-hidden="true" />
        <div className="manifesto-sigil" aria-hidden="true">HHE</div>
        <p>OUR CREED</p>
        <h2>Not content for everyone.<br /><em>Worlds for the ones who get it.</em></h2>
        <div><span>UNFILTERED</span><span>INDEPENDENT</span><span>UNFORGETTABLE</span></div>
      </section>

      <section id="houses" className="houses section-shell">
        <div className="section-index"><span>03</span><b>THE HOUSES</b></div>
        <div className="houses-heading"><p className="kicker">THE BLOODLINE</p><h2>Four houses.<br />Countless worlds.</h2></div>
        <div className="house-list">
          {houses.map((house, index) => (
            <a className="house-row" href={house.href} target={house.href.startsWith("http") ? "_blank" : undefined} rel={house.href.startsWith("http") ? "noreferrer" : undefined} key={house.name}>
              <span className="house-number">0{index + 1}</span>
              <span className="house-mark"><b>{house.mark}</b></span>
              <span className="house-name"><small>{house.type} · {house.status}</small><b>{house.name}</b></span>
              <p>{house.copy}</p>
              <i>↗</i>
            </a>
          ))}
        </div>
      </section>

      <section id="shop" className="shop section-shell">
        <div className="section-index"><span>04</span><b>THE SHOP</b></div>
        <div className="shop-heading">
          <div>
            <p className="kicker">THE INFERNAL EXCHANGE</p>
            <h2>Take something<br /><em>back from Hell.</em></h2>
          </div>
          <p>The original Hell Harbor marketplace returns as one connected exchange for official goods, digital releases, licensed performances and production-ready beats.</p>
        </div>
        <div className="shop-grid">
          {shopDepartments.map((department) => (
            <article className="shop-card" key={department.mark}>
              <div className="shop-card-top"><span>{department.mark}</span><i>HHE // EXCHANGE</i></div>
              <small>{department.subtitle}</small>
              <h3>{department.title}</h3>
              <p>{department.copy}</p>
              <a href={department.href}>{department.action}<span>↗</span></a>
            </article>
          ))}
        </div>
        <div className="shop-auxiliary">
          <span>BEAT SHOP RESOURCES</span>
          <a href="/shop/beats/licenses">LICENSE INFORMATION ↗</a>
          <a href="/shop/beats/faq">BEAT SHOP FAQ ↗</a>
          <a href="/shop/beats">RYDAGANGPROD CATALOG ↗</a>
        </div>
      </section>

      <section id="tickets" className="tickets section-shell">
        <div className="section-index"><span>05</span><b>TOURING &amp; TICKETS</b></div>
        <div className="tickets-intro">
          <div>
            <p className="kicker">THE PROCESSION LEAVES THE HARBOR</p>
            <h2>Meet us<br />at the gates.</h2>
          </div>
          <div>
            <p>Confirmed Hell Harbor Entertainment and Dab &amp; Stab Records appearances are published through one event registry.</p>
            <p>When the registry is empty, no public event or ticket inventory is currently announced.</p>
          </div>
        </div>
        <div className="ticket-types">
          <article>
            <span>00</span>
            <h3>{eventStatus.emptyTitle}</h3>
            <p>{eventStatus.emptyCopy}</p>
          </article>
        </div>
        <div className="schedule-shell">
          <div className="schedule-heading">
            <div><small>LIVE EVENT REGISTRY</small><h3>Current Show Schedule</h3></div>
            <a href="/tickets">ENTER THE EVENT REGISTRY <span>↗</span></a>
          </div>
          <div className="ticket-frame">
            <iframe src="https://www.ticketleap.events/events/hellharbor" title="Hell Harbor Entertainment events and tickets" loading="lazy" />
          </div>
          <div className="schedule-footer">
            <p>Only confirmed public dates and event-specific ticket options are listed in the registry.</p>
            <a href="/contact#booking">CONTACT BOOKING <span>↗</span></a>
          </div>
        </div>
      </section>

      <section id="chronicle" className="chronicle section-shell">
        <div className="section-index"><span>06</span><b>THE CHRONICLE</b></div>
        <div className="chronicle-grid">
          <div className="chronicle-copy">
            <p className="kicker">FROM THE BLACK ARCHIVE</p>
            <h2>The Harbor<br />remembers.</h2>
            <p>Every label, studio, production and persona leaves a mark on the same map. Open the record to see how the mythology binds the business together.</p>
            <button type="button" onClick={() => setChronicleOpen(!chronicleOpen)} aria-expanded={chronicleOpen}>
              <span className="seal">HHE</span>{chronicleOpen ? "SEAL THE CHRONICLE" : "BREAK THE SEAL"}<i>{chronicleOpen ? "×" : "+"}</i>
            </button>
          </div>
          <div className={`archive-card ${chronicleOpen ? "archive-card--open" : ""}`}>
            <div className="archive-cover"><span>ARCHIVE No. 18</span><b>THE HELL HARBOR<br />CHRONICLE</b><small>AUTHORIZED EYES ONLY</small></div>
            <div className="archive-page">
              <span>FILE // HHE-2018-∞</span>
              <h3>The universe is the infrastructure.</h3>
              <p>JesterTheRyda, RydaGang, Dab &amp; Stab Records and Hell Harbor Entertainment are not disconnected brands. They are entrances into one evolving body of music, characters, stories and productions.</p>
              <p>The public sees releases. Behind the gates, every release adds another room, another artifact and another thread to the mythology.</p>
              <b>STATUS: STILL EXPANDING</b>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="contact">
        <div className="contact-rule"><span>THE GATES ARE OPEN</span></div>
        <div className="contact-inner">
          <Image src="/media/hhe-logo-main.png" alt="" width={220} height={220} />
          <p className="kicker">BUSINESS · BOOKING · COLLABORATION</p>
          <h2>Bring us something<br /><em>worth raising hell over.</em></h2>
          <p>Pitch a project, book talent, discuss distribution or step inside the virtual office to meet the people behind the empire.</p>
          <div className="contact-actions">
            <a className="primary-action" href="/contact">CONTACT THE HARBOR <span>↗</span></a>
            <a href="https://hellharbor.com/discord" target="_blank" rel="noreferrer">ENTER THE DISCORD <span>↗</span></a>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-brand"><Image src="/media/hhe-logo-new.png" alt="" width={64} height={64} /><span><b>HELL HARBOR</b><small>ENTERTAINMENT</small></span></div>
        <div className="footer-links">
          <a href="#origin">Origin</a><a href="#empire">Empire</a><a href="#houses">Houses</a>
          <a href="/shop">Shop</a><a href="/tickets">Tickets</a><a href="/contact">Contact</a>
        </div>
        <p>© 2018–2026 HELL HARBOR ENTERTAINMENT<br />ALL RIGHTS RESERVED</p>
      </footer>
    </main>
  );
}
