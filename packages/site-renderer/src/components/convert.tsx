import type { SectionProps } from "@luvify/shared";
import { ButtonLink, Link, SectionHeading, cx, safeMapEmbedUrl } from "../primitives";
import { useRenderContext } from "../context";

type ContactField = SectionProps<"Contact">["formFields"][number];

const FIELD_LABELS: Record<ContactField, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  message: "Message",
  date: "Preferred date",
};

const INPUT_TYPES: Partial<Record<ContactField, string>> = {
  email: "email",
  phone: "tel",
  date: "date",
};

/** Digits only, for a `wa.me` deep link. Anything else yields an empty string. */
function whatsappNumber(value: string): string {
  return value.replace(/[^\d]/g, "").replace(/^0+/, "");
}

/**
 * Contact details plus the enquiry form. The form is deliberately static: the
 * published snapshot is plain HTML, so the action is a `mailto:` link or a
 * WhatsApp deep link rather than a backend endpoint.
 */
export function ContactSection(props: SectionProps<"Contact">) {
  const context = useRenderContext();
  const email = props.email || context.contact.email;
  const phone = props.phone || context.contact.phone;
  const address = props.address || context.contact.address;
  const hours = props.hours || context.contact.hours;
  const map = safeMapEmbedUrl(props.mapEmbedUrl);

  const waNumber = whatsappNumber(props.whatsapp || context.contact.whatsapp);
  const waLink = waNumber ? `https://wa.me/${waNumber}` : "";
  const submitLabel = props.submitLabel || (props.formAction === "whatsapp" ? "Send on WhatsApp" : "Send message");

  let action: string | undefined;
  if (props.formAction === "mailto" && email) action = `mailto:${email}`;
  else if (props.formAction === "whatsapp" && waLink) action = waLink;

  return (
    <section className="lv-section lv-section--surface" id="contact">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />

        <div className="lv-contact">
          <div className="lv-stack">
            {email || phone || address || hours || waLink ? (
              <dl className="lv-contact__details">
                {email ? (
                  <>
                    <dt>Email</dt>
                    <dd>
                      <Link href={`mailto:${email}`} label={email} />
                    </dd>
                  </>
                ) : null}
                {phone ? (
                  <>
                    <dt>Phone</dt>
                    <dd>
                      <Link href={`tel:${phone.replace(/\s+/g, "")}`} label={phone} />
                    </dd>
                  </>
                ) : null}
                {waLink ? (
                  <>
                    <dt>WhatsApp</dt>
                    <dd>
                      <Link href={waLink} label={props.whatsapp || waNumber} />
                    </dd>
                  </>
                ) : null}
                {address ? (
                  <>
                    <dt>Address</dt>
                    <dd>{address}</dd>
                  </>
                ) : null}
                {hours ? (
                  <>
                    <dt>Hours</dt>
                    <dd>{hours}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
            {props.socials.length > 0 ? (
              <ul className="lv-chips" style={{ marginBottom: 0 }}>
                {props.socials.map((social) => (
                  <li key={`${social.label}-${social.path}`}>
                    <Link href={social.path} label={social.label} className="lv-chip" />
                  </li>
                ))}
              </ul>
            ) : null}
            {map ? (
              <iframe
                className="lv-map"
                src={map}
                title="Location map"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            ) : null}
          </div>
          {props.showForm && props.formAction !== "none" ? (
            <form className="lv-form lv-card" action={action} method="post" encType="text/plain">
              {props.formFields.map((field) => (
                <div key={field} className={cx("lv-field", field === "message" && "lv-field--wide")}>
                  <label htmlFor={`lv-${field}`}>{FIELD_LABELS[field]}</label>
                  {field === "message" ? (
                    <textarea id={`lv-${field}`} name={field} rows={5} required />
                  ) : (
                    <input
                      id={`lv-${field}`}
                      name={field}
                      type={INPUT_TYPES[field] ?? "text"}
                      required={field === "name" || field === "email"}
                    />
                  )}
                </div>
              ))}
              <div className="lv-field lv-field--wide">
                <button type="submit" className="lv-btn lv-btn--primary">
                  {submitLabel}
                </button>
                {props.successMessage ? <p className="lv-form__note">{props.successMessage}</p> : null}
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function CtaSection(props: SectionProps<"CTA">) {
  return (
    <section className="lv-section">
      <div className="lv-container">
        <div className="lv-cta" data-variant={props.variant}>
          {props.eyebrow ? <span className="lv-eyebrow">{props.eyebrow}</span> : null}
          <h2>{props.title}</h2>
          {props.body ? <p>{props.body}</p> : null}
          <div className="lv-row" style={{ marginTop: "1.5rem" }}>
            {props.button?.label ? (
              <ButtonLink href={props.button.path || "/contact"} label={props.button.label} variant="accent" />
            ) : null}
            {props.secondaryButton?.label ? (
              <ButtonLink
                href={props.secondaryButton.path || "/contact"}
                label={props.secondaryButton.label}
                variant="outline"
              />
            ) : null}
          </div>
          {props.note ? (
            <p className="lv-form__note" style={{ marginTop: "1rem" }}>
              {props.note}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
