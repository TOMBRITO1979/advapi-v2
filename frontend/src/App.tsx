import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Advogados from './pages/Advogados';
import Publicacoes from './pages/Publicacoes';
import Proxies from './pages/Proxies';
import Fila from './pages/Fila';
import Metricas from './pages/Metricas';
import BancoDados from './pages/BancoDados';
import Logs from './pages/Logs';
import Workers from './pages/Workers';
import ApiKeys from './pages/ApiKeys';
import ApiRequests from './pages/ApiRequests';
import Consultas from './pages/Consultas';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/advogados" element={<Advogados />} />
                <Route path="/publicacoes" element={<Publicacoes />} />
                <Route path="/proxies" element={<Proxies />} />
                <Route path="/fila" element={<Fila />} />
                <Route path="/workers" element={<Workers />} />
                <Route path="/metricas" element={<Metricas />} />
                <Route path="/banco" element={<BancoDados />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/api-keys" element={<ApiKeys />} />
                <Route path="/requests" element={<ApiRequests />} />
                <Route path="/consultas" element={<Consultas />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
