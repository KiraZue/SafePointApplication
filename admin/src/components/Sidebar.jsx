import { Link, useLocation } from 'react-router-dom';

const Sidebar = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const roleParam = params.get('role');
  const activeRole = roleParam || 'Student';

  const menuItems = [
    { name: 'Dashboard', path: '/users', style: 'bg-[#2f4863] text-white font-bold cursor-pointer hover:bg-lime-500 hover:text-black transition-colors' },
    { name: 'Emergency Report', path: '/reports', style: 'bg-[#2f4863] text-white font-bold cursor-pointer hover:bg-lime-500 hover:text-black transition-colors' },
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
                  className={`block px-4 py-3 rounded-xl transition-all duration-200 ${item.style} ${
                    location.pathname === item.path ? 'ring-2 ring-offset-2 ring-[#2f4863]' : ''
                  }`}
                >
                  {item.name}
                </Link>
              </li>
            ))}
            <li>
              {(activeRole !== 'Deleted Users' && activeRole !== 'Changed Users') && (
                <Link to={`/users?add=1&role=${encodeURIComponent(activeRole)}`} className="block">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#2f4863] text-white font-bold cursor-pointer hover:bg-lime-500 hover:text-black transition-colors">
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
