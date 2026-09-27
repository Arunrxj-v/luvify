import type { SectionProps } from "@luvify/shared";
import { ButtonLink, Link, cx, safeImageUrl } from "../primitives";
import { useRenderContext } from "../context";

/** Home-page nav item highlighting for the published snapshot. */
function isActive(currentPath: string, target: string): boolean {
  if (target === currentPath) return true;
  if (target === "/") return currentPath === "/";
  return currentPath.startsWith(target.replace(/\/$/, ""));
}

export function NavbarSection(props: SectionProps<"Navbar">) {
  const context = useRenderContext();
  const links = props.links.length > 0 ? props.links : context.navigation;
  const logoImage = safeImageUrl(props.logoImageUrl);

  return (
    <nav className="lv-nav" data-style={props.style} data-sticky={props.sticky ? "true" : "false"}>
      <div className="lv-container lv-nav__inner">
        <Link href="/" className="lv-nav__brand">
          {logoImage ? <img src={logoImage} alt={props.logoText || context.siteName} /> : null}
          <span>{props.logoText || context.siteName}</span>
        </Link>

        <ul className="lv-nav__links">
          {links.map((link) => (
            <li key={`${link.label}-${link.path}`}>
              <Link
                href={link.path || "/"}
                label={link.label}
                className={isActive(context.currentPath, link.path) ? "lv-nav__link--active" : undefined}
              />
            </li>
          ))}
        </ul>

        <div className="lv-nav__actions">
          {props.cta?.label ? <ButtonLink href={props.cta.path || "/contact"} label={props.cta.label} variant="primary" /> : null}
          <button type="button" className="lv-nav__toggle" data-lv-nav-toggle="" aria-expanded="false">
            Menu
          </button>
        </div>
      </div>
    </nav>
  );
}

export function FooterSection(props: SectionProps<"Footer">) {
  const context = useRenderContext();
  const year = new Date().getFullYear();
  const columns = props.columns ?? [];
  const socials = props.socials ?? [];
  const email = props.contactEmail || context.contact.email;
  const phone = props.contactPhone || context.contact.phone;
  const address = props.address || context.contact.address;

  return (
    <footer className="lv-footer">
      <div className="lv-container">
        <div className="lv-footer__grid">
          <div>
            <p className="lv-footer__brand">{props.logoText || context.siteName}</p>
            {props.tagline ? <p style={{ opacity: 0.85, maxWidth: "34ch" }}>{props.tagline}</p> : null}
            <ul>
              {email ? (
                <li>
                  <Link href={`mailto:${email}`} label={email} />
                </li>
              ) : null}
              {phone ? (
                <li>
                  <Link href={`tel:${phone.replace(/\s+/g, "")}`} label={phone} />
                </li>
              ) : null}
              {address ? <li>{address}</li> : null}
            </ul>
          </div>

          {columns.map((column) => (
            <div key={column.title || "links"}>
              {column.title ? <p className="lv-footer__title">{column.title}</p> : null}
              <ul>
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}-${link.path}`}>
                    <Link href={link.path || "/"} label={link.label} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {socials.length > 0 ? (
            <div>
              <p className="lv-footer__title">Follow</p>
              <ul>
                {socials.map((social) => (
                  <li key={`${social.label}-${social.path}`}>
                    <Link href={social.path} label={social.label} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {props.newsletter ? (
          <div className={cx("lv-card", "lv-newsletter")} style={{ marginTop: "2rem" }}>
            <p style={{ margin: "0 0 .75rem", fontWeight: 600 }}>{props.newsletterNote || "Get occasional updates"}</p>
            <form className="lv-form" action={email ? `mailto:${email}` : undefined} method="post" encType="text/plain">
              <div className="lv-field lv-field--wide">
                <label htmlFor="lv-newsletter-email">Email address</label>
                <input id="lv-newsletter-email" name="email" type="email" placeholder="you@example.com" required />
              </div>
              <div className="lv-field lv-field--wide">
                <button type="submit" className="lv-btn lv-btn--primary">
                  Subscribe
                </button>
              </div>
            </form>
            <p className="lv-form__note">
              This static site hands the address to your mail client - connect a provider (Mailchimp, Buttondown…) to automate it.
            </p>
          </div>
        ) : null}

        <div className="lv-footer__bottom">
          <span>{props.copyright || `© ${year} ${context.siteName}`}</span>
          <span>
            {(props.legalLinks ?? []).map((link) => (
              <Link key={`${link.label}-${link.path}`} href={link.path} label={link.label} className="lv-footer__legal" />
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
