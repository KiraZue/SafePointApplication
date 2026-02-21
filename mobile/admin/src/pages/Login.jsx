import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Background from '../assets/BackGorund.png';
import TwoLog from '../assets/2log.png';

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const payload = {};
      if (/^[A-Z0-9]{7}$/i.test(identifier.trim())) {
        payload.userCode = identifier.trim().toUpperCase();
      } else {
        payload.fullName = identifier.trim();
      }
      payload.password = password;
      const { data } = await axios.post('http://localhost:5000/api/users/login', payload);

      if (data.role === 'Admin') {
        localStorage.setItem('userInfo', JSON.stringify(data));
        navigate('/users');
      } else {
        setError('Not authorized. Only Admins can access this panel.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{
        backgroundColor: '#ffffff',
        backgroundImage: `url(${Background})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div className="w-[520px] p-8 bg-white rounded-2xl shadow-lg">
        <h2 className="text-2xl font-extrabold mb-4">ADMIN LOGIN</h2>
        {error && <p className="text-red-500 mb-4 bg-red-50 p-3 rounded-xl border border-red-100 text-xs font-bold uppercase tracking-widest">{error}</p>}
        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest ml-1 mb-1">Admin ID</label>
            <input
              type="text"
              className="w-full px-4 py-2 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>
          <div className="mb-5">
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest ml-1 mb-1">Password</label>
            <input
              type="password"
              className="w-full px-4 py-2 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <img src={TwoLog} alt="" className="w-12 h-auto" />
            <span className="w-2 h-2 bg-lime-500 rounded-full"></span>
            <button
              type="submit"
              className="flex-1 px-6 py-3 rounded-2xl bg-[#2f4863] text-white font-extrabold cursor-pointer hover:bg-lime-500 hover:text-black transition-colors"
            >
              LOGIN
            </button>
          </div>
        </form>
        <div className="mt-6 text-center">
          <p className="text-sm font-bold text-gray-500">
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/register')}
              className="text-[#2f4863] hover:text-lime-500 underline transition-colors"
            >
              Register here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
