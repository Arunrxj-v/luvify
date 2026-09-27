import type { SectionProps } from "@luvify/shared";
import { Avatar, ButtonLink, EmptyState, ImageFrame, SectionHeading, Stars } from "../primitives";

export function TestimonialsSection(props: SectionProps<"Testimonials">) {
  return (
    <section className="lv-section lv-section--surface">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} />
        {props.items.length === 0 ? (
          <EmptyState message="Add testimonials from real customers to build trust." />
        ) : props.layout === "carousel" ? (
          <div className="lv-carousel">
            {props.items.map((item) => (
              <article className="lv-card lv-quote" key={`${item.author}-${item.quote.slice(0, 24)}`}>
                <Stars rating={item.rating} />
                <blockquote>{item.quote}</blockquote>
                <footer>
                  <strong>{item.author || "Client"}</strong>
                  {item.role ? <span className="lv-muted">{item.role}</span> : null}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="lv-grid" data-cols={props.items.length >= 3 ? 3 : 2}>
            {props.items.map((item) => (
              <article className="lv-card lv-quote" key={`${item.author}-${item.quote.slice(0, 24)}`}>
                <Stars rating={item.rating} />
                <blockquote>{item.quote}</blockquote>
                <footer>
                  <strong>{item.author || "Client"}</strong>
                  {item.role ? <span className="lv-muted">{item.role}</span> : null}
                </footer>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function BlogSection(props: SectionProps<"Blog">) {
  return (
    <section className="lv-section">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />
        {props.posts.length === 0 ? (
          <EmptyState message="Publish your first article to fill this section." />
        ) : props.layout === "list" ? (
          <ul className="lv-list">
            {props.posts.map((post) => (
              <li key={post.title}>
                <div>
                  <p className="lv-post__meta">{[post.date, post.category, post.readingTime].filter(Boolean).join(" - ")}</p>
                  <h3>{post.title}</h3>
                  {post.excerpt ? <p className="lv-muted">{post.excerpt}</p> : null}
                </div>
                {post.url ? <ButtonLink href={post.url} label="Read" variant="ghost" /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="lv-grid" data-cols={3}>
            {props.posts.map((post) => (
              <article className="lv-card lv-post" key={post.title}>
                {post.imageUrl ? (
                  <ImageFrame image={{ url: post.imageUrl, alt: post.title }} ratio="wide" fallbackLabel={post.title} />
                ) : null}
                <p className="lv-post__meta">{[post.date, post.category, post.readingTime].filter(Boolean).join(" - ")}</p>
                <h3>{post.title}</h3>
                {post.excerpt ? <p className="lv-muted">{post.excerpt}</p> : null}
                {post.author ? <p className="lv-muted">{post.author}</p> : null}
                {post.url ? <ButtonLink href={post.url} label="Read article" variant="ghost" /> : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function TeamSection(props: SectionProps<"Team">) {
  return (
    <section className="lv-section lv-section--surface">
      <div className="lv-container">
        <SectionHeading eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle} />
        {props.members.length === 0 ? (
          <EmptyState message="Add team members with names, roles and photos." />
        ) : (
          <div className="lv-grid" data-cols={props.columns}>
            {props.members.map((member) => (
              <article className="lv-team__member" key={member.name}>
                <Avatar name={member.name} imageUrl={member.imageUrl} />
                <h3>{member.name}</h3>
                {member.role ? <p className="lv-muted">{member.role}</p> : null}
                {member.bio ? <p className="lv-muted">{member.bio}</p> : null}
                {member.socialLinks.length > 0 ? (
                  <ul className="lv-chips" style={{ justifyContent: "center", marginBottom: 0 }}>
                    {member.socialLinks.map((social) => (
                      <li key={`${social.label}-${social.path}`}>
                        <a className="lv-chip" href={social.path} rel="noopener noreferrer">
                          {social.label}
                        </a>
                      </li>
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
