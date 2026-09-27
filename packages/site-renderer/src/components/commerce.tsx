import type { ProductEntry, SectionProps } from "@luvify/shared";
import {
  ButtonLink,
  EmptyState,
  ImageFrame,
  SectionHeading,
  cx,
  priceLabel,
  safeImageUrl,
} from "../primitives";

function ProductCard({ product, showCategory }: { product: ProductEntry; showCategory: boolean }) {
  const image = safeImageUrl(product.imageUrl);
  const price = priceLabel(product.priceCents, product.currency);

  return (
    <article className="lv-card lv-card--flush lv-product">
      {image ? <ImageFrame image={{ url: image, alt: product.name }} ratio="wide" fallbackLabel={product.name} /> : null}
      <div className="lv-product__body">
        <div className="lv-row" style={{ justifyContent: "space-between" }}>
          {showCategory && product.category ? <span className="lv-product__category">{product.category}</span> : <span />}
          {product.badge ? <span className="lv-badge">{product.badge}</span> : null}
        </div>
        <h3>{product.name}</h3>
        {product.description ? <p className="lv-muted">{product.description}</p> : null}
        <div className="lv-row" style={{ justifyContent: "space-between" }}>
          <span className="lv-product__price">{price}</span>
          {product.href ? <ButtonLink href={product.href} label="View" variant="ghost" /> : null}
        </div>
      </div>
    </article>
  );
}

export function ProductsSection(props: SectionProps<"Products">) {
  return (
    <section className="lv-section">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />
        {props.items.length === 0 ? (
          <EmptyState message="Add products from the Inspector to showcase what you sell." />
        ) : (
          <>
            <div className="lv-grid" data-cols={props.columns}>
              {props.items.map((product) => (
                <ProductCard key={product.id || product.name} product={product} showCategory={props.columns < 4} />
              ))}
            </div>
            {props.cta?.label ? (
              <div className="lv-row" style={{ marginTop: "2rem" }}>
                <ButtonLink href={props.cta.path || "/contact"} label={props.cta.label} variant="primary" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

export function ProductGridSection(props: SectionProps<"ProductGrid">) {
  return (
    <section className="lv-section lv-section--surface">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />
        {props.items.length === 0 ? (
          <EmptyState message="Add products to build your catalogue." />
        ) : (
          <>
            {props.categories.length > 0 ? (
              <div className="lv-chips">
                <span className={cx("lv-chip", "lv-chip--active")}>All</span>
                {props.categories.map((category) => (
                  <span className="lv-chip" key={category}>
                    {category}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="lv-grid" data-cols={props.columns}>
              {props.items.map((product) => (
                <ProductCard key={product.id || product.name} product={product} showCategory={false} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function ProductCardSection(props: SectionProps<"ProductCard">) {
  return (
    <section className="lv-section lv-section--tight">
      <div className="lv-container">
        {props.title ? <h2>{props.title}</h2> : null}
        <div style={{ maxWidth: "26rem" }}>
          <ProductCard product={props.product} showCategory />
        </div>
      </div>
    </section>
  );
}

export function PricingSection(props: SectionProps<"Pricing">) {
  return (
    <section className="lv-section">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />
        {props.plans.length === 0 ? (
          <EmptyState message="Add pricing plans to show what each tier includes." />
        ) : (
          <>
            <div className="lv-grid" data-cols={props.plans.length >= 4 ? 4 : props.plans.length}>
              {props.plans.map((plan) => (
                <article
                  className="lv-card lv-price"
                  data-highlighted={plan.highlighted ? "true" : "false"}
                  key={plan.name}
                >
                  <div className="lv-row" style={{ justifyContent: "space-between" }}>
                    <h3 style={{ marginBottom: 0 }}>{plan.name}</h3>
                    {plan.highlighted ? <span className="lv-badge">Popular</span> : null}
                  </div>
                  <p className="lv-price__amount">
                    {plan.price}
                    {plan.period ? <span>{plan.period}</span> : null}
                  </p>
                  {plan.description ? <p className="lv-muted">{plan.description}</p> : null}
                  {plan.features.length > 0 ? (
                    <ul className="lv-check">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  ) : null}
                  <ButtonLink
                    href={plan.cta.path || "/contact"}
                    label={plan.cta.label || "Choose plan"}
                    variant={plan.highlighted ? "primary" : "outline"}
                  />
                </article>
              ))}
            </div>
            {props.note ? <p className="lv-form__note" style={{ marginTop: "1.5rem" }}>{props.note}</p> : null}
          </>
        )}
      </div>
    </section>
  );
}
