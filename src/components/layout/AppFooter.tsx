import React from 'react';

const SCOPRI = [
  { label: 'VoIP e UCC', href: 'https://hisolution.it/servizi-voip_ucc/' },
  { label: 'Networking', href: 'https://hisolution.it/networking/' },
  { label: 'Security', href: 'https://hisolution.it/hisecurity/' },
  { label: 'Information Technology', href: 'https://hisolution.it/blog/information-technology/' },
  { label: 'Business Case', href: 'https://hisolution.it/business-case-study/' },
  { label: 'Webinar', href: 'https://hisolution.it/webinar/' },
];

const UTILI = [
  { label: 'Hi-There', href: 'https://hisolution.it/blog/hi-there/' },
  { label: 'Lavora con noi', href: 'https://hisolution.it/lavora-con-noi/' },
  { label: 'Protezione dei dati personali', href: 'https://hisolution.it/protezione-dei-dati-personali/' },
];

export const AppFooter: React.FC = () => {
  return (
    <footer className="mt-8 border-t border-border bg-muted/30 text-sm">
      <div className="mx-auto max-w-7xl px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Anagrafica */}
        <div className="space-y-4 min-w-0">
          <div className="text-xs font-semibold tracking-wider text-foreground">HISOLUTION SRL</div>
          <p className="text-muted-foreground leading-relaxed">
            Via della Canapiglia 5,<br />
            56019 Vecchiano, PI, Italia<br />
            Tel: +39 050 6397401<br />
            Fax: +39 050 6390237<br />
            <a href="mailto:info@hisolution.it" className="font-semibold text-foreground hover:text-primary">
              info@hisolution.it
            </a>
          </p>
          <div className="pt-2">
            <div className="text-primary font-bold text-base leading-tight">
              HELP DESK<br />+39 050 6397469
            </div>
            <p className="text-muted-foreground mt-1">
              Dal lunedì al venerdì,<br />dalle 8:30 alle 18:30
            </p>
          </div>
        </div>

        {/* Scopri di più */}
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wider text-foreground mb-4">SCOPRI DI PIÙ</div>
          <ul className="space-y-3">
            {SCOPRI.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Link utili */}
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wider text-foreground mb-4">LINK UTILI</div>
          <ul className="space-y-3">
            {UTILI.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Hisolution Srl — P.IVA 02008500460</span>
          <a
            href="https://www.linkedin.com/company/hisolution/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary"
          >
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
