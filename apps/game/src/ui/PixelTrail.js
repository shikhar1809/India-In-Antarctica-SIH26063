export function initPixelTrail() {
  const canvas = document.createElement('canvas');
  canvas.id = 'pixel-trail-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.style.filter = 'url(#custom-goo-filter)';
  document.body.appendChild(canvas);

  const svg = document.createElement('div');
  svg.innerHTML = `
    <svg style="position: absolute; width: 0; height: 0;">
      <defs>
        <filter id="custom-goo-filter">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  `;
  document.body.appendChild(svg);

  const ctx = canvas.getContext('2d');
  
  let width, height;
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  }
  window.addEventListener('resize', resize);
  resize();

  const color = '#FFFFFF'; 
  const gridSize = 70; // Increased grid size makes individual pixels smaller
  const maxAge = 250; 
  const trailRadius = 0.025; // Smaller radius for a tighter trail
  
  let points = [];
  let mouse = { x: width/2, y: height/2 };
  
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  let currentPos = { x: mouse.x, y: mouse.y };

  function render() {
    requestAnimationFrame(render);
    
    const boot = document.getElementById('boot');
    const menu = document.getElementById('menu');
    const isMenuVisible = (boot && !boot.classList.contains('hidden')) || (menu && !menu.classList.contains('hidden'));
    
    if (!isMenuVisible) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const now = Date.now();
    
    currentPos.x += (mouse.x - currentPos.x) * 0.5;
    currentPos.y += (mouse.y - currentPos.y) * 0.5;
    
    points.push({ x: currentPos.x, y: currentPos.y, time: now });
    points = points.filter(p => now - p.time < maxAge);

    ctx.clearRect(0, 0, width, height);
    
    if (points.length === 0) return;

    const maxDim = Math.max(width, height);
    const cellSize = maxDim / gridSize;
    
    ctx.fillStyle = color;
    const radiusPx = trailRadius * maxDim;
    
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const grid = new Float32Array(cols * rows);
    
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const ageNorm = 1 - ((now - p.time) / maxAge);
      
      const cx = p.x;
      const cy = p.y;
      
      const minCol = Math.max(0, Math.floor((cx - radiusPx) / cellSize));
      const maxCol = Math.min(cols - 1, Math.floor((cx + radiusPx) / cellSize));
      const minRow = Math.max(0, Math.floor((cy - radiusPx) / cellSize));
      const maxRow = Math.min(rows - 1, Math.floor((cy + radiusPx) / cellSize));
      
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const cellX = c * cellSize + cellSize/2;
          const cellY = r * cellSize + cellSize/2;
          const dx = cellX - cx;
          const dy = cellY - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < radiusPx) {
            let intensity = (1 - (dist / radiusPx)) * ageNorm;
            const idx = r * cols + c;
            grid[idx] = Math.max(grid[idx], intensity);
          }
        }
      }
    }
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = grid[r * cols + c];
        if (val > 0.05) {
          ctx.globalAlpha = val;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  
  render();
}
