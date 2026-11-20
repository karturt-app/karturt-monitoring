import { Component, StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowDownRight, ArrowRight, Clock, Globe, History, Info, Moon, Sun } from 'lucide-react'
import { MotionConfig, motion } from 'motion/react'
import '@fontsource-variable/manrope'
import '@fontsource-variable/space-grotesk'
import { intervalMinutes, retentionDays, staleMinutes, statusFeedUrl, targets } from '../shared/targets.mjs'
import { formatTime, parseFeed, serviceHistory, type Check, type Result, type Status } from './status'
import './styles.css'

const themeKey = 'karturt-monitoring-theme'
const source = 'https://github.com/karturt-app/karturt-monitoring'
const refreshMs = 60_000
const percent = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 2 })
const number = new Intl.NumberFormat('id-ID')
type Target = (typeof targets)[number]

const descriptions: Record<Result['reason'], string> = {
  http: 'Respons homepage diterima.',
  restricted: 'Akses terbatas. Homepage memerlukan otorisasi.',
  redirect: 'Homepage mengarahkan permintaan. Tujuan redirect tidak diperiksa.',
  rate_limited: 'Permintaan dibatasi oleh server.',
  timeout: 'Server belum merespons dalam 10 detik.',
  network: 'Pemeriksa gagal terhubung ke homepage.',
}

function useChecks() {
  const [checks, setChecks] = useState<Check[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const lifetime = new AbortController()
    async function refresh() {
      try {
        const response = await fetch(statusFeedUrl, {
          cache: 'no-store',
          credentials: 'omit',
          signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10_000)]),
        })
        if (!response.ok) throw new Error('Riwayat tidak tersedia.')
        const next = parseFeed(await response.json())
        if (!lifetime.signal.aborted) {
          setChecks(next)
          setPhase('ready')
        }
      } catch {
        if (!lifetime.signal.aborted) setPhase('error')
      } finally {
        if (!lifetime.signal.aborted) setNow(Date.now())
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, refreshMs)
    return () => {
      window.clearInterval(timer)
      lifetime.abort()
    }
  }, [])

  return { checks, phase, now }
}

function Header() {
  const [light, setLight] = useState(document.documentElement.dataset.theme === 'light')

  function toggleTheme() {
    const theme = light ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    setLight(!light)
    try { localStorage.setItem(themeKey, theme) } catch {}
  }

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href="/" aria-label="Beranda KartuRT Monitoring">
          <span className="brand-mark"><Activity size={21} aria-hidden="true" /></span>
          <span>KartuRT <span className="brand-detail">Monitoring</span></span>
        </a>
        <motion.button type="button" className="theme-switch" whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          onClick={toggleTheme} aria-label="Tema terang" aria-pressed={light} title="Ganti tema">
          {light ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
        </motion.button>
      </div>
    </header>
  )
}

function ServiceCard({ target, history, now }: {
  target: Target
  history: ReturnType<typeof serviceHistory>
  now: number
}) {
  const { latest, slots, uptime, known, samples } = history
  const stale = latest && now - Date.parse(latest.at) > staleMinutes * 60_000
  const status: Status = stale ? 'unknown' : latest?.status ?? 'unknown'
  const explanation = stale
    ? 'Pemeriksaan terbaru sudah kedaluwarsa.'
    : latest ? descriptions[latest.reason] : 'Belum ada hasil pemeriksaan.'
  const hostname = new URL(target.url).hostname

  return (
    <motion.article className="service-card" data-status={status} aria-labelledby={target.id + '-title'}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: target.id === 'uat' ? 0.06 : 0 }}>
      <div className="service-heading">
        <div>
          <div className="service-name">
            <Globe size={17} aria-hidden="true" />
            <h2 id={target.id + '-title'}>{target.name}</h2>
          </div>
          <p className="hostname">{hostname}</p>
        </div>
        <span className="endpoint">GET /</span>
      </div>
      <div className="reading">
        <div className="status-line">
          <span className="status-light" aria-hidden="true" />
          <strong>{status.toUpperCase()}</strong>
          {latest?.code != null && <span className="http-code">HTTP {latest.code}</span>}
        </div>
        <p>{explanation}</p>
      </div>
      <dl className="measurements">
        <div>
          <dt>Waktu respons</dt>
          <dd>{latest?.elapsedMs == null ? '—' : number.format(latest.elapsedMs) + ' ms'}</dd>
        </div>
        <div>
          <dt>Diperiksa terakhir</dt>
          <dd>{latest ? <time dateTime={latest.at}>{formatTime(latest.at)}</time> : '—'}</dd>
        </div>
      </dl>
      <div className="strip">
        <div className="strip-heading">
          <h3>24 jam terakhir</h3>
          <span><strong>{uptime == null ? '—' : percent.format(uptime)}</strong> uptime {retentionDays} hari</span>
        </div>
        <div className="intervals" aria-hidden="true">
          {slots.map((sample, index) =>
            <span key={index} data-reading={sample?.status ?? 'empty'}
              title={sample ? formatTime(sample.at) + ' · ' + sample.status.toUpperCase() : undefined} />,
          )}
        </div>
        <p className="sample-count">{known} dari {samples} pemeriksaan memiliki hasil UP atau DOWN</p>
      </div>
    </motion.article>
  )
}

function Dashboard() {
  const { checks, phase, now } = useChecks()
  const services = useMemo(() => targets.map((target) => ({
    target,
    history: serviceHistory(checks, target.id, now),
  })), [checks, now])
  const incidents = services.flatMap(({ target, history }) =>
    history.incidents.map((incident) => ({ ...incident, name: target.name, id: target.id })),
  ).sort((a, b) => Date.parse(b.start) - Date.parse(a.start))

  const hasSamples = services.some(({ history }) => history.samples > 0)
  const fresh = services.some(({ history }) =>
    history.latest && now - Date.parse(history.latest.at) <= staleMinutes * 60_000,
  )

  return (
    <>
      <a href="#status" className="skip-link">Lewati ke status layanan</a>
      <Header />
      <main className="shell main" id="status">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">Status layanan</h1>
            <p>Ketersediaan HTTP Production dan UAT KartuRT.</p>
          </div>
          <div className="schedule"><Clock size={16} aria-hidden="true" /> Pemeriksaan tiap {intervalMinutes} menit</div>
        </section>

        <p className={phase === 'ready' && fresh ? 'sr-only' : 'notice'} role="status">
          {phase === 'loading' ? 'Memuat hasil pemeriksaan…'
            : phase === 'error' ? 'Riwayat belum dapat dimuat. Dasbor akan mencoba lagi dalam satu menit.'
            : fresh ? 'Hasil pemeriksaan tersedia.'
            : hasSamples ? 'Pemeriksaan terjadwal terlambat. Lihat waktu pemeriksaan terakhir.'
            : 'Menunggu hasil pemeriksaan pertama.'}
        </p>

        <div className="services">
          {services.map(({ target, history }) =>
            <ServiceCard key={target.id} target={target} history={history} now={now} />,
          )}
        </div>

        <ul className="legend" aria-label="Keterangan grafik">
          <li><i data-reading="up" /> UP</li>
          <li><i data-reading="down" /> DOWN</li>
          <li><i data-reading="unknown" /> UNKNOWN</li>
          <li><i data-reading="empty" /> Tanpa sampel</li>
        </ul>

        <div className="details">
          <section className="history" aria-labelledby="history-title">
            <div className="section-title">
              <History size={21} aria-hidden="true" />
              <h2 id="history-title">Riwayat gangguan</h2>
              <span>{retentionDays} hari</span>
            </div>
            {incidents.length > 0 ? (
              <ol className="incident-list">
                {incidents.map((incident) => (
                  <li key={incident.id + incident.start}>
                    <strong>{incident.name}</strong>
                    <span><time dateTime={incident.start}>{formatTime(incident.start)}</time> <ArrowRight size={14} aria-hidden="true" />
                      {incident.end ? <time dateTime={incident.end}>{formatTime(incident.end)}</time> : 'Belum ada hasil UP'}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="history-empty"><ArrowDownRight size={18} aria-hidden="true" />
                {hasSamples ? 'Belum ada hasil DOWN yang tercatat.' : 'Riwayat tersedia setelah pemeriksaan pertama.'}
              </p>
            )}
          </section>
          <aside className="method" aria-labelledby="method-title">
            <div className="section-title">
              <Info size={20} aria-hidden="true" />
              <h2 id="method-title">Cara membaca status</h2>
            </div>
            <p>GET homepage mengukur keterjangkauan HTTP hingga header respons diterima. Kesehatan database, login, dan autentikasi berada di luar cakupan pemeriksaan.</p>
            <p><strong>UNKNOWN</strong> berarti hasil belum pasti, misalnya saat akses UAT dibatasi atau pemeriksaan terlambat. Uptime dihitung dari sampel UP dan DOWN.</p>
          </aside>
        </div>
      </main>
      <footer className="shell footer">
        <span>KartuRT Monitoring</span>
        <a href={source}>Kode sumber dan pengaturan notifikasi <ArrowRight size={15} aria-hidden="true" /></a>
      </footer>
    </>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="shell main">
        <h1>Status layanan</h1>
        <p>Dasbor belum dapat ditampilkan.</p>
        <button className="theme-switch reload" onClick={() => window.location.reload()}>Muat ulang</button>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user"><Dashboard /></MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
