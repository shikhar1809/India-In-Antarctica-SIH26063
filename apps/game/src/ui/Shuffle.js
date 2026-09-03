/**
 * Shuffle.js — per-character "roll in" text animation.
 *
 * This is the React Bits <Shuffle> effect, rebuilt in plain DOM. The original
 * is React + GSAP + ScrollTrigger + SplitText, which is roughly 150 KB of
 * dependency for a loading screen — on a project whose entire current problem
 * is that it is too heavy, and which has no React in it at all. The effect
 * itself is a wrapper per character with a vertical/horizontal strip inside it
 * and a transform, so it is about eighty lines and no dependencies.
 *
 * Behaviour matches the original's defaults: each character becomes a
 * fixed-width window containing a strip of [real, scramble…, real]; the strip
 * starts offset by its own length and slides back to zero, so you see the
 * character tumble past a couple of wrong glyphs and land on the right one.
 * `evenodd` runs the odd characters first and starts the even ones at 70% of
 * the odd run, which is what gives it the woven, non-uniform feel rather than
 * a plain left-to-right sweep.
 */

const EASE = 'cubic-bezier(0.215, 0.61, 0.355, 1)';   // ~ power3.out
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/*';

/**
 * @param {HTMLElement} host        emptied and filled with the animated text
 * @param {string} text
 * @param {object} [opts]
 * @param {'left'|'right'} [opts.direction]
 * @param {number} [opts.duration]  seconds per character
 * @param {number} [opts.stagger]   seconds between characters
 * @param {number} [opts.shuffleTimes] wrong glyphs seen before landing
 * @returns {Promise<void>} resolves when the last character has landed
 */
export function shuffleText(host, text, opts = {}) {
  const {
    direction = 'right',
    duration = 0.35,
    stagger = 0.03,
    shuffleTimes = 1,
    scramble = true
  } = opts;

  host.textContent = '';
  host.classList.add('shuffle-parent');

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    host.textContent = text;
    host.classList.add('is-ready');
    return Promise.resolve();
  }

  // A hidden probe measures each glyph at the host's own computed font, so the
  // window widths are right whatever the CSS says.
  const probe = document.createElement('span');
  probe.className = 'shuffle-probe';
  host.appendChild(probe);

  const strips = [];
  const rolls = Math.max(1, Math.floor(shuffleTimes));

  for (const ch of Array.from(text)) {
    if (ch === ' ') {
      const sp = document.createElement('span');
      sp.className = 'shuffle-space';
      sp.textContent = ' ';
      host.appendChild(sp);
      continue;
    }
    probe.textContent = ch;
    const w = probe.getBoundingClientRect().width;

    const wrap = document.createElement('span');
    wrap.className = 'shuffle-char-wrapper';
    wrap.style.width = w + 'px';

    const strip = document.createElement('span');
    strip.className = 'shuffle-strip';

    const cell = (t) => {
      const c = document.createElement('span');
      c.className = 'shuffle-char';
      c.style.width = w + 'px';
      c.textContent = t;
      return c;
    };

    // [real, scramble…, real] — with the real glyph at both ends so the strip
    // can slide either way and still land on the right character.
    strip.appendChild(cell(ch));
    for (let k = 0; k < rolls; k++) {
      strip.appendChild(cell(scramble ? CHARSET[(Math.random() * CHARSET.length) | 0] : ch));
    }
    strip.appendChild(cell(ch));

    const steps = rolls + 1;
    // 'right': start pulled back so the glyphs travel rightwards into place.
    const startX = direction === 'right' ? -steps * w : 0;
    const finalX = direction === 'right' ? 0 : -steps * w;
    if (direction === 'right') strip.insertBefore(strip.lastElementChild, strip.firstChild);

    strip.style.transform = `translate3d(${startX}px,0,0)`;
    strip.dataset.finalX = String(finalX);

    wrap.appendChild(strip);
    host.appendChild(wrap);
    strips.push(strip);
  }

  probe.remove();
  host.classList.add('is-ready');

  if (!strips.length) return Promise.resolve();

  // evenodd: odds first, evens starting at 70% of the odd run.
  const odd = [], even = [];
  strips.forEach((s, i) => (i % 2 ? odd : even).push(s));
  const oddTotal = duration + Math.max(0, odd.length - 1) * stagger;
  const evenStart = odd.length ? oddTotal * 0.7 : 0;

  const arm = (list, base) => list.forEach((s, i) => {
    s.style.transition = `transform ${duration}s ${EASE} ${(base + i * stagger).toFixed(3)}s`;
    s.style.transform = `translate3d(${s.dataset.finalX}px,0,0)`;
  });

  // One reflow so the start transform is committed before the transition.
  void host.offsetWidth;
  arm(odd, 0);
  arm(even, evenStart);

  const total = Math.max(oddTotal, evenStart + duration + Math.max(0, even.length - 1) * stagger);
  return new Promise(res => setTimeout(res, total * 1000));
}
