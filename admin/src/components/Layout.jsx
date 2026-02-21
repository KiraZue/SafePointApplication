import Sidebar from './Sidebar';
import Background from '../assets/BackGround.png';
import Logo from '../assets/Logo1.png';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const userInfo = (() => {
    try {
      return JSON.parse(localStorage.getItem('userInfo')) || null;
    } catch {
      return null;
    }
  })();
  const [showLogout, setShowLogout] = useState(false);
  const handleConfirmLogout = () => {
    localStorage.removeItem('userInfo');
    navigate('/');
  };
  return (
    <div
      className="flex min-h-screen relative overflow-hidden"
      style={{
        backgroundColor: '#ffffff',
        backgroundImage: `url(${Background})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div className="w-64 flex flex-col items-center pt-6">
        <img src={Logo} alt="Logo" className="w-52 h-auto mb-1" />
        <div className="w-56 flex items-center gap-2 mb-3">
          <button
            onClick={() => setShowLogout(true)}
            aria-label="Logout"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white text-[#2f4863] shadow hover:brightness-95 transition-transform duration-200 hover:scale-105"
            title="Logout"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M16 17l5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 21H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-sm font-semibold tracking-wide">
            WELCOME {userInfo ? `${userInfo.firstName} ${userInfo.lastName}` : 'ADMIN'}
          </span>
        </div>
        <Sidebar />
      </div>
      <div className="flex-1 p-8 overflow-auto relative z-10">{children}</div>
      {showLogout && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="bg-white p-6 rounded-2xl shadow-lg w-[420px] text-center">
            <p className="text-xl font-extrabold mb-5">Are you sure you want to log out?</p>
            <div className="flex justify-center gap-6">
              <button
                className="px-6 py-2 rounded-full bg-[#2f4863] text-white font-bold cursor-pointer hover:bg-red-600 transition-colors"
                onClick={() => setShowLogout(false)}
              >
                CANCEL
              </button>
              <button
                className="px-6 py-2 rounded-full bg-[#2f4863] text-white font-bold cursor-pointer hover:bg-red-600 transition-colors"
                onClick={handleConfirmLogout}
              >
                YES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
