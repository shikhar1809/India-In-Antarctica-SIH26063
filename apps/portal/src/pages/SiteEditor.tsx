import { useEffect, useState, useMemo } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';
import { config } from '../puck.config';
import { Globe, HardHat, Smartphone, Tablet, Monitor } from 'lucide-react';
import './SiteEditor.css';

const DEFAULT_DATA = {
  content: [
    {
      type: 'HeroBlock',
      props: { id: 'hero-1', badge: 'Ministry of Earth Sciences · NCPOR', titleLine1: 'India in', titleLine2Accent: 'Antarctica', subtitle: "Explore India's Antarctic research programme. Walk the ice, run the science, and discover data from Maitri and Bharati stations.", ctaLabel: 'Begin Expedition', ctaUrl: 'https://iia-game.web.app', ctaSecondaryLabel: 'Browse Archive', ctaSecondaryUrl: '#archive' }
    },
    {
      type: 'StatsBlock',
      props: { id: 'stats-1', stat1Number: '43+', stat1Label: 'Expeditions', stat2Number: '2', stat2Label: 'Research Stations', stat3Number: '1981', stat3Label: 'First Expedition', stat4Number: '800+', stat4Label: 'Datasets Published' }
    },
    {
      type: 'MissionBlock',
      props: { id: 'mission-1', label: 'Our Mission', heading: 'Advancing Polar Science', body: "India's Antarctic programme conducts multi-disciplinary research across glaciology, meteorology, oceanography and environmental monitoring. The data collected by Indian scientists contributes to global climate science and informs policy at the ATCM.", area1Icon: '🧊', area1Title: 'Glaciology', area1Desc: 'Ice cores, thickness surveys and mass balance studies', area2Icon: '🌤', area2Title: 'Meteorology', area2Desc: 'Atmospheric sounding, ozone monitoring, radiation', area3Icon: '🌊', area3Title: 'Oceanography', area3Desc: 'CTD casts, water sampling and current profiling', area4Icon: '🐧', area4Title: 'Wildlife Biology', area4Desc: 'Species counts, breeding surveys and marine ecosystems' }
    },
    {
      type: 'WeatherBlock',
      props: { id: 'weather-1', station: 'Bharati', temp: '-12.4', wind: '45', status: 'Blizzard Conditions', statusIcon: '🌨️' }
    },
    {
      type: 'ChartBlock',
      props: { id: 'chart-1', title: 'Surface Mass Balance', subtitle: 'Annual accumulation vs ablation (Gt)', type: 'bar', color: '#5fd9ff', yAxisLabel: 'Gigatonnes', dataJson: '[\n  {"name": "2021", "val": 120},\n  {"name": "2022", "val": 95},\n  {"name": "2023", "val": 110},\n  {"name": "2024", "val": 80},\n  {"name": "2025", "val": 105}\n]' }
    },
    {
      type: 'AnnouncementsBlock',
      props: { id: 'ann-1', heading: 'Latest Updates', items: JSON.stringify([{ date: '2026-09-01', title: '44th Expedition Departs', content: 'The 44th Indian Scientific Expedition to Antarctica departs from Goa, carrying 23 researchers across 12 scientific disciplines.' }, { date: '2026-08-14', title: 'New Glaciology Dataset Published', content: 'Ice thickness and surface velocity data from Schirmacher Oasis is now publicly available in the Knowledge Repository.' }, { date: '2026-07-30', title: 'Bharati Station Operations Resume', content: 'Summer operations at Bharati station have commenced for the 2026-27 season.' }]) }
    },
    {
      type: 'LibraryBlock',
      props: { id: 'lib-1', heading: 'Knowledge Repository', limit: 6 }
    },
    {
      type: 'DatasetBlock',
      props: { id: 'dataset-1', title: 'Ice Core Stratigraphy 2026', doi: '10.1594/PANGAEA.12345', format: 'NetCDF / CSV', size: '1.2 GB', downloadUrl: '#' }
    },
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
          setInitialData(snap.data());
        } else {
          await setDoc(docRef, DEFAULT_DATA);
          setInitialData(DEFAULT_DATA);
        }
      } catch (err) {
        console.error(err);
        setInitialData(DEFAULT_DATA);
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
      setInitialData(DEFAULT_DATA);
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
