/**
 * Hand-authored CSS for the generated sites.
 *
 * Deliberately *not* Tailwind: this stylesheet ships with the published HTML
 * snapshot and is injected into the preview iframe, and it must work without a
 * build step or JavaScript. Brand colours arrive as CSS variables from the
 * validated theme, so nothing AI-generated is ever interpolated into CSS text.
 */
export const SITE_CSS = `
:root{color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0}
img{max-width:100%;display:block}
a{color:inherit}
[data-lv-site]{
  --lv-primary:#1f6feb;--lv-primary-contrast:#ffffff;--lv-secondary:#0f172a;--lv-accent:#f59e0b;
  --lv-bg:#ffffff;--lv-surface:#f8fafc;--lv-fg:#0f172a;--lv-muted:#64748b;--lv-border:#e2e8f0;
  --lv-radius:14px;--lv-container:1200px;--lv-heading:'Inter',system-ui,sans-serif;--lv-body:'Inter',system-ui,sans-serif;
  --lv-space:clamp(3.5rem,7vw,6.5rem);--lv-gap:1.5rem;
  background:var(--lv-bg);color:var(--lv-fg);font-family:var(--lv-body);font-size:17px;line-height:1.65;
  -webkit-font-smoothing:antialiased;
}
[data-lv-theme='dark']{color-scheme:dark}
[data-lv-spacing='compact']{--lv-space:clamp(2.5rem,5vw,4rem)}
[data-lv-spacing='spacious']{--lv-space:clamp(5rem,9vw,9rem)}
[data-lv-site] h1,[data-lv-site] h2,[data-lv-site] h3,[data-lv-site] h4{
  font-family:var(--lv-heading);line-height:1.14;letter-spacing:-0.015em;margin:0 0 .6em;font-weight:600;
}
[data-lv-site] h1{font-size:clamp(2.1rem,4.6vw,3.5rem)}
[data-lv-site] h2{font-size:clamp(1.65rem,3vw,2.4rem)}
[data-lv-site] h3{font-size:clamp(1.15rem,1.6vw,1.4rem)}
[data-lv-site] p{margin:0 0 1rem;max-width:68ch}
[data-lv-site] a{text-decoration:none}
[data-lv-site] :focus-visible{outline:3px solid var(--lv-accent);outline-offset:3px}
.lv-container{width:100%;max-width:var(--lv-container);margin:0 auto;padding:0 clamp(1.1rem,4vw,2.5rem)}
.lv-section{padding:var(--lv-space) 0}
.lv-section--surface{background:var(--lv-surface)}
.lv-section--tight{padding:calc(var(--lv-space) * .55) 0}
.lv-eyebrow{display:inline-block;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:var(--lv-primary);font-weight:600;margin-bottom:.9rem}
[data-lv-theme='dark'] .lv-eyebrow{color:var(--lv-accent)}
.lv-lede{font-size:1.08rem;color:var(--lv-muted);max-width:60ch}
.lv-muted{color:var(--lv-muted)}
.lv-grid{display:grid;gap:var(--lv-gap);grid-template-columns:repeat(var(--lv-cols,3),minmax(0,1fr))}
.lv-grid[data-cols='2']{--lv-cols:2}
.lv-grid[data-cols='3']{--lv-cols:3}
.lv-grid[data-cols='4']{--lv-cols:4}
.lv-stack{display:flex;flex-direction:column;gap:1rem}
.lv-row{display:flex;flex-wrap:wrap;gap:.85rem;align-items:center}
.lv-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
  padding:.8rem 1.5rem;border-radius:calc(var(--lv-radius) * .75);border:1px solid transparent;
  font-weight:600;font-size:.95rem;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,background .15s ease;
}
.lv-btn:hover{transform:translateY(-1px)}
.lv-btn--primary{background:var(--lv-primary);color:var(--lv-primary-contrast)}
.lv-btn--secondary{background:var(--lv-secondary);color:#fff}
.lv-btn--accent{background:var(--lv-accent);color:#1a1206}
.lv-btn--outline{border-color:currentColor;color:inherit;background:transparent}
.lv-btn--ghost{border-color:var(--lv-border);background:transparent;color:inherit}
[data-lv-buttons='pill'] .lv-btn{border-radius:999px}
[data-lv-buttons='square'] .lv-btn{border-radius:2px}
.lv-card{background:var(--lv-bg);border:1px solid var(--lv-border);border-radius:var(--lv-radius);padding:1.6rem}
[data-lv-theme='dark'] .lv-card{background:color-mix(in srgb,var(--lv-surface) 70%,transparent)}
.lv-card--flush{padding:0;overflow:hidden}
.lv-frame{
  position:relative;overflow:hidden;border-radius:var(--lv-radius);background:var(--lv-surface);
  aspect-ratio:4/3;display:flex;align-items:flex-end;
}
.lv-frame--wide{aspect-ratio:16/9}
.lv-frame--tall{aspect-ratio:3/4}
.lv-frame img{width:100%;height:100%;object-fit:cover}
.lv-frame__placeholder{
  width:100%;height:100%;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,color-mix(in srgb,var(--lv-primary) 22%,transparent),color-mix(in srgb,var(--lv-accent) 26%,transparent));
  color:var(--lv-fg);font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;font-weight:600;opacity:.85;
}
.lv-frame__caption{position:absolute;inset:auto 0 0 0;padding:.7rem .9rem;background:linear-gradient(transparent,rgba(0,0,0,.55));color:#fff;font-size:.85rem}
.lv-nav{position:sticky;top:0;z-index:20;background:var(--lv-bg);border-bottom:1px solid transparent}
.lv-nav[data-style='bordered']{border-bottom-color:var(--lv-border)}
.lv-nav[data-style='transparent']{background:transparent}
.lv-nav[data-sticky='false']{position:static}
.lv-nav__inner{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;min-height:72px}
.lv-nav__brand{font-family:var(--lv-heading);font-weight:700;font-size:1.12rem;letter-spacing:-.01em;display:flex;align-items:center;gap:.6rem}
.lv-nav__brand img{height:34px;width:auto}
.lv-nav__links{display:flex;align-items:center;gap:1.4rem;font-size:.95rem;font-weight:500;list-style:none;margin:0;padding:0}
.lv-nav__links a:hover{color:var(--lv-primary)}
.lv-nav__link--active{color:var(--lv-primary);font-weight:600}
.lv-nav__actions{display:flex;align-items:center;gap:.75rem}
.lv-nav__toggle{display:none;border:1px solid var(--lv-border);background:transparent;border-radius:999px;padding:.4rem .7rem;font-size:.9rem;cursor:pointer}
.lv-hero{position:relative;padding:calc(var(--lv-space) * 1.05) 0 var(--lv-space)}
.lv-hero[data-size='compact']{padding-top:calc(var(--lv-space) * .6)}
.lv-hero[data-size='tall']{padding-top:calc(var(--lv-space) * 1.4);padding-bottom:calc(var(--lv-space) * 1.2)}
.lv-hero__bg{position:absolute;inset:0;overflow:hidden}
.lv-hero__bg img{width:100%;height:100%;object-fit:cover}
.lv-hero__overlay{position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--lv-bg) 35%,transparent),var(--lv-bg))}
.lv-hero__inner{position:relative;display:grid;gap:clamp(2rem,5vw,3.5rem);grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);align-items:center}
.lv-hero__inner--single{grid-template-columns:minmax(0,1fr)}
.lv-hero__inner--single .lv-hero__content{max-width:44rem;margin-inline:auto;text-align:center;justify-items:center}
.lv-hero__inner--single .lv-lede{margin-inline:auto}
.lv-hero__inner--single .lv-row,.lv-hero__inner--single .lv-hero__stats{justify-content:center}
.lv-hero__inner--single .lv-hero__stats{border-top:0;padding-top:0}
.lv-hero[data-align='center'] .lv-hero__inner{grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center;max-width:56rem;margin:0 auto}
.lv-hero[data-align='center'] p{margin-inline:auto}
.lv-hero__content{max-width:36rem}
.lv-hero__stats{display:flex;flex-wrap:wrap;gap:2rem;margin-top:2rem;padding-top:1.4rem;border-top:1px solid var(--lv-border)}
.lv-hero__stats div{display:flex;flex-direction:column}
.lv-hero__stats strong{font-family:var(--lv-heading);font-size:1.5rem}
.lv-hero__stats span{font-size:.82rem;color:var(--lv-muted);text-transform:uppercase;letter-spacing:.1em}
.lv-trust{font-size:.85rem;color:var(--lv-muted);margin-top:1rem}
.lv-feature__icon{width:42px;height:42px;border-radius:calc(var(--lv-radius) * .6);display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--lv-primary) 14%,transparent);color:var(--lv-primary);font-weight:700;margin-bottom:1rem}
.lv-service{display:flex;flex-direction:column;gap:.4rem}
.lv-service__meta{display:flex;align-items:baseline;justify-content:space-between;gap:1rem}
.lv-service__price{font-family:var(--lv-heading);font-weight:600;white-space:nowrap}
.lv-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.lv-list > li{padding:1.15rem 0;border-bottom:1px solid var(--lv-border);display:flex;gap:1.25rem;justify-content:space-between;align-items:flex-start}
.lv-list > li:first-child{border-top:1px solid var(--lv-border)}
.lv-bullets{list-style:none;margin:.6rem 0 0;padding:0;display:flex;flex-direction:column;gap:.35rem;font-size:.92rem;color:var(--lv-muted)}
.lv-bullets li::before{content:'—';margin-right:.5rem;color:var(--lv-primary)}
.lv-check{list-style:none;margin:1rem 0 1.4rem;padding:0;display:flex;flex-direction:column;gap:.55rem;font-size:.95rem}
.lv-check li{display:flex;gap:.6rem;align-items:flex-start}
.lv-check li::before{content:'✓';color:var(--lv-primary);font-weight:700}
.lv-price{display:flex;flex-direction:column;gap:.5rem;height:100%}
.lv-price[data-highlighted='true']{border-color:var(--lv-primary);box-shadow:0 18px 40px -24px color-mix(in srgb,var(--lv-primary) 60%,transparent)}
.lv-price__amount{font-family:var(--lv-heading);font-size:2.1rem;font-weight:600;display:flex;align-items:baseline;gap:.35rem}
.lv-price__amount span{font-size:.9rem;font-weight:500;color:var(--lv-muted)}
.lv-badge{display:inline-block;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;padding:.28rem .6rem;border-radius:999px;background:var(--lv-accent);color:#1a1206}
.lv-product{display:flex;flex-direction:column;overflow:hidden}
.lv-product__body{padding:1.1rem 1.2rem 1.4rem;display:flex;flex-direction:column;gap:.35rem;flex:1}
.lv-product__price{font-family:var(--lv-heading);font-weight:600;margin-top:auto}
.lv-product__compare{color:var(--lv-muted);text-decoration:line-through;font-size:.9rem;margin-left:.4rem}
.lv-product__category{font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--lv-muted)}
.lv-chips{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.8rem}
.lv-chip{border:1px solid var(--lv-border);border-radius:999px;padding:.35rem .85rem;font-size:.85rem;color:var(--lv-muted)}
.lv-chip--active{border-color:var(--lv-primary);color:var(--lv-primary)}
.lv-quote{display:flex;flex-direction:column;gap:.9rem;height:100%}
.lv-quote blockquote{margin:0;font-size:1.02rem}
.lv-quote footer{display:flex;flex-direction:column;font-size:.92rem}
.lv-quote footer span{font-size:.85rem}
.lv-carousel{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(16rem,22rem);gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:.5rem}
.lv-carousel > *{scroll-snap-align:start}
.lv-stars{color:var(--lv-accent);letter-spacing:.15em;font-size:.9rem}
.lv-faq details{border-bottom:1px solid var(--lv-border);padding:1.05rem 0}
.lv-faq details:first-of-type{border-top:1px solid var(--lv-border)}
.lv-faq summary{cursor:pointer;font-weight:600;font-family:var(--lv-heading);list-style:none;display:flex;justify-content:space-between;gap:1rem}
.lv-faq summary::-webkit-details-marker{display:none}
.lv-faq summary::after{content:'+';color:var(--lv-primary);font-weight:700}
.lv-faq details[open] summary::after{content:'−'}
.lv-faq p{margin:.75rem 0 0;color:var(--lv-muted)}
.lv-gallery{display:grid;gap:1rem;grid-template-columns:repeat(var(--lv-cols,3),minmax(0,1fr))}
.lv-map{width:100%;height:280px;border:1px solid var(--lv-border);border-radius:var(--lv-radius);background:var(--lv-surface)}
.lv-contact{display:grid;gap:clamp(2rem,5vw,3.5rem);grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);align-items:start}
.lv-contact__details{display:flex;flex-direction:column;gap:1.1rem;list-style:none;margin:0;padding:0}
.lv-contact__details dt{font-size:.76rem;letter-spacing:.14em;text-transform:uppercase;color:var(--lv-muted)}
.lv-contact__details dd{margin:.2rem 0 0;font-weight:500}
.lv-form{display:grid;gap:1rem;grid-template-columns:1fr 1fr}
.lv-form .lv-field--wide{grid-column:1 / -1}
.lv-field{display:flex;flex-direction:column;gap:.4rem}
.lv-field label{font-size:.85rem;font-weight:600}
.lv-field input,.lv-field textarea,.lv-field select{
  width:100%;padding:.75rem .9rem;border:1px solid var(--lv-border);border-radius:calc(var(--lv-radius) * .6);
  background:var(--lv-bg);color:inherit;font:inherit;font-size:.95rem;
}
.lv-field textarea{min-height:130px;resize:vertical}
.lv-form__note{font-size:.82rem;color:var(--lv-muted)}
.lv-cta{background:var(--lv-secondary);color:#fff;border-radius:var(--lv-radius);padding:clamp(2rem,5vw,3.5rem)}
.lv-cta[data-variant='accent']{background:var(--lv-accent);color:#1a1206}
.lv-cta[data-variant='outline']{background:transparent;color:inherit;border:1px solid var(--lv-border)}
.lv-cta p{color:inherit;opacity:.85}
.lv-footer{background:var(--lv-secondary);color:#fff;padding:clamp(3rem,6vw,4.5rem) 0 2rem;margin-top:var(--lv-space)}
.lv-footer a{opacity:.82}
.lv-footer a:hover{opacity:1}
.lv-footer__grid{display:grid;gap:2.5rem;grid-template-columns:minmax(0,1.4fr) repeat(auto-fit,minmax(140px,1fr))}
.lv-footer__title{font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;opacity:.7;margin-bottom:.9rem;font-weight:600}
.lv-footer__brand{font-family:var(--lv-heading);font-size:1.2rem;font-weight:700;margin:0 0 .6rem}
.lv-footer ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.5rem;font-size:.94rem}
.lv-footer__bottom{display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.16);margin-top:2.5rem;padding-top:1.4rem;font-size:.85rem;opacity:.8}
.lv-footer__bottom span:last-child{display:flex;flex-wrap:wrap;gap:1rem}
.lv-footer__legal{opacity:.75}
.lv-post{display:flex;flex-direction:column;gap:.6rem;height:100%}
.lv-post__meta{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--lv-muted)}
.lv-post h3{margin-bottom:.2rem}
.lv-team__member{text-align:center;display:flex;flex-direction:column;gap:.5rem}
.lv-team__avatar{width:88px;height:88px;border-radius:999px;margin:0 auto 1rem;background:linear-gradient(135deg,color-mix(in srgb,var(--lv-primary) 30%,transparent),color-mix(in srgb,var(--lv-accent) 35%,transparent));display:flex;align-items:center;justify-content:center;font-family:var(--lv-heading);font-size:1.4rem;font-weight:600}
.lv-about{display:grid;gap:clamp(2rem,5vw,3.5rem);grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center}
.lv-about[data-image='left'] .lv-about__media{order:-1}
.lv-about--no-media{grid-template-columns:minmax(0,1fr)}
.lv-about--no-media > div{max-width:44rem}
.lv-about__stats{display:flex;flex-wrap:wrap;gap:2rem;margin-top:1.75rem}
.lv-about__stats strong{font-family:var(--lv-heading);font-size:1.6rem;display:block}
.lv-about__stats span{font-size:.82rem;color:var(--lv-muted)}
.lv-signature{font-family:var(--lv-heading);font-style:italic;margin-top:1.25rem;opacity:.8}
.lv-unsupported{border:1px dashed var(--lv-border);padding:1rem;border-radius:var(--lv-radius);color:var(--lv-muted);font-size:.9rem}
@media (max-width:960px){
  .lv-hero__inner,.lv-about,.lv-contact{grid-template-columns:minmax(0,1fr)}
  .lv-about[data-image='left'] .lv-about__media{order:0}
  .lv-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
  .lv-gallery{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
}
@media (max-width:760px){
  .lv-nav__links{display:none}
  .lv-nav[data-open='true'] .lv-nav__links{
    display:flex;flex-direction:column;align-items:flex-start;gap:.9rem;
    position:absolute;left:0;right:0;top:100%;background:var(--lv-bg);
    border-bottom:1px solid var(--lv-border);padding:1.2rem clamp(1.1rem,4vw,2.5rem);
  }
  .lv-nav__inner{position:relative;min-height:64px}
  .lv-nav__toggle{display:inline-flex}
  .lv-form{grid-template-columns:1fr}
  .lv-footer__grid{grid-template-columns:1fr}
  .lv-grid{grid-template-columns:1fr}
  .lv-list > li{flex-direction:column;gap:.4rem}
}
@media (prefers-reduced-motion:reduce){
  *{animation-duration:.001ms!important;transition-duration:.001ms!important}
}
`.trim();


