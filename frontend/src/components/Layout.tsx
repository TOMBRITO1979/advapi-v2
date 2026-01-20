import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  FileText,
  Server,
  Activity,
  BarChart3,
  Database,
  LogOut,
  Menu,
  X,
  Bell,
  Cpu,
  Key,
  Globe,
  Search,
} from 'lucide-react';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/advogados', label: 'Advogados', icon: Users },
  { path: '/publicacoes', label: 'Publicacoes', icon: FileText },
  { path: '/banco', label: 'Banco de Dados', icon: Database },
  { path: '/consultas', label: 'Raspagens', icon: Search },
  { path: '/proxies', label: 'Proxies', icon: Server },
  { path: '/fila', label: 'Fila', icon: Activity },
  { path: '/workers', label: 'Workers', icon: Cpu },
  { path: '/logs', label: 'Logs / Alertas', icon: Bell },
  { path: '/requests', label: 'Requisicoes API', icon: Globe },
  { path: '/metricas', label: 'Metricas', icon: BarChart3 },
  { path: '/api-keys', label: 'API Keys', icon: Key },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-gray-900 transform transition-transform lg:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800 flex-shrink-0">
          <h1 className="text-xl font-bold text-white">ADVAPI</h1>
          <button
            className="lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-3 text-sm ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={20} className="mr-3" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">{usuario?.nome}</p>
              <p className="text-xs text-gray-400">{usuario?.email}</p>
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-white"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="h-16 bg-white shadow-sm flex items-center px-4">
          <button
            className="lg:hidden text-gray-600 hover:text-gray-900"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
