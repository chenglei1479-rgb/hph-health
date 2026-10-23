import '@/assets/main.css'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { AppLogo } from '@/components/AppLogo'
import { OpenScienceLogoLoader } from '@/components/OpenScienceLogoLoader'

// Isolated production components: no runtime, network, or demo assets.
function Fixture(): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  return (
    <main style={{ padding: 48, display: 'grid', gap: 32, width: 480 }}>
      <section aria-label="Startup" style={{ height: 120 }}>
        {loading ? <OpenScienceLogoLoader /> : null}
      </section>
      <section aria-label="Sidebar logo">
        <button aria-label="All projects" type="button">
          <AppLogo interactive busy={busy} className="size-5" />
        </button>
      </section>
      <section aria-label="Static logo">
        <AppLogo className="size-4" />
      </section>
      <button onClick={() => setBusy(!busy)}>Toggle running</button>
      <button onClick={() => setLoading(!loading)}>Toggle loader</button>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Fixture />)
