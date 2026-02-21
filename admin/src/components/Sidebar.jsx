import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';

const Sidebar = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const roleParam = params.get('role');
  const activeRole = roleParam || 'Student';
  const [unseenReportsCount, setUnseenReportsCount] = useState(0);

  useEffect(() => {
    const fetchUnseenCount = async () => {
      try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        if (!userInfo || !userInfo.token) return;

        const config = {
          headers: { Authorization: `Bearer ${userInfo.token}` },
        };
        const { data } = await axios.get('http://localhost:5000/api/reports/unseen', config);

        if (typeof data.count === 'number') {
          // If the count increased, trigger a browser notification
          if (data.count > unseenReportsCount) {
            if (Notification.permission === 'granted') {
              new Notification('New Emergency Report', {
                body: `There are ${data.count} unseen emergency reports.`,
                icon: '/logo192.png' // Adjust icon path if needed
              });
            }
          }
          setUnseenReportsCount(data.count);
        }
      } catch (error) {
        console.error('Error fetching unseen reports count:', error);
      }
    };

    // Request notification permission on mount
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    fetchUnseenCount();
    const interval = setInterval(fetchUnseenCount, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [unseenReportsCount]);

  const resetUnseenCount = async () => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      if (!userInfo || !userInfo.token) return;

      const config = {
        headers: { Authorization: `Bearer ${userInfo.token}` },
      };
      await axios.put('http://localhost:5000/api/users/profile', { lastSeenReport: new Date() }, config);
      setUnseenReportsCount(0);
    } catch (error) {
      console.error('Error resetting unseen count:', error);
    }
  };

  const menuItems = [
    { name: 'Dashboard', path: '/users', style: 'bg-[#2f4863] text-white font-bold cursor-pointer hover:bg-red-600 transition-colors' },
    { name: 'Emergency Report', path: '/reports', style: 'bg-[#2f4863] text-white font-bold cursor-pointer hover:bg-red-600 transition-colors', showBadge: true },
  ];

  return (
    <div className="w-64 bg-transparent text-gray-800 flex flex-col items-center pt-6">
      <div className="w-56 rounded-2xl shadow-md bg-white p-4 flex flex-col items-stretch gap-4">
        <nav className="flex-1">
          <ul className="space-y-3">
            {menuItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={item.name === 'Emergency Report' ? resetUnseenCount : undefined}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 relative ${item.style} ${location.pathname === item.path ? 'ring-2 ring-offset-2 ring-[#2f4863]' : ''
                    }`}
                >
                  <span>{item.name}</span>
                  {item.showBadge && unseenReportsCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] h-[18px] flex items-center justify-center border-2 border-white shadow-sm z-10">
                      {unseenReportsCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
            <li>
              {(activeRole !== 'Deleted Users' && activeRole !== 'Changed Users') && (
                <Link to={`/users?add=1&role=${encodeURIComponent(activeRole)}`} className="block">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#2f4863] text-white font-bold cursor-pointer hover:bg-red-600 transition-colors">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white text-[#2f4863]">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span>{`Add ${activeRole}`}</span>
                  </div>
                </Link>
              )}
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;
