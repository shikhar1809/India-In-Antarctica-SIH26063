import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProfile, DEFAULT_APPEARANCE, type Appearance } from '../../hooks/useProfile';
import { AvatarScene } from './AvatarScene';
import './AvatarWidget.css';

// ── Swatch palettes ────────────────────────────────────────────────────────
const SKIN_TONES = [
  { hex: 0xffe0bd, label: 'Porcelain' },
  { hex: 0xf5c5a3, label: 'Fair' },
  { hex: 0xd4956a, label: 'Medium' },
  { hex: 0xc48a63, label: 'Tan' },
  { hex: 0x8d5524, label: 'Brown' },
  { hex: 0x4a2912, label: 'Deep' },
];

const PARKA_COLORS = [
  { hex: 0xdfe6ea, accent: 0x9fb0ba, label: 'Ice' },
  { hex: 0x2c5f8a, accent: 0x1a3d5c, label: 'Navy' },
  { hex: 0x2d5a3d, accent: 0x1c3a28, label: 'Forest' },
  { hex: 0xe8821a, accent: 0xb05e0e, label: 'Saffron' },
  { hex: 0xc03838, accent: 0x8a2020, label: 'Red' },
  { hex: 0x3a3e42, accent: 0x25282c, label: 'Carbon' },
];

const TROUSER_COLORS = [
  { hex: 0x1c2530, label: 'Navy' },
  { hex: 0x2a2d30, label: 'Charcoal' },
  { hex: 0x2a3020, label: 'Olive' },
  { hex: 0x0d0f11, label: 'Black' },
];

const HAIR_COLORS = [
  { hex: 0x2a1c12, label: 'Dark brown' },
  { hex: 0x0d0a08, label: 'Black' },
  { hex: 0x6b3d1a, label: 'Brown' },
  { hex: 0xc8a862, label: 'Blonde' },
  { hex: 0x8b3a18, label: 'Auburn' },
  { hex: 0x8a8a8a, label: 'Grey' },
];

function hexCss(n: number) {
  return '#' + n.toString(16).padStart(6, '0');
}

function Swatches({
  options,
  selected,
  onSelect,
}: {
  options: { hex: number; label: string }[];
  selected: number;
  onSelect: (hex: number) => void;
}) {
  return (
    <div className="av-swatches">
      {options.map((o) => (
        <button
          key={o.hex}
          type="button"
          className={'av-swatch' + (selected === o.hex ? ' active' : '')}
          style={{ background: hexCss(o.hex) }}
          title={o.label}
          onClick={() => onSelect(o.hex)}
          aria-label={o.label}
          aria-pressed={selected === o.hex}
        />
      ))}
    </div>
  );
}

export function AvatarWidget() {
  const { user } = useAuth();
  const { introMessage, appearance, loading, saving, error, save } = useProfile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<AvatarScene | null>(null);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'intro' | 'look'>('intro');
  const [draft, setDraft] = useState(introMessage);
  const [look, setLook] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [saved, setSaved] = useState(false);

  // sync drafts when profile loads
  useEffect(() => { if (!open) { setDraft(introMessage); setLook(appearance); } }, [introMessage, appearance, open]);

  // boot Three.js scene
  useEffect(() => {
    if (!user || !canvasRef.current || !wrapRef.current) return;

    const scene = new AvatarScene(canvasRef.current, {
      parka: appearance.parkaColor,
      parkaDark: appearance.parkaAccent,
      trouserColor: appearance.trouserColor,
      skin: appearance.skin,
      hairColor: appearance.hairColor,
    });
    sceneRef.current = scene;

    const resize = () => {
      const px = wrapRef.current!.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.5 : 2);
      scene.setSize(px, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current);

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !document.hidden) scene.start();
      else scene.stop();
    });
    io.observe(wrapRef.current);

    const onVisibility = () => {
      if (document.hidden) scene.stop(); else scene.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      scene.dispose(); sceneRef.current = null;
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // live-update character when swatch changes
  const updateLook = (patch: Partial<Appearance>) => {
    const next = { ...look, ...patch };
    setLook(next);
    sceneRef.current?.setAppearance({
      parka: next.parkaColor,
      parkaDark: next.parkaAccent,
      trouserColor: next.trouserColor,
      skin: next.skin,
      hairColor: next.hairColor,
    });
  };

  const handleSave = async () => {
    await save(draft, look);
    setSaved(true);
    setOpen(false);
    setTimeout(() => setSaved(false), 2500);
  };

  if (!user) return null;

  return (
    <div className="av-widget">
      {open && (
        <div className="av-panel">
          <div className="av-panel-tabs">
            <button className={'av-panel-tab' + (tab === 'intro' ? ' active' : '')} onClick={() => setTab('intro')}>Intro</button>
            <button className={'av-panel-tab' + (tab === 'look' ? ' active' : '')} onClick={() => setTab('look')}>Look</button>
          </div>

          {tab === 'intro' && (
            <>
              <p className="av-panel-hint">Shown when another scientist meets you in the field.</p>
              <textarea
                rows={3}
                maxLength={280}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={loading}
              />
            </>
          )}

          {tab === 'look' && (
            <div className="av-look">
              <div className="av-look-row">
                <span className="av-look-label">Skin</span>
                <Swatches options={SKIN_TONES} selected={look.skin} onSelect={(hex) => updateLook({ skin: hex })} />
              </div>
              <div className="av-look-row">
                <span className="av-look-label">Parka</span>
                <Swatches
                  options={PARKA_COLORS}
                  selected={look.parkaColor}
                  onSelect={(hex) => {
                    const preset = PARKA_COLORS.find((p) => p.hex === hex)!;
                    updateLook({ parkaColor: preset.hex, parkaAccent: preset.accent });
                  }}
                />
              </div>
              <div className="av-look-row">
                <span className="av-look-label">Trousers</span>
                <Swatches options={TROUSER_COLORS} selected={look.trouserColor} onSelect={(hex) => updateLook({ trouserColor: hex })} />
              </div>
              <div className="av-look-row">
                <span className="av-look-label">Hair</span>
                <Swatches options={HAIR_COLORS} selected={look.hairColor} onSelect={(hex) => updateLook({ hairColor: hex })} />
              </div>
            </div>
          )}

          {error && <p className="av-error">{error}</p>}
          <div className="av-panel-actions">
            <button className="ph-btn ghost small" onClick={() => { setOpen(false); setLook(appearance); sceneRef.current?.setAppearance({ parka: appearance.parkaColor, parkaDark: appearance.parkaAccent, trouserColor: appearance.trouserColor, skin: appearance.skin, hairColor: appearance.hairColor }); }} disabled={saving}>
              Cancel
            </button>
            <button className="ph-btn primary small" onClick={handleSave} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="av-figure"
        ref={wrapRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Edit your character"
      >
        <canvas ref={canvasRef} />
        {saved && <span className="av-toast">Saved</span>}
        <span className="av-edit-hint">Edit character</span>
      </button>
    </div>
  );
}
