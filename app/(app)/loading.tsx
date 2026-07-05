import Skeleton from '@/components/ui/Skeleton'

export default function AppLoading() {
  return (
    <div className="page-shell" aria-busy="true" aria-label="Loading">
      <header className="page-header dashboard-header">
        <div>
          <Skeleton width={140} height={11} radius={999} />
          <Skeleton width={260} height={38} radius={10} style={{ marginTop: 14 }} />
          <Skeleton width={420} height={14} radius={6} style={{ marginTop: 14 }} />
        </div>
        <Skeleton width={190} height={42} radius={7} />
      </header>

      <section className="dashboard-metrics grid md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="app-card dashboard-kpi">
            <div className="flex items-center justify-between">
              <Skeleton width={90} height={11} radius={999} />
              <Skeleton width={16} height={16} radius={4} />
            </div>
            <div>
              <Skeleton width={110} height={44} radius={8} />
              <Skeleton width={150} height={12} radius={6} style={{ marginTop: 16 }} />
            </div>
          </div>
        ))}
      </section>

      <section className="dashboard-primary-grid grid items-stretch xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.75fr)]">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="app-card dashboard-panel">
            <div className="card-header">
              <Skeleton width={160} height={16} radius={6} />
            </div>
            <div className="flex flex-col gap-4 p-6">
              {Array.from({ length: 4 }).map((_, r) => (
                <Skeleton key={r} height={20} radius={6} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
