const defaultConfig = {
    title: 'Internet Archive for Stremio',
    tagline: 'Stream directly from archive.org when metadata matches IMDB.',
    description: 'This add-on looks up Internet Archive entries every time you request a movie or TV episode in Stremio, filters the playable files, and feeds the best direct links back into your player.',
    installUrl: '/manifest.json',
    ctaLabel: 'Install Add-on',
    secondaryLabel: 'View Source',
    secondaryUrl: 'https://github.com/funkypenguin/stremio-internet-archive-addon',
    accentColor: '#0ea5e9',
    backgroundColor: '#020617',
    cardColor: '#0f172a',
    textColor: '#f8fafc',
    logoUrl: '',
    logoSvg: '',
    blurbHtml: '',
    disclaimerHtml: 'This add-on does not store or host any media. It simply surfaces public domain content already hosted on archive.org.',
};

const envMap = {
    title: 'LANDING_TITLE',
    tagline: 'LANDING_TAGLINE',
    description: 'LANDING_DESCRIPTION',
    installUrl: 'LANDING_INSTALL_URL',
    ctaLabel: 'LANDING_CTA',
    secondaryLabel: 'LANDING_SECONDARY',
    secondaryUrl: 'LANDING_SECONDARY_URL',
    accentColor: 'LANDING_ACCENT_COLOR',
    backgroundColor: 'LANDING_BACKGROUND',
    cardColor: 'LANDING_CARD_BACKGROUND',
    textColor: 'LANDING_TEXT_COLOR',
    logoUrl: 'LANDING_LOGO',
    logoSvg: 'LANDING_LOGO_SVG',
    blurbHtml: 'LANDING_BLURB_HTML',
    disclaimerHtml: 'LANDING_DISCLAIMER_HTML',
};

const escapeHtml = (value = '') => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function getLandingConfig(overrides = {}) {
    const config = { ...defaultConfig };
    Object.entries(envMap).forEach(([key, envName]) => {
        if (process.env[envName]) {
            config[key] = process.env[envName];
        }
    });
    return { ...config, ...overrides };
}

function renderLandingPage(overrides = {}) {
    const cfg = getLandingConfig(overrides);
    const isInlineSvg = (value = '') => value.trim().startsWith('<');
    const secondaryLink = cfg.secondaryUrl && cfg.secondaryLabel
        ? `<a class="secondary-link" href="${escapeHtml(cfg.secondaryUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cfg.secondaryLabel)}</a>`
        : '';
    const encodedInstall = encodeURIComponent(cfg.installUrl);
    const desktopInstall = `stremio://addon-install?addon=${encodedInstall}`;
    const webInstall = `https://web.stremio.com/#/addons/subscribe?addon=${encodedInstall}`;
    const inlineSvg = cfg.logoSvg && isInlineSvg(cfg.logoSvg)
        ? cfg.logoSvg
        : cfg.logoUrl && isInlineSvg(cfg.logoUrl)
            ? cfg.logoUrl
            : '';
    const logoImageUrl = inlineSvg
        ? ''
        : cfg.logoSvg && !isInlineSvg(cfg.logoSvg)
            ? cfg.logoSvg.trim()
            : cfg.logoUrl && !isInlineSvg(cfg.logoUrl)
                ? cfg.logoUrl.trim()
                : '';
    const logo = inlineSvg
        ? `<div class="logo logo-svg" aria-hidden="true">${inlineSvg}</div>`
        : logoImageUrl
            ? `<img class="logo" src="${escapeHtml(logoImageUrl)}" alt="${escapeHtml(cfg.title)} logo" />`
            : '';
    const blurb = cfg.blurbHtml?.trim()
        ? `<div class="blurb">${cfg.blurbHtml}</div>`
        : '';
    const disclaimer = cfg.disclaimerHtml?.trim()
        ? `<p class="disclaimer">${escapeHtml(cfg.disclaimerHtml)}</p>`
        : '';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(cfg.title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&display=swap');
:root {
    --accent: ${cfg.accentColor};
    --bg: ${cfg.backgroundColor};
    --card: ${cfg.cardColor};
    --text: ${cfg.textColor};
}
* {
    box-sizing: border-box;
}
body {
    margin: 0;
    font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1.5rem;
}
main {
    width: min(720px, 100%);
    background: var(--card);
    border-radius: 24px;
    padding: 2.5rem;
    box-shadow: 0 25px 70px rgba(15, 23, 42, 0.65);
}
.cta,
button.cta {
    appearance: none;
    -webkit-appearance: none;
    font: inherit;
}
h1 {
    margin: 0 0 0.35rem;
    font-size: clamp(2rem, 4vw, 3rem);
}
.tagline {
    margin: 0 0 0.85rem;
    font-size: clamp(1rem, 2vw, 1.25rem);
    color: rgba(248, 250, 252, 0.75);
}
.description {
    margin: 2rem 0;
    line-height: 1.6;
    font-size: 1.05rem;
}
.hero {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
}
.hero-text {
    flex: 1;
    min-width: 220px;
}
.logo-wrapper {
    flex-shrink: 0;
}
.logo {
    width: 72px;
    height: 72px;
    object-fit: contain;
    filter: drop-shadow(0 0 20px rgba(14, 165, 233, 0.45));
}
.logo-svg {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.logo-svg svg {
    width: 72px;
    height: 72px;
}
.cta-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 2rem;
}
.cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.85rem 1.65rem;
    border-radius: 999px;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}
.cta:hover {
    transform: translateY(-1px);
}
.cta:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
.cta.primary {
    background: linear-gradient(120deg, var(--accent), #22d3ee);
    color: #0f172a;
    box-shadow: 0 18px 38px rgba(14, 165, 233, 0.35);
}
.cta.secondary-btn {
    background: rgba(15, 23, 42, 0.6);
    color: var(--text);
    border-color: rgba(226, 232, 240, 0.45);
    box-shadow: 0 12px 26px rgba(2, 6, 23, 0.55);
}
.cta.ghost {
    background: rgba(15, 23, 42, 0.35);
    color: rgba(248, 250, 252, 0.85);
    border-style: dashed;
    border-color: rgba(148, 163, 184, 0.55);
}
.secondary-link {
    display: inline-block;
    margin: 1.5rem 0 0;
    color: rgba(248, 250, 252, 0.8);
    text-decoration: none;
}
.blurb {
    margin-top: 1.5rem;
    padding: 1.25rem;
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.2);
}
.copy-flash {
    margin-top: 0.75rem;
    font-size: 0.95rem;
    color: #16f2b3;
}
.disclaimer {
    margin-top: 1.25rem;
    font-size: 0.95rem;
    line-height: 1.5;
    color: rgba(248, 250, 252, 0.65);
}
@media (max-width: 640px) {
    main {
        padding: 1.75rem;
    }
    .cta-grid {
        flex-direction: column;
        width: 100%;
    }
    .description {
        font-size: 1rem;
    }
}
</style>
</head>
<body>
    <main>
        <div class="hero">
            ${logo ? `<div class="logo-wrapper">${logo}</div>` : ''}
            <div class="hero-text">
                <h1>${escapeHtml(cfg.title)}</h1>
            </div>
        </div>
        <p class="tagline">${escapeHtml(cfg.tagline)}</p>
        <p class="description">${escapeHtml(cfg.description)}</p>
        ${blurb}
        ${disclaimer}
        <div class="cta-grid">
            <button type="button" class="cta primary" data-url="${escapeHtml(desktopInstall)}" data-target="self">Install in Stremio</button>
            <button type="button" class="cta secondary-btn" data-url="${escapeHtml(webInstall)}" data-target="blank">Open in Stremio Web</button>
            <button type="button" class="cta ghost" id="copy-manifest" data-manifest="${escapeHtml(cfg.installUrl)}">Copy Manifest URL</button>
        </div>
        <div class="copy-flash" id="copy-flash" hidden>Copied to clipboard.</div>
        ${secondaryLink}
    </main>
    <script>
    (function(){
        document.querySelectorAll('.cta[data-url]').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                const target = btn.dataset.target;
                if (!url) return;
                if (target === 'blank') {
                    window.open(url, '_blank', 'noopener');
                } else {
                    window.location.href = url;
                }
            });
        });

        const copyBtn = document.getElementById('copy-manifest');
        const flash = document.getElementById('copy-flash');
        if (copyBtn && flash) {
            const showFlash = (text, isError) => {
                flash.textContent = text;
                flash.style.color = isError ? '#f87171' : '#16f2b3';
                flash.hidden = false;
                clearTimeout(flash._timer);
                flash._timer = setTimeout(() => { flash.hidden = true; }, 2200);
            };
            copyBtn.addEventListener('click', async () => {
                const manifest = copyBtn.dataset.manifest;
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(manifest);
                    } else {
                        const textarea = document.createElement('textarea');
                        textarea.value = manifest;
                        textarea.style.position = 'fixed';
                        textarea.style.opacity = '0';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                    }
                    showFlash('Manifest URL copied.');
                } catch (err) {
                    console.error('Copy failed', err);
                    showFlash('Copy failed. Please copy manually.', true);
                }
            });
        }
    })();
    </script>
</body>
</html>`;
}

module.exports = { getLandingConfig, renderLandingPage };
