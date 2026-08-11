#!/usr/bin/env node
/**
 * build.js — Markdown-to-HTML static site builder for blog posts
 *
 * - Reads all .md files from blog/posts/
 * - Parses frontmatter (title, date, excerpt, thumbnail, tags, youtubeId)
 * - Converts markdown body to HTML
 * - Outputs individual post pages to blog/[slug].html
 * - Outputs blog/index.html (all posts listing)
 * - Outputs blog/posts.json (metadata for home page JS)
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

// ── Paths ──────────────────────────────────────────────────────────────────
const ROOT        = path.resolve(__dirname, '..');
const POSTS_SRC   = path.join(ROOT, 'blog', 'posts');
const BLOG_OUT    = path.join(ROOT, 'blog');
const POSTS_JSON  = path.join(BLOG_OUT, 'posts.json');

// ── Helpers ────────────────────────────────────────────────────────────────
function slugify(filename) {
  return path.basename(filename, '.md');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  // Format in UTC so "2026-07-24" (parsed as UTC midnight) renders as July 24,
  // not the previous day in local timezones west of UTC.
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function readingTime(content) {
  const words = content.trim().split(/\s+/).length;
  return Math.ceil(words / 200);
}

// ── Post Page Template ─────────────────────────────────────────────────────
// Pick up to `limit` related posts, ranked by shared tags then recency.
function pickRelated(post, allPosts, limit = 3) {
  const myTags = new Set((post.tags || []).map(t => t.toLowerCase()));
  return allPosts
    .filter(p => p.slug !== post.slug)
    .map(p => ({
      post: p,
      shared: (p.tags || []).filter(t => myTags.has(t.toLowerCase())).length,
    }))
    .filter(x => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || new Date(b.post.date) - new Date(a.post.date))
    .slice(0, limit)
    .map(x => x.post);
}

function postTemplate({ title, date, updated, tags, thumbnail, youtubeId, excerpt, htmlContent, slug, readTime, related = [] }) {
  const tagBadges = (tags || []).map(t => `<span class="post-tag">${t}</span>`).join('');
  // The hero sits below the video on video posts (so lazy), and is the LCP element otherwise.
  const heroImage = thumbnail
    ? `<img src="../${thumbnail}" alt="${title} thumbnail" class="post-hero-img" width="1600" height="900" ${youtubeId ? 'loading="lazy" decoding="async"' : 'fetchpriority="high"'} />`
    : '';
  // Facade: ship a poster image, swap in the real iframe on click. Avoids ~500KB
  // of YouTube JS on first paint for every post.
  const youtubeEmbed = youtubeId
    ? `<div class="post-yt-embed">
        <button type="button" class="yt-facade" data-yt-id="${youtubeId}" aria-label="Play video: ${title}">
          <img src="https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg" alt="Play video: ${title}" width="480" height="360" fetchpriority="high" />
          <span class="yt-facade-play" aria-hidden="true"></span>
        </button>
      </div>`
    : '';
  const relatedBlock = related.length
    ? `<aside class="post-related" aria-labelledby="related-heading">
      <h2 id="related-heading">Keep reading</h2>
      <ul>
        ${related.map(r => `<li><a href="${r.slug}.html">${r.title}</a></li>`).join('\n        ')}
      </ul>
    </aside>`
    : '';

  // Only append the brand suffix when the result still fits in a SERP title (~60 chars).
  const pageTitle = title.length <= 46 ? `${title} · Robby J` : title;

  // JSON-LD structured data (BlogPosting + BreadcrumbList + VideoObject)
  const pageUrl = `https://automatewithrobby.fyi/blog/${slug}.html`;
  const imageUrl = thumbnail ? `https://automatewithrobby.fyi/${thumbnail}` : null;
  const authorNode = {
    '@id': 'https://automatewithrobby.fyi/#robby',
    '@type': 'Person',
    name: 'Robby J',
    url: 'https://automatewithrobby.fyi/',
  };
  const ldGraph = [
    {
      '@type': 'BlogPosting',
      headline: title,
      description: excerpt,
      ...(imageUrl ? { image: imageUrl } : {}),
      datePublished: date,
      ...(updated ? { dateModified: updated } : {}),
      author: authorNode,
      publisher: authorNode,
      mainEntityOfPage: pageUrl,
      ...(tags && tags.length ? { keywords: tags.join(', ') } : {}),
      timeRequired: `PT${readTime}M`,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://automatewithrobby.fyi/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://automatewithrobby.fyi/blog/' },
        { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
      ],
    },
  ];
  if (youtubeId) {
    ldGraph.push({
      '@type': 'VideoObject',
      name: title,
      description: excerpt,
      thumbnailUrl: imageUrl || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      uploadDate: date,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      contentUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      author: authorNode,
    });
  }
  // Skip injection when the post body hand-embeds its own JSON-LD block
  const jsonLd = htmlContent.includes('application/ld+json')
    ? ''
    : `<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': ldGraph }, null, 2).replace(/</g, '\\u003c')}
<\/script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle}</title>
  <meta name="description" content="${excerpt}" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="${excerpt}" />
  ${thumbnail ? `<meta property="og:image" content="https://automatewithrobby.fyi/${thumbnail}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta property="og:type" content="article" />
  <link rel="canonical" href="https://automatewithrobby.fyi/blog/${slug}.html" />
  ${jsonLd}
  <link rel="stylesheet" href="../css/styles.css" />
  <link rel="stylesheet" href="../css/post.css" />
  <link rel="icon" type="image/png" href="../assets/images/favicon/favicon-96x96.png" sizes="96x96" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" />
  <!-- Umami Analytics -->
  <script defer src="https://cloud.umami.is/script.js" data-website-id="a845ac87-58ac-49d6-aa82-b25ad58ab1b9" data-domains="automatewithrobby.fyi,www.automatewithrobby.fyi"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-T1RQQC7CB5"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    if (location.hostname.endsWith('automatewithrobby.fyi')) gtag('config', 'G-T1RQQC7CB5');
  </script>
</head>
<body>

<!-- ===== SKOOL BANNER ===== -->
<div class="skool-banner" style="background: var(--accent); color: var(--accent-ink); text-align: center; padding: 12px; font-weight: 600; font-family: var(--font-display);">
  Want to learn how to save time and money with AI? -> <a href="https://www.skool.com/ai-academy-with-robby-6849/about" style="color: var(--accent-ink); text-decoration: underline; margin-left: 5px;">https://www.skool.com/ai-academy-with-robby-6849/about</a>
</div>

<!-- ===== PROGRESS BAR ===== -->
<div class="read-progress" id="read-progress" role="progressbar" aria-label="Reading progress" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>

<!-- ===== NAV ===== -->
<nav aria-label="Main navigation">
  <div class="container nav-inner">
    <a href="../index.html" class="nav-logo" aria-label="Robby J home">Robby J<span class="cursor" aria-hidden="true"></span></a>
    <div class="nav-cta">
      <a href="../blog/index.html" class="btn btn-ghost" style="font-size:0.9rem">← All Posts</a>
      <a href="https://www.youtube.com/@Code-With-Robby" target="_blank" rel="noopener" class="btn btn-primary">Watch on YouTube</a>
    </div>
  </div>
</nav>

<!-- ===== POST ===== -->
<main class="post-main">
  <article class="post-article">

    <!-- YouTube Embed -->
    ${youtubeEmbed}

    <!-- Hero Image -->
    ${heroImage}

    <!-- Header -->
    <header class="post-header">
      <div class="post-tags">${tagBadges}</div>
      <h1 class="post-title">${title}</h1>
      <p class="post-excerpt">${excerpt}</p>
      <div class="post-meta">
        <span>✍️ By <a href="../index.html#about" style="color:inherit">Robby J</a></span>
        <span>·</span>
        <span>📅 <time datetime="${date}">${formatDate(date)}</time></span>
        <span>·</span>
        ${updated ? `<span>🔄 Updated <time datetime="${updated}">${formatDate(updated)}</time></span>
        <span>·</span>` : ''}
        <span>⏱ ${readTime} min read</span>
      </div>
    </header>

    <!-- Content -->
    <div class="post-content">
      ${htmlContent}
    </div>

    ${relatedBlock}

    <!-- CTA -->
    <div class="post-cta-box">
      <h3>Enjoyed this?</h3>
      <p>Subscribe to <strong>Code With Robby</strong> on YouTube for weekly AI engineering content, or try one of my free browser tools.</p>
      <a href="https://www.youtube.com/@Code-With-Robby" target="_blank" rel="noopener" class="btn btn-primary">Subscribe on YouTube →</a>
      <a href="../tools/index.html" class="btn btn-ghost" style="margin-left:8px">Free tools →</a>
    </div>

  </article>
</main>

<!-- ===== FOOTER ===== -->
<footer>
  <div class="container">
    <nav class="footer-nav" aria-label="Footer">
      <div>
        <h3>Free tools</h3>
        <ul>
          <li><a href="../tools/mic-test.html">Mic test</a></li>
          <li><a href="../tools/webcam-test.html">Webcam test</a></li>
          <li><a href="../tools/typing-vs-speaking-test.html">Typing vs speaking</a></li>
          <li><a href="../tools/video-file-size-calculator.html">Video file size</a></li>
          <li><a href="../tools/index.html">All tools</a></li>
        </ul>
      </div>
      <div>
        <h3>Compare</h3>
        <ul>
          <li><a href="../compare/squarespace-vs-custom-website.html">Squarespace vs custom</a></li>
          <li><a href="../compare/wix-vs-custom-website.html">Wix vs custom</a></li>
          <li><a href="../compare/wordpress-vs-custom-website.html">WordPress vs custom</a></li>
          <li><a href="../compare/webflow-vs-custom-website.html">Webflow vs custom</a></li>
          <li><a href="../compare/framer-vs-custom-website.html">Framer vs custom</a></li>
          <li><a href="../compare/godaddy-website-builder-vs-custom.html">GoDaddy vs custom</a></li>
        </ul>
      </div>
      <div>
        <h3>More</h3>
        <ul>
          <li><a href="../index.html">Home</a></li>
          <li><a href="../about.html">About Robby</a></li>
          <li><a href="../services/index.html">Services</a></li>
          <li><a href="index.html">Blog</a></li>
          <li><a href="https://www.youtube.com/@Code-With-Robby" target="_blank" rel="noopener">YouTube</a></li>
        </ul>
      </div>
    </nav>
    <div class="footer-bottom">
      <span>© 2026 Robby J · Automate with Robby · Built with ❤️ + AI</span>
      <a href="../index.html" class="btn btn-ghost" style="font-size:0.85rem">← Back to Home</a>
    </div>
  </div>
</footer>

<script>
  // YouTube facade: load the real player only when the poster is clicked
  document.querySelectorAll('.yt-facade').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.ytId;
      const frame = document.createElement('iframe');
      frame.width = '100%';
      frame.height = '100%';
      frame.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1';
      frame.title = 'YouTube video player';
      frame.frameBorder = '0';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      btn.replaceWith(frame);
    });
  });

  // Reading progress bar
  const bar = document.getElementById('read-progress');
  window.addEventListener('scroll', () => {
    const doc = document.documentElement;
    const scrolled = doc.scrollTop / (doc.scrollHeight - doc.clientHeight);
    const pct = Math.min(100, Math.round(scrolled * 100));
    bar.style.transform = 'scaleX(' + (pct / 100) + ')';
    bar.setAttribute('aria-valuenow', pct);
  }, { passive: true });

  // Nav scroll shadow
  const navEl = document.querySelector('nav');
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
</script>
</body>
</html>`;
}

// ── Blog Index Template ────────────────────────────────────────────────────
function blogIndexTemplate(posts) {
  const cards = posts.map(p => {
    const tagBadges = (p.tags || []).map(t => `<span class="blog-tag">${t}</span>`).join('');
    const thumb = p.thumbnail
      ? `<img src="../${p.thumbnail}" alt="${p.title} thumbnail" class="blog-thumb" loading="lazy" />`
      : `<div class="blog-thumb-placeholder"></div>`;
    return `
    <a href="${p.slug}.html" class="blog-card blog-card-link" aria-label="Read: ${p.title}">
      ${thumb}
      <div class="blog-body">
        <div class="blog-tags" style="display:flex; gap:6px; flex-wrap:wrap">${tagBadges}</div>
        <h2 class="blog-title">${p.title}</h2>
        <p class="blog-excerpt">${p.excerpt}</p>
        <div class="blog-footer" style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:auto; padding-top:4px">
          <span class="blog-date">${formatDate(p.date)}</span>
          <span class="blog-readmore" style="color:var(--accent); font-weight:600; font-size:0.875rem">Read article →</span>
        </div>
      </div>
    </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Blog — Robby J</title>
  <meta name="description" content="Written guides, deep dives, and tutorials on AI engineering, automation, and developer tools from Robby J." />
  <meta property="og:title" content="Blog — Robby J" />
  <meta property="og:description" content="Written guides, deep dives, and tutorials on AI engineering and automation." />
  <meta property="og:type" content="website" />
  <link rel="canonical" href="https://automatewithrobby.fyi/blog/" />
  <link rel="stylesheet" href="../css/styles.css" />
  <link rel="icon" type="image/png" href="../assets/images/favicon/favicon-96x96.png" sizes="96x96" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" />
  <!-- Umami Analytics -->
  <script defer src="https://cloud.umami.is/script.js" data-website-id="a845ac87-58ac-49d6-aa82-b25ad58ab1b9" data-domains="automatewithrobby.fyi,www.automatewithrobby.fyi"></script>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-T1RQQC7CB5"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    if (location.hostname.endsWith('automatewithrobby.fyi')) gtag('config', 'G-T1RQQC7CB5');
  </script>
</head>
<body>

<!-- ===== SKOOL BANNER ===== -->
<div class="skool-banner" style="background: var(--accent); color: var(--accent-ink); text-align: center; padding: 12px; font-weight: 600; font-family: var(--font-display);">
  Want to learn how to save time and money with AI? -> <a href="https://www.skool.com/ai-academy-with-robby-6849/about" style="color: var(--accent-ink); text-decoration: underline; margin-left: 5px;">https://www.skool.com/ai-academy-with-robby-6849/about</a>
</div>

<!-- ===== NAV ===== -->
<nav aria-label="Main navigation">
  <div class="container nav-inner">
    <a href="../index.html" class="nav-logo" aria-label="Robby J home">Robby J<span class="cursor" aria-hidden="true"></span></a>
    <div class="nav-cta">
      <a href="../index.html" class="btn btn-ghost" style="font-size:0.9rem">← Home</a>
      <a href="https://www.youtube.com/@Code-With-Robby" target="_blank" rel="noopener" class="btn btn-primary">Watch on YouTube</a>
    </div>
  </div>
</nav>

<!-- ===== BLOG INDEX ===== -->
<main>
  <section aria-labelledby="blog-index-heading" style="padding-top: 60px;">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">// all_posts</span>
        <h1 id="blog-index-heading">Blog</h1>
        <p>Written guides, deep dives, and tutorials on AI engineering and automation.</p>
        <div class="skool-promo-card" style="margin-top: 1.5rem; padding: 1.25rem; background: var(--accent-soft); border: 1px solid var(--border); border-radius: var(--radius); text-align: left; display: inline-flex; align-items: center; gap: 1rem; max-width: 600px;">
          <div style="font-size: 2rem;">🎓</div>
          <div>
            <h4 style="margin: 0; font-family: var(--font-display); font-size: 1.1rem; color: var(--ink);">Join the AI Academy Community</h4>
            <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; color: var(--ink-muted); line-height: 1.4;">Master AI engineering, access automated workflows, and connect with other builders. <a href="https://www.skool.com/ai-academy-with-robby-6849/about" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline; font-weight: 500;">Join on Skool →</a></p>
          </div>
        </div>
      </div>
      <div class="blog-grid blog-grid-index">
        ${cards}
      </div>
    </div>
  </section>
</main>

<!-- ===== FOOTER ===== -->
<footer>
  <div class="container">
    <div class="footer-bottom" style="border-top:none; padding-top:0">
      <span>© 2026 Robby J · Built with ❤️ + AI</span>
    </div>
  </div>
</footer>

<script>
  const navEl = document.querySelector('nav');
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
</script>
</body>
</html>`;
}

// ── Main Build ─────────────────────────────────────────────────────────────
function build() {
  // Ensure blog output directory exists
  if (!fs.existsSync(BLOG_OUT)) fs.mkdirSync(BLOG_OUT, { recursive: true });
  if (!fs.existsSync(POSTS_SRC)) {
    console.log('⚠️  No blog/posts/ directory found. Creating it...');
    fs.mkdirSync(POSTS_SRC, { recursive: true });
  }

  // Read all markdown files
  const files = fs.readdirSync(POSTS_SRC).filter(f => f.endsWith('.md'));

  if (files.length === 0) {
    console.log('⚠️  No markdown posts found in blog/posts/. Skipping build.');
    fs.writeFileSync(POSTS_JSON, JSON.stringify([], null, 2));
    return;
  }

  const posts = [];

  for (const file of files) {
    const slug    = slugify(file);
    const raw     = fs.readFileSync(path.join(POSTS_SRC, file), 'utf8');
    const parsed  = matter(raw);
    const fm      = parsed.data;
    const body    = parsed.content;
    // Wrap tables so wide ones scroll inside their own container instead of
    // forcing the whole page to scroll horizontally on mobile.
    const html    = marked(body)
      .replace(/<table>/g, '<div class="table-wrap"><table>')
      .replace(/<\/table>/g, '</table></div>');
    const readTime = readingTime(body);

    const post = {
      slug,
      title:     fm.title     || slug,
      date:      fm.date      || new Date().toISOString(),
      updated:   fm.updated   || null,
      excerpt:   fm.excerpt   || '',
      thumbnail: fm.thumbnail || null,
      youtubeId: fm.youtubeId || null,
      tags:      fm.tags      || [],
      readTime,
      htmlContent: html,
    };

    posts.push(post);
  }

  // Sort newest first
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Render pages in a second pass so related-post links can reference every post
  for (const post of posts) {
    const postHtml = postTemplate({ ...post, related: pickRelated(post, posts) });
    fs.writeFileSync(path.join(BLOG_OUT, `${post.slug}.html`), postHtml);
    console.log(`  ✓ Built post: ${post.slug}.html`);
  }

  // Strip rendered HTML before serializing: posts.json / posts-data.js ship to the
  // browser and only need card metadata.
  posts.forEach(p => { delete p.htmlContent; });

  // Write posts.json (backup reference)
  fs.writeFileSync(POSTS_JSON, JSON.stringify(posts, null, 2));
  console.log(`  ✓ Generated blog/posts.json (${posts.length} posts)`);

  // Write posts-data.js — embedded data, no fetch() needed on home page
  const postsDataJs = `// Auto-generated by build.js — do not edit manually\nwindow.BLOG_POSTS = ${JSON.stringify(posts, null, 2)};\n`;
  fs.writeFileSync(path.join(BLOG_OUT, 'posts-data.js'), postsDataJs);
  console.log(`  ✓ Generated blog/posts-data.js`);

  // Write blog index
  const indexHtml = blogIndexTemplate(posts);
  fs.writeFileSync(path.join(BLOG_OUT, 'index.html'), indexHtml);
  console.log(`  ✓ Generated blog/index.html`);

  // ── Generate Sitemap ──────────────────────────────────────────────────────
  const domain = 'https://automatewithrobby.fyi'; // Base domain setup
  const currentDate = new Date().toISOString().split('T')[0];

  let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Main Home Page -->
  <url>
    <loc>${domain}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <!-- Blog Index -->
  <url>
    <loc>${domain}/blog/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;

  // Add all dynamically generated blog posts to sitemap XML
  for (const post of posts) {
    const postDate = new Date(post.updated || post.date).toISOString().split('T')[0];
    sitemapXml += `  <url>
    <loc>${domain}/blog/${post.slug}.html</loc>
    <lastmod>${postDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
  }

  // Scan root for any manual HTML pages to dynamically append to sitemap (except index.html which we mapped manually)
  const manualPages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'index.html');
  for (const page of manualPages) {
    const pagePath = path.join(ROOT, page);
    const stat = fs.statSync(pagePath);
    const pageDate = stat.mtime.toISOString().split('T')[0];
    sitemapXml += `  <!-- Manual Page: ${page} -->
  <url>
    <loc>${domain}/${page}</loc>
    <lastmod>${pageDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
  }

  // Scan tools/ directory for tool pages
  const TOOLS_DIR = path.join(ROOT, 'tools');
  if (fs.existsSync(TOOLS_DIR)) {
    const toolPages = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.html'));
    for (const page of toolPages) {
      const pagePath = path.join(TOOLS_DIR, page);
      const stat = fs.statSync(pagePath);
      const pageDate = stat.mtime.toISOString().split('T')[0];
      const loc = page === 'index.html' ? `${domain}/tools/` : `${domain}/tools/${page}`;
      sitemapXml += `  <url>
    <loc>${loc}</loc>
    <lastmod>${pageDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
    }
  }

  // Scan services/ directory for service pages
  const SERVICES_DIR = path.join(ROOT, 'services');
  if (fs.existsSync(SERVICES_DIR)) {
    const servicePages = fs.readdirSync(SERVICES_DIR).filter(f => f.endsWith('.html'));
    for (const page of servicePages) {
      const pagePath = path.join(SERVICES_DIR, page);
      const stat = fs.statSync(pagePath);
      const pageDate = stat.mtime.toISOString().split('T')[0];
      const loc = page === 'index.html' ? `${domain}/services/` : `${domain}/services/${page}`;
      sitemapXml += `  <url>
    <loc>${loc}</loc>
    <lastmod>${pageDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
    }
  }

  // Scan compare/ directory for comparison pages
  const COMPARE_DIR = path.join(ROOT, 'compare');
  if (fs.existsSync(COMPARE_DIR)) {
    const comparePages = fs.readdirSync(COMPARE_DIR).filter(f => f.endsWith('.html'));
    for (const page of comparePages) {
      const pagePath = path.join(COMPARE_DIR, page);
      const stat = fs.statSync(pagePath);
      const pageDate = stat.mtime.toISOString().split('T')[0];
      const loc = page === 'index.html' ? `${domain}/compare/` : `${domain}/compare/${page}`;
      sitemapXml += `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${pageDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    }
  }

  sitemapXml += `</urlset>`;

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml);
  console.log(`  ✓ Generated sitemap.xml in root directory`);

  // ── Auto-Inject GA Tag into all root HTML files ───────────────────────────
  const gaSnippet = `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-T1RQQC7CB5"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    if (location.hostname.endsWith('automatewithrobby.fyi')) gtag('config', 'G-T1RQQC7CB5');
  </script>`;

  const rootFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  for (const htmlFile of rootFiles) {
    const filePath = path.join(ROOT, htmlFile);
    let htmlContent = fs.readFileSync(filePath, 'utf8');

    if (!htmlContent.includes('G-T1RQQC7CB5')) {
      console.log(`  ⚠️  GA Tag missing in ${htmlFile}. Auto-injecting...`);
      // Inject GA snippet right before the closing </head> tag
      htmlContent = htmlContent.replace('</head>', `${gaSnippet}\n</head>`);
      fs.writeFileSync(filePath, htmlContent, 'utf8');
      console.log(`  ✓ GA Tag successfully injected into ${htmlFile}`);
    }
  }

  console.log(`\n🚀 Build complete! ${posts.length} post(s) processed.\n`);
}

build();
