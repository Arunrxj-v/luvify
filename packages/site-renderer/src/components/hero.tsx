import type { SectionProps } from "@luvify/shared";
import { ButtonLink, EmptyState, ImageFrame, SectionHeading, cx, safeImageUrl } from "../primitives";
import { useRenderContext } from "../context";

/**
 * Above-the-fold block. Every field comes from the validated `Hero` schema; the
 * optional background image is filtered through `safeImageUrl` and the copy is
 * rendered as text, so nothing here can inject markup or CSS.
 */
export function HeroSection(props: SectionProps<"Hero">) {
  const context = useRenderContext();
  const background = safeImageUrl(props.backgroundImageUrl);
  const hasActions = Boolean(props.primaryCta?.label || props.secondaryCta?.label);

  return (
    <section className="lv-hero" data-align={props.align} data-size={props.size}>
      {background ? (
        <div className="lv-hero__bg" aria-hidden="true">
          <img src={background} alt="" />
          <div className="lv-hero__overlay" style={{ opacity: props.overlayOpacity }} />
        </div>
      ) : null}

      <div className={cx("lv-container", "lv-hero__inner", !props.image && "lv-hero__inner--single")}>
        <div className="lv-hero__content">
          {props.eyebrow ? <span className="lv-eyebrow">{props.eyebrow}</span> : null}
          <h1>{props.title}</h1>
          {props.subtitle ? <p className="lv-lede">{props.subtitle}</p> : null}

          {hasActions ? (
            <div className="lv-row" style={{ marginTop: "1.75rem" }}>
              {props.primaryCta?.label ? (
                <ButtonLink href={props.primaryCta.path || "/contact"} label={props.primaryCta.label} variant="primary" />
              ) : null}
              {props.secondaryCta?.label ? (
                <ButtonLink
                  href={props.secondaryCta.path || "/contact"}
                  label={props.secondaryCta.label}
                  variant="outline"
                />
              ) : null}
            </div>
          ) : null}

          {props.trustLine ? <p className="lv-trust">{props.trustLine}</p> : null}

          {props.stats.length > 0 ? (
            <div className="lv-hero__stats">
              {props.stats.map((stat) => (
                <div key={`${stat.value}-${stat.label}`}>
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {props.image ? (
          <ImageFrame image={props.image} ratio="tall" fallbackLabel={context.siteName || props.title} />
        ) : null}
      </div>
    </section>
  );
}

export function FeaturesSection(props: SectionProps<"Features">) {
  return (
    <section className="lv-section lv-section--surface">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />
        {props.items.length === 0 ? (
          <EmptyState message="Add features from the Inspector panel to populate this section." />
        ) : (
          <div className="lv-grid" data-cols={props.columns}>
            {props.items.map((item) => (
              <article className="lv-card" key={`${item.title}-${item.description}`}>
                {item.icon ? (
                  <div className="lv-feature__icon" aria-hidden="true">
                    {item.icon.slice(0, 4)}
                  </div>
                ) : null}
                <h3>{item.title}</h3>
                {item.description ? <p className="lv-muted">{item.description}</p> : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
