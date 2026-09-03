/**
 * minigames.js — the hands-on half.
 *
 * Each of these is a small, honest simulation of a real measurement made at an
 * Indian Antarctic station. The design rule throughout: the player has to do
 * the thing before the archive record unlocks, and the thing has to teach the
 * concept rather than test whether they read the paragraph.
 *
 * Every game calls onComplete(true) on success. None of them can be failed
 * permanently — this is an outreach tool for children, so a wrong answer
 * explains itself and lets you try again.
 */

const shell = (title, sub, stage, foot) => `
  <div class="mini-head">
    <div><h2>${title}</h2><p>${sub}</p></div>
    <button class="x" data-close aria-label="Close">×</button>
  </div>
  <div class="mini-stage">${stage}</div>
  <div class="mini-foot">${foot}</div>`;

/* ============================================================== ice core */
function icecore({ ui, onComplete, station }) {
  const DEPTH = 120;       // metres to drill
  const LAYERS = 26;       // bands rendered in the core viewer

  const stage = `
    <div style="display:grid;grid-template-columns:200px 1fr;gap:26px;align-items:start">
      <div>
        <div style="position:relative;height:340px;width:74px;margin:0 auto;
             border:1px solid rgba(150,200,240,.3);border-radius:6px;overflow:hidden;background:#071722">
          <div id="ic-core" style="position:absolute;inset:0"></div>
          <div id="ic-bit" style="position:absolute;left:-9px;right:-9px;height:4px;background:#ff9933;
               box-shadow:0 0 12px #ff9933;top:0"></div>
        </div>
        <div style="text-align:center;margin-top:10px;font-family:var(--mono);font-size:12px;color:#5fd9ff">
          <b id="ic-depth">0</b> m
        </div>
      </div>
      <div>
        <p id="ic-instruction" style="font-size:14px;line-height:1.7;color:#9fbdd6">
          The drill cuts a 98&nbsp;mm cylinder of ice. Every band you pass is one year of
          snowfall, sealed with a bubble of the air that was here when it fell.
          <b style="color:#dcefff">Hold the button to drill down to 120&nbsp;m.</b>
        </p>
        <div id="ic-quiz" class="hidden" style="margin-top:6px">
          <p style="font-size:14px;line-height:1.7;color:#9fbdd6">
            Core recovered. The CO₂ trapped in each bubble has been measured.
            <b style="color:#dcefff">Click the band where the industrial era begins</b> —
            the point where the gas stops matching the previous 400,000 years.
          </p>
          <div id="ic-bands" style="display:flex;gap:3px;margin-top:16px;height:80px"></div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;
               font-family:var(--mono);font-size:10px;color:#6c8399">
            <span>120 m &nbsp;·&nbsp; oldest</span><span>surface &nbsp;·&nbsp; today</span>
          </div>
          <p id="ic-feedback" style="margin-top:14px;font-size:13px;min-height:44px"></p>
        </div>
      </div>
    </div>`;

  const foot = `
    <span class="status" id="ic-status">Drill depth 0 / ${DEPTH} m</span>
    <button class="btn primary" id="ic-drill">Hold to drill</button>`;

  // This interactable is shared code, built once and placed at BOTH
  // stations (see site.js) — it used to say "Maitri field site" no matter
  // which station actually triggered it, which reads as a factual error
  // the instant you drill this same core at Bharati. `station` (passed
  // through from main.js's interact()) is whichever one you're really at.
  const siteLabel = station ? `${station.name} field site` : 'field site';
  ui.openMini(shell('Ice Core Drilling', `Glaciology · ${siteLabel}`, stage, foot), {
    onMount(el) {
      el.querySelector('[data-close]').onclick = () => ui.closeMini();

      const core = el.querySelector('#ic-core');
      const bit = el.querySelector('#ic-bit');
      const depthEl = el.querySelector('#ic-depth');
      const status = el.querySelector('#ic-status');
      const btn = el.querySelector('#ic-drill');

      // Render the core column: alternating summer/winter bands, getting
      // thinner with depth because deeper ice is compressed.
      let html = '';
      for (let i = 0; i < LAYERS; i++) {
        const t = i / LAYERS;
        const h = 100 / LAYERS * (1.35 - t * 0.7);
        const light = i % 2 === 0;
        const c = light ? `rgba(214,236,250,${0.95 - t * 0.25})` : `rgba(150,196,224,${0.9 - t * 0.2})`;
        html += `<div style="height:${h}%;background:${c}"></div>`;
      }
      core.innerHTML = html;

      let depth = 0, drilling = false, done = false;
      const tick = () => {
        if (drilling && depth < DEPTH) {
          depth = Math.min(DEPTH, depth + 1.4);
          depthEl.textContent = Math.round(depth);
          status.textContent = `Drill depth ${Math.round(depth)} / ${DEPTH} m`;
          bit.style.top = `${(depth / DEPTH) * 100}%`;
          if (depth >= DEPTH && !done) { done = true; toQuiz(); }
        }
        if (!done) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      const down = e => { e.preventDefault(); drilling = true; };
      const up = () => { drilling = false; };
      btn.addEventListener('pointerdown', down);
      window.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);

      function toQuiz() {
        btn.disabled = true;
        btn.textContent = 'Core recovered';
        el.querySelector('#ic-instruction').classList.add('hidden');
        el.querySelector('#ic-quiz').classList.remove('hidden');

        const bands = el.querySelector('#ic-bands');
        const N = 20;
        // The correct answer is the last band: the surface, i.e. now.
        const answer = N - 1;
        for (let i = 0; i < N; i++) {
          const b = document.createElement('button');
          const t = i / (N - 1);
          // CO2 climbs sharply only in the final band.
          const co2 = i === N - 1 ? 1 : 0.28 + Math.sin(i * 1.3) * 0.12 + t * 0.06;
          b.style.cssText = `flex:1;border:0;border-radius:3px;cursor:pointer;align-self:flex-end;
            height:${20 + co2 * 80}%;background:${i === N - 1 ? '#ff9933' : '#3d7fa8'};
            transition:transform .12s`;
          b.onmouseenter = () => b.style.transform = 'scaleY(1.06)';
          b.onmouseleave = () => b.style.transform = '';
          b.onclick = () => {
            const fb = el.querySelector('#ic-feedback');
            if (i === answer) {
              fb.innerHTML = `<b style="color:#7ef0a0">That is the one.</b>
                For 400,000 years CO₂ stayed between roughly 180 and 300 parts per million.
                In the last 150 years it has gone past 420 — higher than anything in the
                entire core, and it happened in the width of that single band.`;
              status.textContent = 'Analysis complete';
              btn.disabled = false;
              btn.textContent = 'Archive the dataset';
              btn.onclick = () => onComplete(true);
              btn.removeEventListener('pointerdown', down);
            } else {
              fb.innerHTML = `<span style="color:#ffcf5c">Not quite.</span>
                That band sits inside the natural range — its CO₂ looks like every other
                glacial cycle. Look for the one that breaks the pattern completely.`;
            }
          };
          bands.appendChild(b);
        }
      }
    }
  });
}

/* =============================================================== weather */
function weather({ ui, onComplete, stationId, station }) {
  // Shared code, one function triggered from BOTH stations (see site.js) —
  // this used to always ask about Maitri specifically, including a mean
  // winter temperature that is flatly wrong for Bharati's much milder,
  // coastal setting. Two real question sets, chosen by whichever station
  // actually called this, instead of one hardcoded to whichever station
  // happened to get written first.
  const name = station?.name ?? 'the station';
  const QUESTIONS_BY_STATION = {
    maitri: [
      {
        q: `The wind at ${name} blows almost constantly from the same direction. Why?`,
        a: [
          'Cold dense air drains downhill off the polar plateau under its own weight',
          'The Earth\'s rotation drags air across the continent',
          'Warm air rising off the coast pulls wind inland'
        ],
        correct: 0,
        why: 'This is a katabatic wind. Maitri sits right at the edge of the polar plateau — air over the high interior cools, gets dense, and flows downhill past the station, sometimes for days, reaching over 90 knots. It is gravity, not a pressure system.'
      },
      {
        q: `It is July at ${name}. What is the air temperature likely to be?`,
        a: ['About −5 °C', 'About −32 °C', 'About +2 °C'],
        correct: 1,
        why: `July is deep winter in the southern hemisphere. Mean winter temperature at ${name} runs around −32 °C, with records near −38 °C — and the sun does not rise at all.`
      }
    ],
    bharati: [
      {
        q: `${name} sits right on the coast, not inland like Maitri. What does that actually change about its weather?`,
        a: [
          'Nothing — every Indian Antarctic station has identical conditions',
          'Katabatic wind off the plateau is weaker here, but storms off the open Southern Ocean hit harder',
          'The station is too far north to count as genuinely Antarctic weather'
        ],
        correct: 1,
        why: 'Bharati is built on rock in the Larsemann Hills, right at the edge of Prydz Bay — there is no long plateau slope feeding it a steady katabatic wind the way there is at Maitri. What it gets instead is direct exposure to Southern Ocean storm systems, which is its own kind of violent.'
      },
      {
        q: `It is July at ${name}. What is the air temperature likely to be?`,
        a: ['About −22 °C', 'About −45 °C', 'About −2 °C'],
        correct: 0,
        why: `Coastal Antarctic stations run noticeably milder than plateau-edge ones — the ocean underneath the sea ice moderates the extremes. ${name}'s winter temperatures typically sit in the −20s °C, cold but well short of the deep interior's −40s.`
      }
    ]
  };
  const first = QUESTIONS_BY_STATION[stationId] ?? QUESTIONS_BY_STATION.bharati;
  const Q = [
    ...first,
    {
      q: 'Why does India run weather instruments 12,000 km from home?',
      a: [
        'To practise for future Arctic missions',
        'Because the Antarctic Treaty requires each station to report weather',
        'Because Southern Ocean conditions help predict the Indian monsoon'
      ],
      correct: 2,
      why: 'Sea-ice extent around Antarctica changes the temperature gradient across the Indian Ocean, and that gradient helps set the timing and strength of the southwest monsoon. It is monsoon forecasting, done from the other end of the planet.'
    }
  ];

  let i = 0, right = 0;

  const render = (el) => {
    const q = Q[i];
    el.querySelector('.mini-stage').innerHTML = `
      <div style="font-family:var(--mono);font-size:11px;color:#5fd9ff;letter-spacing:.1em">
        READING ${i + 1} OF ${Q.length}
      </div>
      <p style="margin-top:10px;font-size:17px;font-weight:600;color:#fff;line-height:1.5">${q.q}</p>
      <div id="w-opts" style="margin-top:20px;display:flex;flex-direction:column;gap:10px"></div>
      <p id="w-why" style="margin-top:16px;font-size:13.5px;line-height:1.7;color:#9fbdd6;min-height:60px"></p>`;

    const opts = el.querySelector('#w-opts');
    q.a.forEach((text, k) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.style.cssText = 'text-align:left;justify-content:flex-start;font-weight:500;line-height:1.45';
      b.textContent = text;
      b.onclick = () => {
        [...opts.children].forEach(c => c.disabled = true);
        const why = el.querySelector('#w-why');
        if (k === q.correct) {
          right++;
          b.style.borderColor = '#7ef0a0';
          b.style.background = 'rgba(126,240,160,.14)';
          why.innerHTML = `<b style="color:#7ef0a0">Correct.</b> ${q.why}`;
        } else {
          b.style.borderColor = '#ffcf5c';
          b.style.background = 'rgba(255,207,92,.12)';
          opts.children[q.correct].style.borderColor = '#7ef0a0';
          opts.children[q.correct].style.background = 'rgba(126,240,160,.14)';
          why.innerHTML = `<b style="color:#ffcf5c">The answer is the highlighted one.</b> ${q.why}`;
        }
        const next = el.querySelector('#w-next');
        next.disabled = false;
        next.textContent = i === Q.length - 1 ? 'Archive the dataset' : 'Next reading';
      };
      opts.appendChild(b);
    });

    el.querySelector('#w-status').textContent = `${right} of ${Q.length} correct so far`;
  };

  ui.openMini(shell(
    'Automatic Weather Station',
    'Meteorology · hourly record, transmitted by satellite through the winter',
    '',
    `<span class="status" id="w-status"></span>
     <button class="btn primary" id="w-next" disabled>Next reading</button>`
  ), {
    onMount(el) {
      el.querySelector('[data-close]').onclick = () => ui.closeMini();
      el.querySelector('#w-next').onclick = () => {
        if (i === Q.length - 1) { onComplete(true); return; }
        i++;
        el.querySelector('#w-next').disabled = true;
        render(el);
      };
      render(el);
    }
  });
}

/* ================================================================= ozone */
function ozone({ ui, onComplete, station }) {
  const stage = `
    <p style="font-size:14px;line-height:1.7;color:#9fbdd6">
      The spectrophotometer compares two ultraviolet wavelengths: one that ozone absorbs
      strongly, one it barely touches. The difference gives the total ozone in the column
      above you, in <b style="color:#dcefff">Dobson Units</b>.
      <br><br><b style="color:#dcefff">Aim the instrument at the sun</b> — slide until the
      signal peaks, then take the reading.
    </p>
    <div style="margin-top:22px;border:1px solid rgba(150,200,240,.2);border-radius:12px;
         padding:20px;background:#071722">
      <canvas id="oz-canvas" style="width:100%;display:block;border-radius:8px"></canvas>
      <input type="range" id="oz-aim" min="0" max="100" value="8"
             style="width:100%;margin-top:16px;accent-color:#ff9933">
      <div style="display:flex;justify-content:space-between;margin-top:8px;
           font-family:var(--mono);font-size:11px;color:#6c8399">
        <span>Signal strength <b id="oz-sig" style="color:#5fd9ff">12%</b></span>
        <span>Column ozone <b id="oz-du" style="color:#5fd9ff">— DU</b></span>
      </div>
    </div>
    <p id="oz-verdict" style="margin-top:16px;font-size:13.5px;line-height:1.7;min-height:56px"></p>`;

  ui.openMini(shell(
    'Ozone Spectrophotometer',
    `Atmospheric science · ${station?.name ?? 'the station'}'s own record, part of the measurement that proved a global treaty worked`,
    stage,
    `<span class="status" id="oz-status">Instrument not aligned</span>
     <button class="btn primary" id="oz-take" disabled>Take reading</button>`
  ), {
    onMount(el) {
      el.querySelector('[data-close]').onclick = () => ui.closeMini();

      const cv = el.querySelector('#oz-canvas');
      const aim = el.querySelector('#oz-aim');
      const sigEl = el.querySelector('#oz-sig');
      const duEl = el.querySelector('#oz-du');
      const take = el.querySelector('#oz-take');
      const status = el.querySelector('#oz-status');

      const PEAK = 68;   // the aim value that maximises signal
      let aligned = false;

      function draw() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cv.clientWidth || 600, h = 150;
        cv.width = w * dpr; cv.height = h * dpr;
        cv.style.height = h + 'px';
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);

        const v = +aim.value;
        const off = Math.abs(v - PEAK) / 100;
        const signal = Math.max(0.04, Math.exp(-off * off * 42));

        // Spectrum trace: two absorption notches, riding on noise that shrinks
        // as the instrument comes onto the sun.
        g.strokeStyle = '#5fd9ff'; g.lineWidth = 1.8; g.beginPath();
        for (let x = 0; x <= w; x++) {
          const t = x / w;
          const notch1 = Math.exp(-Math.pow((t - 0.32) / 0.045, 2)) * 0.55 * signal;
          const notch2 = Math.exp(-Math.pow((t - 0.58) / 0.035, 2)) * 0.22 * signal;
          const noise = (Math.sin(x * 0.7) + Math.sin(x * 1.9)) * 0.02 * (1 - signal);
          const y = h - 12 - (signal * 0.72 - notch1 - notch2 + noise) * (h - 30);
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();

        g.fillStyle = 'rgba(255,153,51,.16)';
        g.fillRect(w * 0.29, 0, w * 0.06, h);
        g.fillStyle = '#6c8399'; g.font = '10px "JetBrains Mono", monospace';
        g.fillText('O₃ absorption', w * 0.29, 14);

        const pct = Math.round(signal * 100);
        sigEl.textContent = pct + '%';
        aligned = pct >= 92;
        take.disabled = !aligned;
        status.textContent = aligned
          ? 'Instrument aligned — ready'
          : pct > 55 ? 'Close, keep adjusting' : 'Instrument not aligned';
        if (!aligned) duEl.textContent = '— DU';
      }

      aim.addEventListener('input', draw);
      window.addEventListener('resize', draw);
      draw();

      take.onclick = () => {
        const du = 148;   // a springtime hole reading
        duEl.textContent = du + ' DU';
        el.querySelector('#oz-verdict').innerHTML = `
          <b style="color:#ffcf5c">${du} DU — that is inside the hole.</b>
          Anything under 220 DU counts as ozone-hole conditions. Readings like this,
          taken from Antarctic stations through the 1980s, are what forced the
          <b style="color:#dcefff">Montreal Protocol</b> in 1987.
          The ozone layer is now recovering and should reach 1980 levels around
          <b style="color:#dcefff">2066</b> — the clearest proof we have that a global
          environmental agreement can actually work.`;
        status.textContent = 'Reading logged';
        take.textContent = 'Archive the dataset';
        take.onclick = () => onComplete(true);
      };
    }
  });
}

/* ================================================================= krill */
function krill({ ui, onComplete, stationId, station }) {
  const TARGET = 12;
  const TIME = 26;
  // Shared code, placed at both stations — but Maitri sits roughly 100 km
  // inland of the coast, so "a net haul just came up" doesn't hold up
  // there the way "Prydz Bay net haul, Bharati station" (the old hardcoded
  // text) claimed regardless of which station actually triggered it. Same
  // sample-sorting task either way; only the honest framing of where the
  // catch came from changes.
  const subtitle = stationId === 'maitri'
    ? `Marine biology · sample from the coastal survey run, ${station?.name ?? 'the station'}`
    : `Marine biology · Prydz Bay net haul, ${station?.name ?? 'the station'} station`;

  const stage = `
    <p style="font-size:14px;line-height:1.7;color:#9fbdd6">
      The net came up full. Before the sample is preserved, it has to be sorted —
      krill counted, everything else set aside. <b style="color:#dcefff">Click every
      Antarctic krill</b> (the orange, shrimp-shaped ones). Ignore the copepods,
      salps and larvae.
    </p>
    <div id="kr-tray" style="position:relative;margin-top:18px;height:340px;border-radius:12px;
         border:1px solid rgba(150,200,240,.2);overflow:hidden;
         background:radial-gradient(120% 100% at 50% 0%,#0b2434,#061420)"></div>`;

  ui.openMini(shell(
    'Krill Sample Sorting',
    subtitle,
    stage,
    `<span class="status" id="kr-status">0 / ${TARGET} krill · ${TIME}s</span>
     <button class="btn primary" id="kr-done" disabled>Archive the dataset</button>`
  ), {
    onMount(el) {
      el.querySelector('[data-close]').onclick = () => { clearInterval(timer); ui.closeMini(); };

      const tray = el.querySelector('#kr-tray');
      const status = el.querySelector('#kr-status');
      const done = el.querySelector('#kr-done');
      let found = 0, wrong = 0, time = TIME, finished = false;

      const W = tray.clientWidth || 700, H = 340;

      const make = (isKrill, i) => {
        const d = document.createElement('div');
        const size = isKrill ? 26 + Math.random() * 10 : 10 + Math.random() * 14;
        const x = 14 + Math.random() * (W - 40);
        const y = 14 + Math.random() * (H - 40);
        d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size * 0.42}px;
          border-radius:${size}px / ${size * 0.3}px;cursor:pointer;
          transform:rotate(${Math.random() * 360}deg);
          background:${isKrill
            ? 'linear-gradient(90deg,#ff9d4d,#ff6a1f)'
            : ['#7fb8d8', '#9fd0c0', '#c0b8e0'][i % 3]};
          box-shadow:0 0 ${isKrill ? 10 : 4}px ${isKrill ? 'rgba(255,140,60,.5)' : 'rgba(140,190,220,.3)'};
          transition:transform .15s, opacity .2s`;
        // Krill get an eye and a tail fan — enough to be recognisably shrimp-like.
        if (isKrill) {
          d.innerHTML = `<i style="position:absolute;left:8%;top:14%;width:${size * 0.13}px;
            height:${size * 0.13}px;border-radius:50%;background:#241000"></i>`;
        }
        d.onclick = () => {
          if (finished) return;
          if (isKrill) {
            found++;
            d.style.transform += ' scale(0)';
            d.style.opacity = '0';
            setTimeout(() => d.remove(), 200);
          } else {
            wrong++;
            d.style.boxShadow = '0 0 12px rgba(255,90,90,.9)';
            setTimeout(() => d.style.boxShadow = '', 350);
          }
          update();
        };
        return d;
      };

      for (let i = 0; i < TARGET; i++) tray.appendChild(make(true, i));
      for (let i = 0; i < 26; i++) tray.appendChild(make(false, i));

      function update() {
        status.textContent = `${found} / ${TARGET} krill · ${time}s` +
          (wrong ? ` · ${wrong} misidentified` : '');
        if (found >= TARGET && !finished) finish(true);
      }

      const timer = setInterval(() => {
        time--;
        if (time <= 0) finish(false);
        else update();
      }, 1000);

      function finish(win) {
        finished = true;
        clearInterval(timer);
        done.disabled = false;
        const tally = document.createElement('div');
        tally.style.cssText = `position:absolute;inset:0;display:grid;place-items:center;
          background:rgba(4,12,20,.88);text-align:center;padding:30px`;
        tally.innerHTML = win
          ? `<div><div style="font-family:var(--disp);font-size:34px;color:#7ef0a0">
               ${found} krill counted</div>
             <p style="margin-top:12px;font-size:13.5px;line-height:1.7;color:#9fbdd6;max-width:460px">
               Scaled up, this is how CCAMLR sets the catch limit for the entire
               commercial krill fishery. Krill graze on algae under the sea ice —
               less ice means fewer krill, and almost everything larger in the
               Southern Ocean eats them or eats something that does.</p></div>`
          : `<div><div style="font-family:var(--disp);font-size:30px;color:#ffcf5c">
               Time — ${found} of ${TARGET} counted</div>
             <p style="margin-top:12px;font-size:13.5px;color:#9fbdd6;max-width:460px">
               Good enough for a first pass. Real sorting takes hours per haul,
               and every sample is counted twice.</p></div>`;
        tray.appendChild(tally);
        status.textContent = win ? 'Sample sorted' : 'Partial count logged';
      }

      done.onclick = () => { clearInterval(timer); onComplete(true); };
    }
  });
}

export const MINIGAMES = { icecore, weather, ozone, krill };
