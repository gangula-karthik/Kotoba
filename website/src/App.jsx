import { useMemo } from 'react'
import Dither from './components/Dither'
import { Button } from '@/components/ui/button'
import { Download, Apple, Monitor } from 'lucide-react'

function getOS() {
  const ua = navigator.userAgent
  if (ua.includes('Win')) return 'windows'
  if (ua.includes('Mac')) return 'mac'
  if (ua.includes('Linux')) return 'linux'
  return 'unknown'
}

const GITHUB_REPO = 'https://github.com/gangula-karthik/Kotoba'
const NIGHTLY = 'https://nightly.link/gangula-karthik/Kotoba/workflows/ci-build/main'

const platforms = {
  mac: {
    label: 'macOS',
    href: `${NIGHTLY}/dist-electron-macos.zip`,
  },
  windows: {
    label: 'Windows',
    href: `${NIGHTLY}/dist-electron-windows.zip`,
  },
  linux: {
    label: 'Linux',
    href: `${NIGHTLY}/dist-electron-linux.zip`,
  },
}

function PlatformIcon({ os, className }) {
  if (os === 'mac') return <Apple className={className} />
  return <Monitor className={className} />
}

export default function App() {
  const detectedOS = useMemo(() => getOS(), [])
  const primaryKey = detectedOS in platforms ? detectedOS : 'mac'
  const primary = platforms[primaryKey]
  const others = Object.entries(platforms).filter(([key]) => key !== primaryKey)

  return (
    <div className="relative h-screen overflow-hidden">
      <div className="fixed inset-0 z-0">
        <Dither
          waveColor={[0.5, 0.5, 0.5]}
          disableAnimation={false}
          enableMouseInteraction
          mouseRadius={0.3}
          colorNum={4}
          waveAmplitude={0.3}
          waveFrequency={3}
          waveSpeed={0.05}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center h-full" style={{ padding: '0 1.5rem' }}>
        <div
          className="flex flex-col items-center text-center mx-auto bg-black/55 backdrop-blur-lg rounded-2xl border border-white/[0.06]"
          style={{ padding: '2.25rem 2.5rem', maxWidth: '360px', width: '100%' }}
        >
          <img
            src="/logo.png"
            alt="Koto"
            className="rounded-xl"
            style={{ width: '56px', height: '56px', marginBottom: '1.25rem' }}
          />

          <h1
            className="text-white"
            style={{ fontFamily: 'var(--font-pixel)', fontSize: '2.75rem', lineHeight: 1, marginBottom: '0.75rem', letterSpacing: '-0.02em' }}
          >
            koto
          </h1>

          <p className="text-white/60" style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
            speech-to-text dictation.
          </p>
          <p className="text-white/35" style={{ fontSize: '0.75rem', marginBottom: '1.75rem' }}>
            local. private. fast.
          </p>

          <a href={primary.href} target="_blank" rel="noopener noreferrer" style={{ width: '100%' }}>
            <Button size="lg" className="w-full gap-2 rounded-lg font-medium" style={{ height: '2.75rem', fontSize: '0.875rem' }}>
              <Download style={{ width: '15px', height: '15px' }} />
              Download for {primary.label}
            </Button>
          </a>

          <div className="flex justify-center" style={{ gap: '0.5rem', marginTop: '0.75rem', marginBottom: '1.25rem' }}>
            {others.map(([key, platform]) => (
              <a key={key} href={platform.href} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="outline"
                  className="rounded-md border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.07] hover:text-white/80"
                  style={{ height: '2rem', padding: '0 0.75rem', fontSize: '0.75rem', gap: '0.375rem' }}
                >
                  <PlatformIcon os={key} style={{ width: '12px', height: '12px' }} />
                  {platform.label}
                </Button>
              </a>
            ))}
          </div>

          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/20 hover:text-white/45 transition-colors"
            style={{ fontSize: '0.65rem' }}
          >
            github
          </a>
        </div>
      </div>
    </div>
  )
}
