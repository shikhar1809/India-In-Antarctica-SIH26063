import { type Config, DropZone } from '@measured/puck';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts';
import MorphSlider from './components/MorphSlider';
import './blocks.css';

type Props = {
  HeroBlock: {
    badge: string; titleLine1: string; titleLine2Accent: string;
    subtitle: string; ctaLabel: string; ctaUrl: string;
    ctaSecondaryLabel: string; ctaSecondaryUrl: string;
  };
  StatsBlock: {
    stat1Number: string; stat1Label: string; stat2Number: string; stat2Label: string;
    stat3Number: string; stat3Label: string; stat4Number: string; stat4Label: string;
  };
  MissionBlock: {
    label: string; heading: string; body: string;
    area1Icon: string; area1Title: string; area1Desc: string;
    area2Icon: string; area2Title: string; area2Desc: string;
    area3Icon: string; area3Title: string; area3Desc: string;
    area4Icon: string; area4Title: string; area4Desc: string;
  };
  TextBlock: { label: string; heading: string; body: string; };
  LibraryBlock: { heading: string; limit: number; };
  AnnouncementsBlock: { heading: string; items: string; };
  BannerBlock: { heading: string; body: string; ctaLabel: string; ctaUrl: string; };
  TextElement: { text: string; align: 'left' | 'center' | 'right'; size: 'normal' | 'large' };
  ImageElement: { url: string; alt: string; caption: string; width: '800px' | '1100px' | '100%' };
  LayoutColumns: {};
  WeatherBlock: { station: string; temp: string; wind: string; status: string; statusIcon: string };
  DatasetBlock: { title: string; doi: string; format: string; size: string; downloadUrl: string };
  ChartBlock: { title: string; subtitle: string; type: 'line' | 'bar'; dataJson: string; color: string; yAxisLabel: string };
};

export const config: Config<Props> = {
  components: {

    HeroBlock: {
      label: 'Hero',
      fields: {
        badge:               { type: 'text',     label: 'Badge text' },
        titleLine1:          { type: 'text',     label: 'Title â€” Line 1' },
        titleLine2Accent:    { type: 'text',     label: 'Title â€” Line 2 (cyan accent)' },
        subtitle:            { type: 'textarea', label: 'Subtitle' },
        ctaLabel:            { type: 'text',     label: 'Primary button label' },
        ctaUrl:              { type: 'text',     label: 'Primary button URL' },
        ctaSecondaryLabel:   { type: 'text',     label: 'Secondary button label' },
        ctaSecondaryUrl:     { type: 'text',     label: 'Secondary button URL' },
      },
      defaultProps: {
        badge: 'Ministry of Earth Sciences Â· NCPOR',
        titleLine1: 'India in',
        titleLine2Accent: 'Antarctica',
        subtitle: "Explore India's Antarctic research programme. Walk the ice, run the science, and discover data from Maitri and Bharati stations.",
        ctaLabel: 'Begin Expedition',     ctaUrl: 'https://iia-game.web.app',
        ctaSecondaryLabel: 'Browse Archive', ctaSecondaryUrl: '#archive',
      },
      render: () => (
        <div className="block-hero" style={{ position: 'relative', height: '100vh', width: '100vw' }}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            <MorphSlider
              items={[
                { image: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/An_aerial_view_of_the_Indian_Station_Maitri%2C_Antarctica_on_February_2%2C_2005.jpg', caption: 'Maitri Research Station' },
                { image: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Bharati_permanent_Antarctic_research_station.jpg', caption: 'Bharati Research Station' },
                { image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/%E0%A4%A6%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%A3_%E0%A4%97%E0%A4%82%E0%A4%97%E0%A5%8B%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A5%80%2C_%E0%A4%85%E0%A4%82%E0%A4%9F%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%BE.jpg/1280px-%E0%A4%A6%E0%A4%95%E0%A5%8D%E0%A4%B7%E0%A4%BF%E0%A4%A3_%E0%A4%97%E0%A4%82%E0%A4%97%E0%A5%8B%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A5%80%2C_%E0%A4%85%E0%A4%82%E0%A4%9F%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%9F%E0%A4%BF%E0%A4%95%E0%A4%BE.jpg', caption: 'Dakshin Gangotri' }
              ]}
              transition="melt"
              intensity={0.55}
              aberration={0.35}
              drift={0.4}
              autoplay={true}
              overlayColor="#05060a"
              duration={1.1}
              ease="power2.inOut"
              scale={2.4}
              autoplayDelay={4}
              loop
              radius={0}
              showCaptions
              showControls={true}
              showIndicators={true}
            />
          </div>
        </div>
      ),
    },

    StatsBlock: {
      label: 'Stats Bar',
      fields: {
        stat1Number: { type: 'text', label: 'Stat 1 â€” Number' }, stat1Label: { type: 'text', label: 'Stat 1 â€” Label' },
        stat2Number: { type: 'text', label: 'Stat 2 â€” Number' }, stat2Label: { type: 'text', label: 'Stat 2 â€” Label' },
        stat3Number: { type: 'text', label: 'Stat 3 â€” Number' }, stat3Label: { type: 'text', label: 'Stat 3 â€” Label' },
        stat4Number: { type: 'text', label: 'Stat 4 â€” Number' }, stat4Label: { type: 'text', label: 'Stat 4 â€” Label' },
      },
      defaultProps: {
        stat1Number: '43+',  stat1Label: 'Expeditions',
        stat2Number: '2',    stat2Label: 'Research Stations',
        stat3Number: '1981', stat3Label: 'First Expedition',
        stat4Number: '800+', stat4Label: 'Datasets Published',
      },
      render: ({ stat1Number, stat1Label, stat2Number, stat2Label, stat3Number, stat3Label, stat4Number, stat4Label }) => (
        <div className="block-stats">
          <div className="stats-grid">
            {[
              { n: stat1Number, l: stat1Label }, { n: stat2Number, l: stat2Label },
              { n: stat3Number, l: stat3Label }, { n: stat4Number, l: stat4Label },
            ].map((s, i) => (
              <div key={i} className="stat-item">
                <div className="stat-number">{s.n}</div>
                <div className="stat-label">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },

    MissionBlock: {
      label: 'Mission & Research',
      fields: {
        label:    { type: 'text',     label: 'Section label (mono)' },
        heading:  { type: 'text',     label: 'Heading' },
        body:     { type: 'textarea', label: 'Body paragraph' },
        area1Icon: { type: 'text', label: 'Area 1 â€” Icon (emoji)' }, area1Title: { type: 'text', label: 'Area 1 â€” Title' }, area1Desc: { type: 'text', label: 'Area 1 â€” Description' },
        area2Icon: { type: 'text', label: 'Area 2 â€” Icon (emoji)' }, area2Title: { type: 'text', label: 'Area 2 â€” Title' }, area2Desc: { type: 'text', label: 'Area 2 â€” Description' },
        area3Icon: { type: 'text', label: 'Area 3 â€” Icon (emoji)' }, area3Title: { type: 'text', label: 'Area 3 â€” Title' }, area3Desc: { type: 'text', label: 'Area 3 â€” Description' },
        area4Icon: { type: 'text', label: 'Area 4 â€” Icon (emoji)' }, area4Title: { type: 'text', label: 'Area 4 â€” Title' }, area4Desc: { type: 'text', label: 'Area 4 â€” Description' },
      },
      defaultProps: {
        label: 'Our Mission', heading: "Advancing Polar Science", body: "India's Antarctic programme conducts multi-disciplinary research across glaciology, meteorology, oceanography and environmental monitoring. The data collected by Indian scientists contributes to global climate science and informs policy at the ATCM.",
        area1Icon: 'ðŸ§Š', area1Title: 'Glaciology',        area1Desc: 'Ice cores, thickness surveys and mass balance studies',
        area2Icon: 'ðŸŒ¤', area2Title: 'Meteorology',       area2Desc: 'Atmospheric sounding, ozone monitoring, radiation',
        area3Icon: 'ðŸŒŠ', area3Title: 'Oceanography',      area3Desc: 'CTD casts, water sampling and current profiling',
        area4Icon: 'ðŸ§', area4Title: 'Wildlife Biology',  area4Desc: 'Species counts, breeding surveys and marine ecosystems',
      },
      render: ({ label, heading, body, area1Icon, area1Title, area1Desc, area2Icon, area2Title, area2Desc, area3Icon, area3Title, area3Desc, area4Icon, area4Title, area4Desc }) => (
        <div className="block-mission">
          <div className="block-mission-inner">
            <div>
              <div className="block-mission-label">{label}</div>
              <h2>{heading}</h2>
              <p>{body}</p>
            </div>
            <div className="mission-areas">
              {[
                { icon: area1Icon, title: area1Title, desc: area1Desc },
                { icon: area2Icon, title: area2Title, desc: area2Desc },
                { icon: area3Icon, title: area3Title, desc: area3Desc },
                { icon: area4Icon, title: area4Title, desc: area4Desc },
              ].map((a, i) => (
                <div key={i} className="mission-area-card">
                  <div className="mission-area-icon">{a.icon}</div>
                  <h4>{a.title}</h4>
                  <p>{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },

    TextBlock: {
      label: 'Text Section',
      fields: {
        label:   { type: 'text',     label: 'Section label (mono)' },
        heading: { type: 'text',     label: 'Heading' },
        body:    { type: 'textarea', label: 'Body text' },
      },
      defaultProps: {
        label: 'About',
        heading: "India's Polar Legacy",
        body: "India began its Antarctic journey in 1981 and has since conducted 43 scientific expeditions. The National Centre for Polar and Ocean Research (NCPOR) under the Ministry of Earth Sciences coordinates India's Antarctic activities, maintaining two research stations â€” Maitri in the Schirmacher Oasis and Bharati in the Larsemann Hills.",
      },
      render: ({ label, heading, body }) => (
        <div className="block-text">
          <div className="block-text-label">{label}</div>
          <div>
            <h2>{heading}</h2>
            <p>{body}</p>
          </div>
        </div>
      ),
    },

    LibraryBlock: {
      label: 'Data Archive',
      fields: {
        heading: { type: 'text',   label: 'Section heading' },
        limit:   { type: 'number', label: 'Max records to show' },
      },
      defaultProps: { heading: 'Knowledge Repository', limit: 6 },
      render: ({ heading }) => (
        <div className="block-library">
          <div className="block-library-inner">
            <div className="block-section-header">
              <h2>{heading}</h2>
              <a href="#archive">View all â†’</a>
            </div>
            <div className="library-grid">
              {[
                { cat: 'Expedition Report', title: 'Glaciological Survey â€” Schirmacher Oasis 2026', station: 'Maitri', license: 'CC BY 4.0' },
                { cat: 'Dataset', title: 'Sea Ice Thickness & Surface Velocity Data â€” Q1 2026', station: 'Bharati', license: 'CC0' },
                { cat: 'Photographs & Video', title: 'Emperor Penguin Colony Documentation â€” Cape Darnley', station: 'Bharati', license: 'CC BY 4.0' },
              ].map((r, i) => (
                <div key={i} className="library-card">
                  <span className="library-card-cat">{r.cat}</span>
                  <h3>{r.title}</h3>
                  <p>Data from the {r.station} station field team. Available for download under open licence.</p>
                  <div className="library-card-meta">
                    <span>{r.station}</span>
                    <span>{r.license}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },

    AnnouncementsBlock: {
      label: 'Announcements',
      fields: {
        heading: { type: 'text',     label: 'Section heading' },
        items:   { type: 'textarea', label: 'Items (JSON array)' },
      },
      defaultProps: {
        heading: 'Latest Updates',
        items: JSON.stringify([
          { date: '2026-09-01', title: '44th Expedition Departs', content: 'The 44th Indian Scientific Expedition to Antarctica departs from Goa, carrying 23 researchers across 12 scientific disciplines.' },
          { date: '2026-08-14', title: 'New Glaciology Dataset Published', content: 'Ice thickness and surface velocity data from Schirmacher Oasis is now publicly available in the Knowledge Repository.' },
          { date: '2026-07-30', title: 'Bharati Station Operations Resume', content: 'Summer operations at Bharati station have commenced for the 2026-27 season.' },
        ]),
      },
      render: ({ heading, items }) => {
        let parsed: { date: string; title: string; content: string }[] = [];
        try { parsed = JSON.parse(items); } catch { parsed = []; }
        return (
          <div className="block-announcements">
            <div className="block-announcements-inner">
              <div className="block-section-header"><h2>{heading}</h2></div>
              <div className="announcements-grid">
                {parsed.map((ann, i) => (
                  <div key={i} className="announcement-card">
                    <p className="ann-date">{ann.date}</p>
                    <h4>{ann.title}</h4>
                    <p>{ann.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      },
    },

    BannerBlock: {
      label: 'Banner',
      fields: {
        heading:    { type: 'text',     label: 'Heading' },
        body:       { type: 'textarea', label: 'Body text' },
        ctaLabel:   { type: 'text',     label: 'Button label' },
        ctaUrl:     { type: 'text',     label: 'Button URL' },
      },
      defaultProps: {
        heading: 'Experience the Expedition',
        body: "Step into an immersive 3D environment and walk the ice of Maitri and Bharati stations. Collect field data, fill the Knowledge Repository.",
        ctaLabel: 'Launch PolarQuest 3D',
        ctaUrl: 'https://iia-game.web.app',
      },
      render: ({ heading, body, ctaLabel, ctaUrl }) => (
        <div className="block-banner">
          <div className="block-banner-content">
            <h2>{heading}</h2>
            <p>{body}</p>
            <a href={ctaUrl} className="btn-primary-pub">{ctaLabel}</a>
          </div>
        </div>
      ),
    },

    TextElement: {
      label: 'Free Text',
      fields: {
        text: { type: 'textarea', label: 'Content' },
        align: {
          type: 'select',
          options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' }],
          label: 'Alignment'
        },
        size: {
          type: 'select',
          options: [{ label: 'Normal', value: 'normal' }, { label: 'Large', value: 'large' }],
          label: 'Text Size'
        }
      },
      defaultProps: { text: 'Type your text here...', align: 'left', size: 'normal' },
      render: ({ text, align, size }) => (
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '1rem 1.5rem',
          textAlign: align,
          color: 'var(--ice-dim)',
          fontSize: size === 'large' ? '1.25rem' : '1rem',
          lineHeight: 1.8
        }}>
          {text.split('\n').map((line, i) => (
            <p key={i} style={{ marginBottom: line.trim() ? '1rem' : '0' }}>
              {line || '\u00A0'}
            </p>
          ))}
        </div>
      )
    },

    ImageElement: {
      label: 'Image',
      fields: {
        url: { type: 'text', label: 'Image URL' },
        alt: { type: 'text', label: 'Alt Text' },
        caption: { type: 'text', label: 'Caption (optional)' },
        width: {
          type: 'select',
          options: [{ label: 'Normal (800px)', value: '800px' }, { label: 'Large (1100px)', value: '1100px' }, { label: 'Full Width', value: '100%' }],
          label: 'Width'
        }
      },
      defaultProps: { url: 'https://images.unsplash.com/photo-1548509825-70966a3501af?auto=format&fit=crop&w=1200&q=80', alt: 'Antarctica', caption: '', width: '800px' },
      render: ({ url, alt, caption, width }) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1.5rem', width: '100%' }}>
          <img
            src={url}
            alt={alt}
            style={{
              width: '100%',
              maxWidth: width,
              borderRadius: width === '100%' ? 0 : 12,
              objectFit: 'cover'
            }}
          />
          {caption && <span style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--ice-faint)' }}>{caption}</span>}
        </div>
      )
    },

    LayoutColumns: {
      label: '2 Columns',
      fields: {},
      render: () => (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            <div><DropZone zone="left" /></div>
            <div><DropZone zone="right" /></div>
          </div>
        </div>
      )
    },

    WeatherBlock: {
      label: 'Weather Card',
      fields: {
        station: { type: 'select', options: [{label:'Maitri', value:'Maitri'}, {label:'Bharati', value:'Bharati'}], label: 'Station' },
        temp: { type: 'text', label: 'Temperature (Â°C)' },
        wind: { type: 'text', label: 'Wind Speed (knots)' },
        status: { type: 'text', label: 'Condition' },
        statusIcon: { type: 'text', label: 'Condition Icon (Emoji)' }
      },
      defaultProps: { station: 'Bharati', temp: '-12.4', wind: '45', status: 'Blizzard Conditions', statusIcon: 'ðŸŒ¨ï¸' },
      render: ({ station, temp, wind, status, statusIcon }) => (
        <div className="block-weather">
          <div className="weather-card">
            <div className="weather-main">
              <div className="weather-temp">{temp}Â°</div>
              <div>
                <div className="weather-station">{station} Station</div>
                <div className="weather-status">{statusIcon} {status}</div>
              </div>
            </div>
            <div className="weather-metrics">
              <div className="weather-metric">
                <span className="wm-label">Wind</span>
                <span className="wm-val">{wind} kts</span>
              </div>
              <div className="weather-metric">
                <span className="wm-label">Status</span>
                <span className="wm-val" style={{color: 'var(--saffron)'}}>Active</span>
              </div>
            </div>
          </div>
        </div>
      )
    },

    DatasetBlock: {
      label: 'Dataset Download',
      fields: {
        title: { type: 'text', label: 'Dataset Title' },
        doi: { type: 'text', label: 'DOI / ID' },
        format: { type: 'text', label: 'File Format' },
        size: { type: 'text', label: 'File Size' },
        downloadUrl: { type: 'text', label: 'Download Link' }
      },
      defaultProps: { title: 'Ice Core Stratigraphy 2026', doi: '10.1594/PANGAEA.12345', format: 'NetCDF / CSV', size: '1.2 GB', downloadUrl: '#' },
      render: ({ title, doi, format, size, downloadUrl }) => (
        <div className="block-dataset">
          <div className="dataset-card">
            <div className="dataset-info">
              <h4>{title}</h4>
              <div className="dataset-meta">
                <span>ðŸ†” {doi}</span>
                <span>ðŸ“„ {format}</span>
                <span>ðŸ“¦ {size}</span>
              </div>
            </div>
            <a href={downloadUrl} className="btn-download">
              â¬‡ï¸ Download Data
            </a>
          </div>
        </div>
      )
    },

    ChartBlock: {
      label: 'Chart',
      fields: {
        title: { type: 'text', label: 'Chart Title' },
        subtitle: { type: 'text', label: 'Subtitle' },
        type: { type: 'select', options: [{label:'Line Chart', value:'line'}, {label:'Bar Chart', value:'bar'}], label: 'Chart Type' },
        color: { type: 'text', label: 'Theme Color (Hex)' },
        yAxisLabel: { type: 'text', label: 'Y-Axis Label' },
        dataJson: { type: 'textarea', label: 'JSON Data array [{"name":"Jan","val":40}]' }
      },
      defaultProps: {
        title: 'Surface Mass Balance', subtitle: 'Annual accumulation vs ablation (Gt)',
        type: 'bar', color: '#5fd9ff', yAxisLabel: 'Gigatonnes',
        dataJson: '[\n  {"name": "2021", "val": 120},\n  {"name": "2022", "val": 95},\n  {"name": "2023", "val": 110},\n  {"name": "2024", "val": 80},\n  {"name": "2025", "val": 105}\n]'
      },
      render: ({ title, subtitle, type, color, yAxisLabel, dataJson }) => {
        let parsed = [];
        try { parsed = JSON.parse(dataJson); } catch { parsed = []; }
        return (
          <div className="block-chart">
            <div className="chart-container">
              <div className="chart-header">
                <h3>{title}</h3>
                <p>{subtitle}</p>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                {parsed.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    {type === 'line' ? (
                      <LineChart data={parsed} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,200,240,0.1)" vertical={false} />
                        <XAxis dataKey="name" stroke="var(--ice-faint)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="var(--ice-faint)" fontSize={12} tickLine={false} axisLine={false} label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fill: 'var(--ice-dim)' }} />
                        <Tooltip contentStyle={{ background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ice)' }} itemStyle={{ color: color }} />
                        <Line type="monotone" dataKey="val" stroke={color} strokeWidth={3} dot={{ fill: 'var(--ink)', stroke: color, strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    ) : (
                      <BarChart data={parsed} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,200,240,0.1)" vertical={false} />
                        <XAxis dataKey="name" stroke="var(--ice-faint)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="var(--ice-faint)" fontSize={12} tickLine={false} axisLine={false} label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fill: 'var(--ice-dim)' }} />
                        <Tooltip contentStyle={{ background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ice)' }} itemStyle={{ color: color }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <Bar dataKey="val" fill={color} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <div style={{ display:'flex', height:'100%', alignItems:'center', justifyContent:'center', color:'var(--ice-dim)' }}>Invalid JSON Data</div>
                )}
              </div>
            </div>
          </div>
        );
      }
    },
  },

  root: {
    render: ({ children }) => (
      <div style={{ width: 'var(--preview-width, 100%)', margin: '0 auto', transition: 'width 0.3s ease', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'radial-gradient(120% 100% at 50% -10%, #102a44 0%, #061019 55%, #030810 100%)', color: '#e6f2fb', fontFamily: "'Inter', system-ui, sans-serif", overflowX: 'hidden', boxShadow: 'var(--preview-shadow, none)' }}>
        <header className="puck-root-header" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2.5rem', background: 'rgba(6,16,25,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(150,200,240,0.16)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/logo.png" alt="IIA" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            <span style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '1.2rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>India In Antarctica</span>
          </div>
          <nav style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            {['Home', 'Archive', 'NCPOR'].map(l => <span key={l} style={{ color: '#9fbdd6', fontSize: '0.9rem' }}>{l}</span>)}
            <span style={{ padding: '0.35rem 0.9rem', border: '1px solid #ff9933', borderRadius: 4, color: '#ff9933', fontSize: '0.875rem' }}>Portal Login</span>
          </nav>
        </header>
        <main style={{ flex: 1 }}>{children}</main>
        <footer className="puck-root-footer" style={{ padding: '3rem 2.5rem', background: '#0a1a2b', borderTop: '1px solid rgba(150,200,240,0.16)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: '1rem', letterSpacing: '0.04em', color: '#e6f2fb', marginBottom: '0.5rem' }}>India In Antarctica</div>
            <p style={{ fontSize: '0.8rem', color: '#6c8399', lineHeight: 1.6, margin: 0 }}>Ministry of Earth Sciences Â· NCPOR</p>
          </div>
          <div>
            <div style={{ color: '#5fd9ff', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>Quick Links</div>
            {['NCPOR', 'Ministry of Earth Sciences', 'Outreach Portal', 'PolarQuest 3D'].map(l => <div key={l} style={{ color: '#9fbdd6', fontSize: '0.85rem', marginBottom: '0.4rem' }}>{l}</div>)}
          </div>
          <div style={{ color: '#6c8399', fontSize: '0.8rem', lineHeight: 1.7 }}>
            <div>Â© {new Date().getFullYear()} Ministry of Earth Sciences</div>
            <div>National Centre for Polar and Ocean Research</div>
            <div>Headland Sada, Vasco-da-Gama, Goa â€“ 403 804</div>
          </div>
        </footer>
      </div>
    ),
  },
};
