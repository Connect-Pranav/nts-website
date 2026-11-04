import { InstagramLogo, LinkedinLogo, YoutubeLogo } from '@phosphor-icons/react';
import { NAV, SITE } from '../config';
import { onLinkClick } from '../lib/router';
import './Footer.css';

export function Footer() {
  return (
    <footer className="ftr">
      <div className="ftr__inner container">
        <div className="ftr__brand">
          <img src="/logo.jpg" alt="" width={44} height={44} />
          <div>
            <p className="ftr__name">{SITE.name}</p>
            <p className="ftr__tag">{SITE.tagline}</p>
          </div>
        </div>
        <nav aria-label="Footer">
          <ul className="ftr__links">
            {NAV.slice(1).map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={onLinkClick}>
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <a href="/contact" onClick={onLinkClick}>
                Contact
              </a>
            </li>
          </ul>
        </nav>
        <ul className="ftr__social" aria-label="Social channels">
          <li>
            <a href={SITE.social.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube: @NikhilsTechStudio">
              <YoutubeLogo size={22} />
            </a>
          </li>
          <li>
            <a href={SITE.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram: @nikhil_techstudio">
              <InstagramLogo size={22} />
            </a>
          </li>
          <li>
            <a href={SITE.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn: Nikhil Kumar">
              <LinkedinLogo size={22} />
            </a>
          </li>
        </ul>
      </div>
      <p className="ftr__copy container">© {new Date().getFullYear()} {SITE.name}. All rights reserved.</p>
    </footer>
  );
}
