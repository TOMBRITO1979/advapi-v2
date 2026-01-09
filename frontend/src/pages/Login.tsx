import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    try {
      if (isSetup) {
        await authService.setup(nome, email, senha);
        setIsSetup(false);
        setErro('');
        alert('Usuario criado! Faca login.');
      } else {
        await login(email, senha);
        navigate('/');
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Erro ao fazer login';
      setErro(msg);

      // Se nenhum usuario existe, mostra form de setup
      if (msg.includes('Setup')) {
        setIsSetup(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ADVAPI</h1>
          <p className="text-gray-600 mt-2">
            {isSetup ? 'Criar usuario inicial' : 'Dashboard de Publicacoes'}
          </p>
        </div>

        {erro && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSetup && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Seu nome"
                required={isSetup}
              />
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="********"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Aguarde...' : isSetup ? 'Criar usuario' : 'Entrar'}
          </button>
        </form>

        {!isSetup && (
          <button
            onClick={() => setIsSetup(true)}
            className="w-full mt-4 text-sm text-blue-600 hover:underline"
          >
            Primeiro acesso? Criar usuario
          </button>
        )}

        {isSetup && (
          <button
            onClick={() => setIsSetup(false)}
            className="w-full mt-4 text-sm text-gray-600 hover:underline"
          >
            Ja tenho conta, fazer login
          </button>
        )}
      </div>
    </div>
  );
}
