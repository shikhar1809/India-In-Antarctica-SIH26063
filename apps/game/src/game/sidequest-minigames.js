/**
 * sidequest-minigames.js — hands-on content for the optional side quests
 * defined in data/sidequests.js.
 *
 * Same contract as game/minigames.js: each export is `({ ui, onComplete }) => {}`,
 * builds its markup with `ui.openMini(html, { onMount })`, reuses the existing
 * `.mini-head` / `.mini-stage` / `.mini-foot` chrome from ui/style.css, and
 * calls `onComplete(true)` once the player finishes. Nothing here can be
 * failed permanently — a miss just explains itself and lets the player retry.
 *
 * This file is intentionally self-contained (its own `shell()` helper) so it
 * does not need to import from minigames.js while that file is being edited
 * elsewhere.
 */

const shell = (title, sub, stage, foot) => `
  <div class="mini-head">
    <div><h2>${title}</h2><p>${sub}</p></div>
    <button class="x" data-close aria-label="Close">×</button>
  </div>
  <div class="mini-stage">${stage}</div>
  <div class="mini-foot">${foot}</div>`;

/* ======================================================= wildlife census */
function wildlifeCensus({ ui, onComplete }) {
  const SEALS = 6;
  const SKUAS = 6;
  const TARGET = SEALS + SKUAS;
  const TIME = 32;

  const stage = `
    <p style="font-size:14px;line-height:1.7;color:#9fbdd6">
      The transect runs the same line every season. <b style="color:#dcefff">Click every Weddell
      seal (grey, hauled out on the rock) and every south polar skua (dark, standing or perched)</b>.
      Leave the bare rock and the snow patches alone — they don't count themselves.
    </p>
    <div id="wc-scene" style="position:relative;margin-top:18px;height:340px;border-radius:12px;
         border:1px solid rgba(150,200,240,.2);overflow:hidden;
         background:linear-gradient(180deg,#0d2436 0%,#122c3c 46%,#3a3229 47%,#4a4236 100%)"></div>`;

  ui.openMini(shell(
    'Larsemann Hills Wildlife Census',
    'Wildlife Institute of India · coastal transect, Bharati station',
    stage,
    `<span class="status" id="wc-status">0 / ${TARGET} logged · ${TIME}s</span>
     <button class="btn primary" id="wc-done" disabled>Archive the dataset</button>`
  ), {
    onMount(el) {
      el.querySelector('[data-close]').onclick = () => { clearInterval(timer); ui.closeMini(); };

      const scene = el.querySelector('#wc-scene');
      const status = el.querySelector('#wc-status');
      const done = el.querySelector('#wc-done');
      let found = 0, wrong = 0, time = TIME, finished = false;

      const W = scene.clientWidth || 700, H = 340;

      const make = (kind) => {
        const d = document.createElement('div');
        const isAnimal = kind === 'seal' || kind === 'skua';
        const x = 12 + Math.random() * (W - 40);
        const y = 60 + Math.random() * (H - 90);
        d.style.cssText = 'position:absolute;cursor:pointer;transition:transform .15s, opacity .2s';
        d.style.left = x + 'px';
        d.style.top = y + 'px';

        if (kind === 'seal') {
          const size = 30 + Math.random() * 16;
          d.style.width = size + 'px';
          d.style.height = (size * 0.46) + 'px';
          d.style.borderRadius = size + 'px / ' + (size * 0.32) + 'px';
          d.style.background = 'linear-gradient(100deg,#8a7c6a,#5f5548)';
          d.style.boxShadow = '0 3px 8px rgba(0,0,0,.4)';
          d.style.transform = `rotate(${Math.random() * 40 - 20}deg)`;
          d.innerHTML = `<i style="position:absolute;left:12%;top:22%;width:${size * 0.1}px;
            height:${size * 0.1}px;border-radius:50%;background:#100c08"></i>`;
        } else if (kind === 'skua') {
          const size = 16 + Math.random() * 8;
          d.style.width = size + 'px';
          d.style.height = (size * 0.9) + 'px';
          d.style.background = '#2a2420';
          d.style.clipPath = 'polygon(50% 0%, 100% 70%, 70% 100%, 50% 78%, 30% 100%, 0% 70%)';
          d.style.boxShadow = '0 0 6px rgba(0,0,0,.5)';
        } else if (kind === 'rock') {
          const size = 14 + Math.random() * 22;
          d.style.width = size + 'px';
          d.style.height = (size * 0.7) + 'px';
          d.style.background = ['#4a4236', '#57503f', '#3d3729'][Math.floor(Math.random() * 3)];
          d.style.clipPath = 'polygon(10% 30%, 35% 0%, 75% 8%, 100% 45%, 85% 90%, 40% 100%, 0% 70%)';
        } else { // ice patch
          const size = 20 + Math.random() * 26;
          d.style.width = size + 'px';
          d.style.height = (size * 0.5) + 'px';
          d.style.borderRadius = '50%';
          d.style.background = 'rgba(220,239,255,.5)';
        }

        d.onclick = () => {
          if (finished) return;
          if (isAnimal) {
            found++;
            d.style.transform += ' scale(0)';
            d.style.opacity = '0';
            setTimeout(() => d.remove(), 200);
          } else {
            wrong++;
            d.style.boxShadow = '0 0 10px rgba(255,90,90,.9)';
            setTimeout(() => d.style.boxShadow = '', 350);
          }
          update();
        };
        return d;
      };

      for (let i = 0; i < SEALS; i++) scene.appendChild(make('seal'));
      for (let i = 0; i < SKUAS; i++) scene.appendChild(make('skua'));
      for (let i = 0; i < 16; i++) scene.appendChild(make('rock'));
      for (let i = 0; i < 10; i++) scene.appendChild(make('ice'));

      function update() {
        status.textContent = `${found} / ${TARGET} logged · ${time}s` +
          (wrong ? ` · ${wrong} false positive${wrong === 1 ? '' : 's'}` : '');
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
               ${found} animals logged</div>
             <p style="margin-top:12px;font-size:13.5px;line-height:1.7;color:#9fbdd6;max-width:460px">
               This is the whole method: walk the line, count what's there, write it down — every
               season, the same transect. A single count means little. Thirty years of counts, run by
               the <b style="color:#dcefff">Wildlife Institute of India</b>, is how a change in the
               Larsemann Hills food web would actually be caught early.</p></div>`
          : `<div><div style="font-family:var(--disp);font-size:30px;color:#ffcf5c">
               Time — ${found} of ${TARGET} logged</div>
             <p style="margin-top:12px;font-size:13.5px;color:#9fbdd6;max-width:460px">
               Good enough for a first pass. Real transects are walked slowly and checked twice —
               nobody counts a whole colony in half a minute.</p></div>`;
        scene.appendChild(tally);
        status.textContent = win ? 'Census logged' : 'Partial census logged';
      }

      done.onclick = () => { clearInterval(timer); onComplete(true); };
    }
  });
}

/* ========================================================= geomagnetic */
function geomagnetic({ ui, onComplete }) {
  const NEEDED = 3; // storm events to catch

  const stage = `
    <p style="font-size:14px;line-height:1.7;color:#9fbdd6">
      The magnetometer logs the horizontal field strength once a second. Most of the trace just
      drifts near zero. <b style="color:#dcefff">Watch for a swing outside the quiet band, and click
      "Log storm" while it's happening</b> — catch three separate events to complete the log.
    </p>
    <div style="margin-top:22px;border:1px solid rgba(150,200,240,.2);border-radius:12px;
         padding:20px;background:#071722">
      <canvas id="gm-canvas" style="width:100%;display:block;border-radius:8px"></canvas>
      <div style="display:flex;justify-content:space-between;margin-top:14px;
           font-family:var(--mono);font-size:11px;color:#6c8399">
        <span>Field deviation <b id="gm-val" style="color:#5fd9ff">0 nT</b></span>
        <span>Storms logged <b id="gm-count" style="color:#5fd9ff">0 / ${NEEDED}</b></span>
      </div>
    </div>
    <p id="gm-feedback" style="margin-top:14px;font-size:13.5px;line-height:1.7;min-height:60px"></p>`;

  ui.openMini(shell(
    'Geomagnetic Observatory',
    'Indian Institute of Geomagnetism · live magnetometer trace, Maitri',
    stage,
    `<span class="status" id="gm-status">Watching the trace</span>
     <button class="btn primary" id="gm-log">Log storm event</button>`
  ), {
    onMount(el) {
      let raf = null;
      el.querySelector('[data-close]').onclick = () => { cancelAnimationFrame(raf); ui.closeMini(); };

      const cv = el.querySelector('#gm-canvas');
      const valEl = el.querySelector('#gm-val');
      const countEl = el.querySelector('#gm-count');
      const status = el.querySelector('#gm-status');
      const logBtn = el.querySelector('#gm-log');
      const feedback = el.querySelector('#gm-feedback');

      const N = 260;              // points on screen
      const history = new Array(N).fill(0);
      let t = 0;
      let inStorm = false, stormTimer = 0, stormAmp = 0, quietTimer = 90 + Math.random() * 90;
      let caught = 0, thisStormLogged = false, finished = false;

      function step() {
        // Quiet baseline noise, punctuated by randomly-timed storm bursts.
        if (!inStorm) {
          quietTimer--;
          if (quietTimer <= 0) {
            inStorm = true;
            thisStormLogged = false;
            stormAmp = 140 + Math.random() * 160;
            stormTimer = 55 + Math.random() * 40;
          }
        } else {
          stormTimer--;
          if (stormTimer <= 0) {
            inStorm = false;
            quietTimer = 110 + Math.random() * 130;
          }
        }

        const noise = (Math.sin(t * 0.31) + Math.sin(t * 0.07) * 1.4) * 8 + (Math.random() - 0.5) * 6;
        const storm = inStorm ? Math.sin(stormTimer * 0.35) * stormAmp * (stormTimer / 95) : 0;
        const value = noise + storm;

        history.shift();
        history.push(value);
        t++;

        valEl.textContent = `${value >= 0 ? '+' : ''}${Math.round(value)} nT`;
        valEl.style.color = inStorm ? '#ff9933' : '#5fd9ff';
        status.textContent = inStorm ? 'Field disturbed — swinging outside the quiet band' : 'Watching the trace';

        draw(value);
        if (!finished) raf = requestAnimationFrame(step);
      }

      function draw() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cv.clientWidth || 600, h = 170;
        cv.width = w * dpr; cv.height = h * dpr;
        cv.style.height = h + 'px';
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);

        const mid = h / 2;
        const scale = (h * 0.42) / 320;

        // Quiet band.
        g.fillStyle = 'rgba(95,217,255,.08)';
        g.fillRect(0, mid - 80 * scale, w, 160 * scale);

        g.strokeStyle = inStorm ? '#ff9933' : '#5fd9ff';
        g.lineWidth = 1.8;
        g.beginPath();
        for (let i = 0; i < N; i++) {
          const x = (i / (N - 1)) * w;
          const y = mid - history[i] * scale;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();

        g.strokeStyle = 'rgba(150,200,240,.25)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();

        g.fillStyle = '#6c8399';
        g.font = '10px "JetBrains Mono", monospace';
        g.fillText('quiet band', 6, mid - 84 * scale - 4);
      }

      raf = requestAnimationFrame(step);

      logBtn.onclick = () => {
        if (finished) return;
        if (inStorm && !thisStormLogged) {
          thisStormLogged = true;
          caught++;
          countEl.textContent = `${caught} / ${NEEDED}`;
          feedback.innerHTML = `<b style="color:#7ef0a0">Storm logged.</b> That swing is a real
            geomagnetic disturbance — the field line getting shoved by the solar wind arriving minutes earlier.`;
          if (caught >= NEEDED) {
            finished = true;
            cancelAnimationFrame(raf);
            status.textContent = 'Log complete';
            feedback.innerHTML = `<b style="color:#7ef0a0">Three events logged.</b> A swing like this
              is a <b style="color:#dcefff">geomagnetic storm</b>, triggered when a coronal mass
              ejection from the Sun reaches Earth and pushes the magnetic field around. The same
              storms induce currents in power grids and pipelines and scramble satellite navigation —
              which is why observatories in the international <b style="color:#dcefff">IAGA</b>
              network, Maitri included, watch this trace around the clock rather than checking it
              once a day.`;
            logBtn.textContent = 'Archive the dataset';
            logBtn.onclick = () => onComplete(true);
          }
        } else if (inStorm) {
          feedback.innerHTML = `<span style="color:#ffcf5c">Already logged this one.</span>
            Wait for the trace to settle and swing again.`;
        } else {
          feedback.innerHTML = `<span style="color:#ffcf5c">Nothing to log yet.</span>
            The field is still inside the quiet band — wait for a real swing.`;
        }
      };
    }
  });
}

/* ========================================================== seismology */
function seismology({ ui, onComplete }) {
  const stage = `
    <p style="font-size:14px;line-height:1.7;color:#9fbdd6">
      The seismometer sits on bare Antarctic rock — about as quiet a listening post as exists on
      Earth. <b style="color:#dcefff">Watch the trace. The moment an earthquake waveform rises out
      of the noise, click "Flag anomaly"</b> before it scrolls past.
    </p>
    <div style="margin-top:22px;border:1px solid rgba(150,200,240,.2);border-radius:12px;
         padding:20px;background:#071722">
      <canvas id="sm-canvas" style="width:100%;display:block;border-radius:8px"></canvas>
    </div>
    <p id="sm-feedback" style="margin-top:14px;font-size:13.5px;line-height:1.7;min-height:60px"></p>`;

  ui.openMini(shell(
    'Seismology Watch',
    'International Seismological Centre / GSN feed · Maitri station',
    stage,
    `<span class="status" id="sm-status">Trace nominal</span>
     <button class="btn primary" id="sm-action">Flag anomaly</button>`
  ), {
    onMount(el) {
      let raf = null;
      el.querySelector('[data-close]').onclick = () => { cancelAnimationFrame(raf); ui.closeMini(); };

      const cv = el.querySelector('#sm-canvas');
      const status = el.querySelector('#sm-status');
      const action = el.querySelector('#sm-action');
      const feedback = el.querySelector('#sm-feedback');

      const N = 300;
      const history = new Array(N).fill(0);
      let t = 0;
      let phase = 'watch';      // watch -> flagged -> done
      let quakeActive = false, flaggedThisQuake = false;
      let quakeTimer = 130 + Math.random() * 120, quakeLife = 0;
      let finished = false;

      function step() {
        if (phase === 'watch') {
          if (!quakeActive) {
            quakeTimer--;
            if (quakeTimer <= 0) { quakeActive = true; flaggedThisQuake = false; quakeLife = 70; }
          } else {
            quakeLife--;
            if (quakeLife <= 0) {
              quakeActive = false;
              quakeTimer = 150 + Math.random() * 150;
              if (!flaggedThisQuake) {
                feedback.innerHTML = `<span style="color:#ffcf5c">Missed it.</span>
                  That waveform has scrolled past. Another one will come through — stay on the trace.`;
              }
            }
          }
        }

        const noise = (Math.random() - 0.5) * 10 + Math.sin(t * 0.4) * 3;
        // P-wave then larger S-wave envelope while a quake is active.
        const q = quakeActive ? Math.sin((70 - quakeLife) * 0.5) * (1 - quakeLife / 70) * 130
          * Math.exp(-Math.pow((quakeLife - 30) / 40, 2)) : 0;
        const value = noise + q;

        history.shift();
        history.push(value);
        t++;

        status.textContent = phase !== 'watch' ? status.textContent
          : quakeActive ? 'Anomaly on the trace — flag it now' : 'Trace nominal';

        draw();
        if (!finished) raf = requestAnimationFrame(step);
      }

      function draw() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cv.clientWidth || 600, h = 170;
        cv.width = w * dpr; cv.height = h * dpr;
        cv.style.height = h + 'px';
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);

        const mid = h / 2;
        const scale = (h * 0.45) / 160;

        g.strokeStyle = quakeActive ? '#ff5a5a' : '#5fd9ff';
        g.lineWidth = 1.6;
        g.beginPath();
        for (let i = 0; i < N; i++) {
          const x = (i / (N - 1)) * w;
          const y = mid - history[i] * scale;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();

        g.strokeStyle = 'rgba(150,200,240,.2)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
      }

      raf = requestAnimationFrame(step);

      action.onclick = () => {
        if (finished) return;
        if (phase === 'watch') {
          if (quakeActive && !flaggedThisQuake) {
            flaggedThisQuake = true;
            phase = 'flagged';
            status.textContent = 'Anomaly flagged';
            feedback.innerHTML = `<b style="color:#7ef0a0">Caught it.</b>
              That's a real earthquake waveform — a fast P-wave arrival followed by the larger,
              slower S-wave. Ready to send it on.`;
            action.textContent = 'Transmit to ISC';
          } else {
            feedback.innerHTML = `<span style="color:#ffcf5c">Nothing to flag right now.</span>
              The trace is nominal — wait for a real waveform to rise out of the noise.`;
          }
        } else if (phase === 'flagged') {
          finished = true;
          phase = 'done';
          cancelAnimationFrame(raf);
          status.textContent = 'Pick transmitted';
          feedback.innerHTML = `<b style="color:#7ef0a0">Sent.</b> Maitri's seismometer sits on bare
            rock a very long way from traffic, industry or crowds — one of the quietest listening
            posts on the planet, which lets it pick out a faint, distant signal that would be lost in
            noise almost anywhere else. Feeds like this one are pooled by the
            <b style="color:#dcefff">International Seismological Centre</b> and the
            <b style="color:#dcefff">Global Seismographic Network</b> to pin down an earthquake's
            location, depth and magnitude far more precisely than any single station could manage alone.`;
          action.textContent = 'Archive the dataset';
          action.onclick = () => onComplete(true);
        }
      };
    }
  });
}

/* ======================================================= satellite uplink */
function satelliteUplink({ ui, onComplete }) {
  const PASS_TIME = 22;     // seconds the satellite stays above the horizon
  const TOLERANCE = 7;      // +/- units of alignment counted as "locked"

  const stage = `
    <p style="font-size:14px;line-height:1.7;color:#9fbdd6">
      The satellite is only above the horizon for a short pass. <b style="color:#dcefff">Drag the
      slider to keep the dish aligned with the moving target</b> — the uplink only fills while
      you're locked on. Get the day's data out before the pass closes.
    </p>
    <div style="margin-top:22px;border:1px solid rgba(150,200,240,.2);border-radius:12px;
         padding:20px;background:#071722">
      <canvas id="su-canvas" style="width:100%;display:block;border-radius:8px"></canvas>
      <input type="range" id="su-aim" min="0" max="100" value="50"
             style="width:100%;margin-top:16px;accent-color:#ff9933">
      <div style="display:flex;justify-content:space-between;margin-top:8px;
           font-family:var(--mono);font-size:11px;color:#6c8399">
        <span>Pass closes in <b id="su-time" style="color:#5fd9ff">${PASS_TIME}s</b></span>
        <span>Uplink <b id="su-pct" style="color:#5fd9ff">0%</b></span>
      </div>
    </div>
    <p id="su-verdict" style="margin-top:14px;font-size:13.5px;line-height:1.7;min-height:56px"></p>`;

  ui.openMini(shell(
    'Satellite Uplink Window',
    'Polar satcom · dish alignment, timed pass',
    stage,
    `<span class="status" id="su-status">Acquiring signal</span>
     <button class="btn primary" id="su-action" disabled>Archive the dataset</button>`
  ), {
    onMount(el) {
      let raf = null, timerId = null;
      const cleanup = () => { cancelAnimationFrame(raf); clearInterval(timerId); };
      el.querySelector('[data-close]').onclick = () => { cleanup(); ui.closeMini(); };

      const cv = el.querySelector('#su-canvas');
      const aim = el.querySelector('#su-aim');
      const timeEl = el.querySelector('#su-time');
      const pctEl = el.querySelector('#su-pct');
      const status = el.querySelector('#su-status');
      const action = el.querySelector('#su-action');
      const verdict = el.querySelector('#su-verdict');

      let timeLeft = PASS_TIME;
      let progress = 0;
      let t = 0;
      let done = false, lost = false;

      function targetPos() {
        // The satellite drifts across the sky — target wanders, doesn't sit still.
        return 50 + Math.sin(t * 0.045) * 32 + Math.sin(t * 0.011) * 10;
      }

      function draw() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cv.clientWidth || 600, h = 130;
        cv.width = w * dpr; cv.height = h * dpr;
        cv.style.height = h + 'px';
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);

        const tp = targetPos();
        const tx = (tp / 100) * w;
        const ax = (+aim.value / 100) * w;
        const locked = Math.abs(tp - aim.value) <= TOLERANCE;

        // Tolerance band around the moving target.
        g.fillStyle = locked ? 'rgba(126,240,160,.18)' : 'rgba(255,153,51,.14)';
        g.fillRect(tx - (TOLERANCE / 100) * w, 0, (TOLERANCE * 2 / 100) * w, h);

        // Target line (satellite bearing).
        g.strokeStyle = '#5fd9ff';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(tx, 0); g.lineTo(tx, h); g.stroke();
        g.fillStyle = '#5fd9ff';
        g.font = '10px "JetBrains Mono", monospace';
        g.fillText('satellite', Math.min(Math.max(tx - 22, 2), w - 60), 14);

        // Dish aim marker.
        g.strokeStyle = locked ? '#7ef0a0' : '#ff9933';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(ax, 0); g.lineTo(ax, h); g.stroke();

        return locked;
      }

      function loop() {
        t++;
        const locked = draw();
        if (locked && !done && !lost) {
          progress = Math.min(100, progress + 0.9);
        }
        pctEl.textContent = Math.round(progress) + '%';
        pctEl.style.color = progress >= 100 ? '#7ef0a0' : '#5fd9ff';
        status.textContent = done ? 'Uplink complete' : lost ? 'Pass closed' :
          locked ? 'Locked — transmitting' : 'Off target — realign';

        if (!done && !lost) {
          if (progress >= 100) finish(true);
          raf = requestAnimationFrame(loop);
        }
      }

      timerId = setInterval(() => {
        if (done || lost) return;
        timeLeft--;
        timeEl.textContent = timeLeft + 's';
        if (timeLeft <= 0) finish(false);
      }, 1000);

      aim.addEventListener('input', () => {});
      raf = requestAnimationFrame(loop);

      function finish(win) {
        if (win) {
          done = true;
          cancelAnimationFrame(raf);
          clearInterval(timerId);
          verdict.innerHTML = `<b style="color:#7ef0a0">Pass complete — the day's data is on the ground.</b>
            Every dataset in this archive left Antarctica exactly this way: bounced off a satellite
            during a short window, with someone keeping the dish locked on for the whole pass. Lose
            the lock and the transfer stalls; miss the window and the data waits for the next
            pass — which might be hours away.`;
          action.disabled = false;
          action.onclick = () => onComplete(true);
        } else {
          lost = true;
          cancelAnimationFrame(raf);
          clearInterval(timerId);
          status.textContent = 'Pass closed';
          verdict.innerHTML = `<span style="color:#ffcf5c">Signal window closed at ${Math.round(progress)}%.</span>
            The satellite dropped below the horizon before the transfer finished. Nothing is lost
            permanently — the data queues for the next pass. <b style="color:#dcefff">Try again.</b>`;
          const retry = document.createElement('button');
          retry.className = 'btn';
          retry.textContent = 'Retry pass';
          retry.style.marginLeft = '10px';
          retry.onclick = () => {
            timeLeft = PASS_TIME; progress = 0; t = 0; done = false; lost = false;
            timeEl.textContent = timeLeft + 's';
            pctEl.textContent = '0%';
            verdict.innerHTML = '';
            retry.remove();
            timerId = setInterval(() => {
              if (done || lost) return;
              timeLeft--;
              timeEl.textContent = timeLeft + 's';
              if (timeLeft <= 0) finish(false);
            }, 1000);
            raf = requestAnimationFrame(loop);
          };
          action.insertAdjacentElement('beforebegin', retry);
        }
      }
    }
  });
}

export const SIDEQUEST_MINIGAMES = { wildlifeCensus, geomagnetic, seismology, satelliteUplink };
