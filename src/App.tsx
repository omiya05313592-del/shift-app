import './index.css'
import { Header } from './components/layout/Header'
import { BottomNav } from './components/layout/BottomNav'
import { ShiftPage } from './pages/ShiftPage'
import { RequestsPage } from './pages/RequestsPage'
import { AdminPage } from './pages/AdminPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useShiftStore } from './store/shiftStore'

export default function App() {
  const { currentPage } = useShiftStore()

  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-svh bg-gray-50" translate="no">
        <Header />
        <main className="flex-1">
          {currentPage === 'shift'    && <ShiftPage />}
          {currentPage === 'requests' && <RequestsPage />}
          {currentPage === 'admin'    && <AdminPage />}
        </main>
        <BottomNav />
      </div>
    </ErrorBoundary>
  )
}
