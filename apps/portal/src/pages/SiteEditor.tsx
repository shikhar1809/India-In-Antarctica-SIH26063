import { useEffect, useState, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';
import { config } from '../puck.config';
import { asPublished } from './homeLayout';
import { Globe, HardHat, Smartphone, Tablet, Monitor } from 'lucide-react';
import './SiteEditor.css';

/** A fresh site, laid out the way the live one is: the front page, the
 *  numbers, the legacy section, the station gallery, then PolarQuest. Only
 *  used when `publicSiteData/home_puck` does not exist yet. */
const DEFAULT_DATA = {
  content: [
    { type: 'HeroBlock', props: { id: 'hero-1' } },
    {
      type: 'StatsBlock',
      props: { id: 'stats-1', stat1Number: '43+', stat1Label: 'Expeditions', stat2Number: '2', stat2Label: 'Research Stations', stat3Number: '1981', stat3Label: 'First Expedition', stat4Number: '800+', stat4Label: 'Datasets Published' }
    },
    {
      type: 'ParallaxLegacyBlock',
      props: { id: 'text-1', label: 'About', heading: "India's Polar Legacy", body: "India began its Antarctic journey in 1981 and has since conducted 43 scientific expeditions. The National Centre for Polar and Ocean Research (NCPOR) under the Ministry of Earth Sciences coordinates India's Antarctic activities, maintaining two research stations — Maitri in the Schirmacher Oasis and Bharati in the Larsemann Hills." }
    },
    { type: 'GalleryBlock', props: { id: 'gallery-station-photos' } },
    {
      type: 'BannerBlock',
      props: { id: 'banner-1', heading: 'Experience the Expedition', body: "Step into an immersive 3D environment and walk the ice of Maitri and Bharati stations. Collect field data, fill the Knowledge Repository.", ctaLabel: 'Launch PolarQuest 3D', ctaUrl: 'https://iia-game.web.app' }
    }
  ],
  root: { props: {} },
  zones: {}
};

export function SiteEditor() {
  const [initialData, setInitialData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [maintenanceMode, setMaintenanceMode] = useState(false);


  useEffect(() => {
    (async () => {
      try {
        const docRef = doc(db, 'publicSiteData', 'home_puck');
        const settingsRef = doc(db, 'publicSiteData', 'settings');
        
        const [snap, settingsSnap] = await Promise.all([
          getDoc(docRef),
          getDoc(settingsRef)
        ]);
        
        if (settingsSnap.exists()) {
          setMaintenanceMode(settingsSnap.data()?.maintenanceMode || false);
        }

        if (snap.exists() && snap.data()?.content?.length > 0) {
          setInitialData(asPublished(snap.data() as never));
        } else {
          await setDoc(docRef, DEFAULT_DATA);
          setInitialData(asPublished(DEFAULT_DATA as never));
        }
      } catch (err) {
        console.error(err);
        setInitialData(asPublished(DEFAULT_DATA as never));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // The block-by-block diff of what changed is recorded server side by the
  // audit trigger (functions/audit.js), which sees the before and after.
  const handlePublish = async (data: any) => {
    try {
      await setDoc(doc(db, 'publicSiteData', 'home_puck'), data);
      alert('✓ Published to live site!');
    } catch (err) {
      console.error(err);
      alert('Failed to publish. Make sure you are signed in as Admin.');
    }
  };

  const handleToggleMaintenance = async () => {
    try {
      const newVal = !maintenanceMode;
      setMaintenanceMode(newVal);
      await setDoc(doc(db, 'publicSiteData', 'settings'), { maintenanceMode: newVal }, { merge: true });
    } catch (err) {
      alert('Failed to toggle maintenance mode.');
      setMaintenanceMode(!maintenanceMode); // Revert on failure
    }
  };

  const handleReset = async () => {
    if (confirm("Reset to the SIH default template? This will overwrite your current draft.")) {
      setInitialData(asPublished(DEFAULT_DATA as never));
      await handlePublish(DEFAULT_DATA);
      window.location.reload();
    }
  };

  const puckOverrides = useMemo(() => ({
    headerActions: ({ children }: any) => (
      <>
        {/* Maintenance Toggle */}
        <button 
          onClick={handleToggleMaintenance}
          style={{
            background: maintenanceMode ? 'rgba(255, 106, 106, 0.1)' : 'rgba(100, 200, 100, 0.1)',
            color: maintenanceMode ? '#d32f2f' : '#2e8b57',
            border: `1px solid ${maintenanceMode ? 'rgba(255, 106, 106, 0.4)' : 'rgba(100, 200, 100, 0.4)'}`,
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            marginRight: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {maintenanceMode ? <><HardHat size={14} /> Maintenance: ON</> : <><Globe size={14} /> Site: Live</>}
        </button>

        {/* Custom Viewport Toggles */}
        <div style={{ display: 'flex', gap: '4px', background: '#f1f3f5', padding: '4px', borderRadius: '6px', marginRight: '16px' }}>
          <button title="Mobile" onClick={() => setViewMode('mobile')} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: viewMode === 'mobile' ? '#fff' : 'transparent', borderRadius: '4px', border: 'none', cursor: 'pointer', boxShadow: viewMode === 'mobile' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'mobile' ? '#000' : '#6c757d' }}><Smartphone size={16} /></button>
          <button title="Tablet" onClick={() => setViewMode('tablet')} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: viewMode === 'tablet' ? '#fff' : 'transparent', borderRadius: '4px', border: 'none', cursor: 'pointer', boxShadow: viewMode === 'tablet' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'tablet' ? '#000' : '#6c757d' }}><Tablet size={16} /></button>
          <button title="Desktop" onClick={() => setViewMode('desktop')} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', background: viewMode === 'desktop' ? '#fff' : 'transparent', borderRadius: '4px', border: 'none', cursor: 'pointer', boxShadow: viewMode === 'desktop' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: viewMode === 'desktop' ? '#000' : '#6c757d' }}><Monitor size={16} /></button>
        </div>

        <button 
          onClick={handleReset}
          style={{
            background: 'rgba(255, 106, 106, 0.1)',
            color: '#000',
            border: '1px solid rgba(255, 106, 106, 0.4)',
            padding: '6px 12px',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            marginRight: '8px'
          }}
        >
          Reset Site Template
        </button>
        {children}
      </>
    )
  }), [maintenanceMode, viewMode]);

  if (loading) return <div className="ph-page"><p>Loading editor…</p></div>;



  return (
    <div className="se-puck-root" style={{
      '--preview-width': viewMode === 'mobile' ? '375px' : viewMode === 'tablet' ? '768px' : '100%',
      '--preview-shadow': viewMode !== 'desktop' ? '0 0 40px rgba(0,0,0,0.5)' : 'none'
    } as any}>
      <Puck
        config={config}
        data={initialData}
        onPublish={handlePublish}
        iframe={{ enabled: false }}
        overrides={puckOverrides}
      />
    </div>
  );
}
