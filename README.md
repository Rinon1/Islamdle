# Islamdle

Six short Islamic puzzles, a new set every day. Static site, no backend, no
account. Pick Easy, Medium or Hard; everyone on the same level gets the same
puzzles, so scores are comparable.

```bash
python -m http.server 8777
```

Then open <http://127.0.0.1:8777/>.

---

## What the REA analysis of LoLdle found

I captured `loldle.net/classic` in headless Chrome through REA
(`capture_browser_scenario`, full network + console + frame capture), played a
round by hand, and checked the sibling sites. Everything below is observed.

### How they make money — it is advertising, all of it

314 requests across **109 distinct hosts** on a single page load. No paywall, no
subscription, no account.

| Layer | What's running |
|---|---|
| **Ad management** | **Venatus Media** (`hb.vntsm.com`) — 43 script requests. Console prints `VENATUS > Using Venatus Ad V4` |
| **Ad server** | Google Ad Manager (`securepubads.g.doubleclick.net`) |
| **Header bidding** | Prebid against ~40 SSPs: Rubicon/Magnite, PubMatic, Xandr, Index Exchange, Criteo, Amazon TAM, The Trade Desk, Ozone, Sharethrough, 360yield, Adform |
| **Identity** | ID5, LiveRamp, Hadron ID, Zeotap, Lotame, Adobe `demdex` — keeps CPMs up without logins |
| **Floor pricing** | Automatad (`floors.atmtd.com`) |
| **Consent** | Google Funding Choices — a Google-certified CMP |
| **Analytics** | GA4, GameAnalytics, Cloudflare RUM |

Secondary and much smaller: a Buy Me a Coffee link and app-store badges.
`narutodle.net`, `onepiecedle.net` and `pokedle.net` all load the identical
`hb.vntsm.com/v3/live/ad-manager.min.js`. Same operator, same monetization.

### Why it costs them almost nothing to run

There is **no application backend**:

- A static Vue SPA on Cloudflare.
- The whole game — every champion, every attribute, the daily answer — is **one
  static file**, `cache.loldle.net/cache.json` (59 KB), gated by a tiny
  `version.json` for cache-busting.
- That file is **CryptoJS-AES encrypted**: it begins `U2FsdGVkX1/`, base64 for
  `Salted__`. The key is in the JS bundle, so it is obfuscation against casual
  spoiler-scraping, not security.
- Art is hotlinked from Riot's free CDN.
- The only live endpoint is a counter (`/winners/classic?gameNumero=1564`) that
  powers "37479 people already found out!".

A static bundle, a JSON file, and a counter. **That is the whole business model.**

### The mechanics, confirmed by playing

Eight columns; guessing Ahri returned two greens, five reds, and 2011 with an up
arrow. The in-page legend defines five states: 🟩 correct, 🟧 partial (multi-value
fields that overlap), 🟥 wrong, 🔺/🔻 higher/lower on numbers. Guesses are
unlimited — you cannot lose, only take more tries. Invalid text is rejected so no
guess is wasted, cells flip in one at a time, and the footer shows yesterday's
answer plus a live solver count.

---

## What Islamdle does differently

The grid-and-attributes format was deliberately **not** copied wholesale. Guessing
an obscure companion or scholar is not fun and not useful, and "identify the
verse" and "identify the surah" are the same puzzle twice. So five of the six
modes use a different mechanic, and each ends by teaching you the answer.

### The six modes

| Mode | Mechanic | Easy | Medium | Hard |
|---|---|---|---|---|
| **Five Clues** | Clues reveal one at a time as you miss; pick the answer | Pillars and terms everyone knows | More context needed | Specific but fair |
| **Spot the Mistake** | Three statements, one is false, one attempt | Obvious error | One subtle error | Two both sound right |
| **Order the Events** | Put Seerah events in chronological order | 2 events, far apart | 3 events | 5 events, close timelines |
| **The Missing Piece** | A known set with one item removed | Sets anyone can complete | Sets you had to learn | Longer sets, order matters |
| **Ayah Scramble** | Rebuild a shuffled ayah in Arabic | 3–5 words, very familiar | 6–8 words | 9–13 words |
| **Which Surah** | The LoLdle-style comparison grid | Al-Fatihah + short surahs | Surahs of 10+ ayahs | All 114 |

Every puzzle ends with an explanation — the "guess first, learn after" half is
the point, and a wrong guess still teaches something.

### Deliberate constraints

- **No images of any person.** No portraits, no art, no emoji-guessing. The site
  ships zero image assets; it is all text, Arabic calligraphy and CSS geometry.
- **No "guess the obscure narration or scholar".** If an average Muslim could not
  reasonably get there, it does not belong on Easy or Medium.
- **Disputed matters are flagged, not flattened.** Where scholars differ on
  dating, fiqh or sequence, the explanation says so.
- **The daily answer is derived, not shipped.** It comes from the UTC date via a
  fixed hash, keyed by mode *and* level, so there is no answer field to find in
  the JSON and the three levels advance through their pools independently.
- **No repeats** until a pool is exhausted — the index walks the pool with a step
  coprime to its length.

### Layout

```
index.html            homepage: level picker, six cards, today's status
play.html             the game shell; mode and level come from the query string
privacy.html          privacy policy
css/style.css         all styling, no images
js/consent.js         consent banner + Google Consent Mode v2  (loads first)
js/core.js            daily seed, mode registry, difficulty, saved progress
js/home.js            homepage rendering
js/play.js            the six mechanics + shared scoring/sharing
data/islamdle.json    the whole game, 325 KB  <- the only runtime fetch
tools/bake.py         rebuilds that file; prints days of content per mode/level
tools/content.json    hand-authored puzzles (edit this to add content)
tools/people.json     prophets and historical figures
tools/raw/            API dumps, not deployed
```

To add puzzles, edit `tools/content.json` and run `python tools/bake.py`.

### Content runway

`bake.py` prints this on every run, and flags anything under 10:

```
five-clues     easy=  61  medium=  61  hard=  61
spot-mistake   easy=  61  medium=  61  hard=  61
order-events   easy=  63  medium=  63  hard=  62
missing-piece  easy=  60  medium=  60  hard=  60
scramble       easy= 118  medium=  63  hard= 400
```

Each number is **how many days before that mode repeats itself** — and that is
exact, not approximate: the daily index walks each pool with a step coprime to
its length, so every entry appears once per cycle and the gap between any
entry's repeats is always precisely the pool length.

That is 734 hand-authored puzzles plus the generated scramble pools, so every
mode and level runs two months or more before coming round again.

### Adding puzzles

Write new items into `tools/additions/<mode>.json` using the same shape as
`tools/content.json`, then:

```bash
python tools/merge_additions.py && python tools/bake.py
```

`merge_additions.py` validates every incoming item before writing anything — it
checks option counts, that the answer is among the options, that `wrong` is a
valid index, that each level's event count matches its tier, that decoys do not
overlap the set itself, and that nothing has an empty `explain`. It refuses to
write if any item fails, and skips duplicates, so it is safe to re-run. You can
also edit `tools/content.json` directly and just run `bake.py`.

### Data sources

Surah metadata and verse text from the Quran.com API v4 (Uthmani script for
scramble). English rendering by M. Pickthall, 1930, **public domain** — chosen
over Saheeh International specifically because it can be redistributed. Names of
Allah from the AlAdhan API. The Al Quran Cloud API was down
(`failure to get a peer from the ring-balancer`) while this was built, which is
why Quran.com is the source.

---

## Privacy and consent

`js/consent.js` loads before anything else and:

- sets **Google Consent Mode v2** to denied by default on every page load, then
  applies a stored choice as an update — so a tag added later never fires before
  consent is known;
- shows a banner with Accept all / Reject non-essential / Manage, and a
  per-purpose panel (Essential always on, Analytics, Advertising);
- stores the choice for 180 days and re-asks after that;
- exposes `IslamdleConsent.allows('ads'|'analytics')` and `.when(purpose, fn)` so
  ad and analytics scripts can be gated properly.

To gate a script on consent:

```js
IslamdleConsent.when('analytics', function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX';
  document.head.appendChild(s);
});
```

**Important:** this banner is **not an IAB TCF-certified CMP**. Google requires a
certified CMP to serve ads to users in the EEA and the UK. Funding Choices —
which is free, and is what LoLdle uses — is the usual answer. Keep `consent.js`
loading first when you add it, so the denied-by-default signal is still set.

`privacy.html` is written to match what the site actually does, and has `TODO`
markers for the four things only you can fill in: contact address, host name,
named ad partners, and the launch date.

---

## Deployment

**Live at <https://islamdle.netlify.app>**, deployed from
<https://github.com/Rinon1/Islamdle> on every push to `main`.

Netlify reads `netlify.toml`, so there is nothing to configure in the
dashboard:

| Setting | Value |
|---|---|
| Build command | `python3 tools/build_dist.py` |
| Publish directory | `dist` |
| Branch | `main` |

### Publishing a change

```bash
git add -A && git commit -m "..." && git push
```

Netlify rebuilds automatically. **Content changes need one extra step first**,
because `bake.py` does *not* run on Netlify — it needs `tools/raw/`, which is
gitignored. Re-bake locally and commit the result:

```bash
python tools/merge_additions.py && python tools/bake.py
git add data/islamdle.json tools/content.json && git commit -m "More puzzles" && git push
```

### Why the build is split this way

`tools/raw/` holds 3 MB of raw API dumps needed only to regenerate
`data/islamdle.json`. Keeping it out of the repo means Netlify's build does one
cheap thing — assemble `dist/` — while the baked data travels in git.

### What `build_dist.py` does

Copies only what the site serves (no `tools/`, no README) and appends a content
hash to every CSS and JS reference, so `_headers` can cache them for a year
while the HTML and `data/islamdle.json` always revalidate. Verified live:

```
/                      Cache-Control: public,max-age=0,must-revalidate
/css/style.css?v=…     Cache-Control: public,max-age=31536000,immutable
/data/islamdle.json    Cache-Control: public,max-age=0,must-revalidate
```

### Still to do before promoting the site

- **`privacy.html` contact address** — marked `REPLACE BEFORE PROMOTING` in the
  source. It currently reads `contact@[your-domain]`.
- **Named ad partners** in `privacy.html`, once you pick one.
- If you attach a custom domain, update the host in `sitemap.xml` and
  `robots.txt`.

### Other hosts

The same `dist/` works on Cloudflare Pages or GitHub Pages. Cloudflare reads the
same `_headers` file; GitHub Pages ignores it, so you lose the cache and
security headers but the site still works.

## Monetizing

On ads, one thing matters: **Venatus will not take a new site.** Gaming ad
managers like Venatus and Playwire have traffic minimums in the hundreds of
thousands of monthly pageviews. LoLdle is on Venatus because LoLdle is huge. The
realistic ladder:

1. **Google AdSense** from day one — no traffic minimum.
2. **Ezoic** (no real minimum) or **Monumetric** (~10k sessions/mo).
3. **Mediavine** (~50k sessions/mo) or **Raptive** (~100k) — a large step up in RPM.
4. **Venatus / Playwire** at LoLdle scale.

The daily format is what makes this work commercially: it manufactures a return
visit every day, and six modes means roughly six pageviews per visitor per day
rather than one.
