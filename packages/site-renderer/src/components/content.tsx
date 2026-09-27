import type { CSSProperties } from "react";
import type { SectionProps } from "@luvify/shared";
import { EmptyState, ImageFrame, SectionHeading, cx } from "../primitives";

export function AboutSection(props: SectionProps<"About">) {
  return (
    <section className="lv-section">
      <div className="lv-container">
        <div className={cx("lv-about", !props.image && "lv-about--no-media")} data-image={props.imagePosition}>
          <div>
            {props.eyebrow ? <span className="lv-eyebrow">{props.eyebrow}</span> : null}
            {props.title ? <h2>{props.title}</h2> : null}
            {props.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}

            {props.highlights.length > 0 ? (
              <ul className="lv-bullets">
                {props.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            ) : null}

            {props.stats.length > 0 ? (
              <div className="lv-about__stats">
                {props.stats.map((stat) => (
                  <div key={`${stat.value}-${stat.label}`}>
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {props.signature ? <p className="lv-signature">{props.signature}</p> : null}
          </div>

          {props.image ? (
            <div className="lv-about__media">
              <ImageFrame image={props.image} ratio="standard" fallbackLabel={props.title || "About"} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Services, menus and price lists - both layouts read the same validated item shape. */
export function ServicesSection(props: SectionProps<"Services">) {
  return (
    <section className="lv-section lv-section--surface">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />

        {props.items.length === 0 ? (
          <EmptyState message="Add a service or menu item to make this section useful." />
        ) : props.layout === "list" ? (
          <ul className="lv-list">
            {props.items.map((item) => (
              <li key={`${item.title}-${item.description}`}>
                <div className="lv-service">
                  <h3>{item.title}</h3>
                  {item.description ? <p className="lv-muted">{item.description}</p> : null}
                  {item.bulletPoints.length > 0 ? (
                    <ul className="lv-bullets">
                      {item.bulletPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="lv-service__meta">
                  {item.duration ? <span className="lv-muted">{item.duration}</span> : null}
                  {item.price ? <span className="lv-service__price">{item.price}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="lv-grid" data-cols={props.columns}>
            {props.items.map((item) => (
              <article className="lv-card lv-service" key={`${item.title}-${item.description}`}>
                <div className="lv-service__meta">
                  <h3>{item.title}</h3>
                  {item.price ? <span className="lv-service__price">{item.price}</span> : null}
                </div>
                {item.description ? <p className="lv-muted">{item.description}</p> : null}
                {item.duration ? <p className="lv-muted">{item.duration}</p> : null}
                {item.bulletPoints.length > 0 ? (
                  <ul className="lv-bullets">
                    {item.bulletPoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function GallerySection(props: SectionProps<"Gallery">) {
  return (
    <section className="lv-section">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />
        {props.images.length === 0 ? (
          <EmptyState message="Add images to the gallery from the Inspector panel." />
        ) : (
          <div className="lv-gallery" style={{ "--lv-cols": props.columns } as CSSProperties}>
            {props.images.map((image, index) => (
              <ImageFrame
                key={`${image.url}-${image.alt}-${index}`}
                image={image}
                ratio="standard"
                fallbackLabel={image.alt || `Gallery image ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Native `<details>` keeps the FAQ interactive without any JavaScript. */
export function FaqSection(props: SectionProps<"FAQ">) {
  return (
    <section className="lv-section lv-section--surface">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />
        {props.items.length === 0 ? (
          <EmptyState message="Add the questions your customers ask most." />
        ) : (
          <div className="lv-faq">
            {props.items.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                {item.answer ? <p>{item.answer}</p> : null}
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
