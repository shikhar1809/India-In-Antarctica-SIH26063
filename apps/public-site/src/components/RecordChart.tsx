/* ═══════════════════════════════════════════════════════ record charts
 *
 * Two charts, each doing one job.
 *
 * RecordChart  — the readings from a single observation, compared. Horizontal
 *   bars, because the categories are few and their labels are words ("Snow
 *   depth") rather than dates. One hue for every bar: the bars are readings of
 *   the same quantity in the same unit, so colouring them differently would
 *   imply an identity difference that isn't there.
 *
 * TemperatureTrend — air temperature across every published record, oldest
 *   first. A line, because the job is change over time.
 *
 * Colours are the two brand hues re-stepped into the dark-mode lightness band
 * and checked with the palette validator against this site's #0d2033 panel
 * (all six checks pass: band, chroma, CVD separation, normal-vision floor,
 * contrast). The site's own #5fd9ff and #ff9933 sit too light for chart marks
 * on this surface, which is why these are darker steps of the same hues
 * rather than the tokens themselves.
 */

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'
import type { RecordChart as RecordChartData } from '../repository/contract'
import './RecordChart.css'

const SERIES = '#2f9fc9'      // glacier blue  — readings
const SERIES_WARM = '#c8762a' // amber         — temperature
const INK_DIM = '#9fbdd6'
const INK_FAINT = '#6c8399'
const GRID = 'rgba(150, 200, 240, 0.16)'

/* Text wears text tokens, never the series colour — the coloured mark beside
 * a label is what carries identity. */
const axisTick = { fill: INK_FAINT, fontSize: 11, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }

interface TipProps {
  active?: boolean
  payload?: { payload: { label: string; value: number } }[]
  unit: string
}

function Tip({ active, payload, unit }: TipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rc-tip">
      <span className="rc-tip-label">{p.label}</span>
      <span className="rc-tip-value">{p.value} {unit}</span>
    </div>
  )
}

export function RecordChart({ chart }: { chart: RecordChartData }) {
  // Long labels need room; short ones shouldn't waste it. Generous per
  // character — recharts silently word-wraps a tick that doesn't fit, which
  // turns "Ice thickness" into "Icethickness".
  const widest = Math.max(...chart.data.map((d) => d.label.length))
  const axisWidth = Math.min(190, Math.max(96, widest * 8.5))

  return (
    <figure className="rc-figure">
      <figcaption className="rc-head">
        <h4 className="rc-title">{chart.title}</h4>
        <p className="rc-caption">{chart.caption}</p>
      </figcaption>

      <div className="rc-plot" style={{ height: Math.max(140, chart.data.length * 46) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chart.data}
            layout="vertical"
            margin={{ top: 4, right: 44, bottom: 4, left: 0 }}
            barCategoryGap={6}
          >
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis
              type="number"
              tick={axisTick}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              unit={` ${chart.unit}`}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={axisWidth}
              tick={{ ...axisTick, fill: INK_DIM, fontFamily: 'Inter, system-ui, sans-serif' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(150, 200, 240, 0.08)' }}
              content={<Tip unit={chart.unit} />}
            />
            {/* 4px rounded data-end, square against the baseline */}
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
              {chart.data.map((d) => <Cell key={d.label} fill={SERIES} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* The numbers themselves, for anyone who can't use the chart — screen
          readers, print, or a colleague who just wants the values. */}
      <table className="rc-table">
        <caption className="sr-only">{chart.title}, as a table</caption>
        <tbody>
          {chart.data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.value} {chart.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/* ─────────────────────────────────────────────────── repository trend ── */

export function TemperatureTrend({ data }: { data: { label: string; value: number; station: string }[] }) {
  if (data.length < 2) return null

  return (
    <figure className="rc-figure rc-figure--wide">
      <figcaption className="rc-head">
        <h4 className="rc-title">Air temperature across the published record</h4>
        <p className="rc-caption">
          Every published observation that recorded a temperature, in the order it was taken.
          Each point is one team, standing outside, writing down what the thermometer said.
        </p>
      </figcaption>

      <div className="rc-plot" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: GRID }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} unit="°C" width={56} />
            <Tooltip cursor={{ stroke: GRID }} content={<Tip unit="°C" />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={SERIES_WARM}
              strokeWidth={2}
              dot={{ r: 4, fill: SERIES_WARM, stroke: '#0d2033', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
