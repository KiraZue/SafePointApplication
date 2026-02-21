import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Layout from '../components/Layout';
import TwoLog from '../assets/Logo1.png';

const ChangePasswordButton = ({ userId, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const handleChange = async () => {
    try {
      setLoading(true);
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
      await axios.post(`http://localhost:5000/api/users/${userId}/change-password`, { newPassword, password: adminPassword }, config);
      setOpen(false);
      setNewPassword('');
      setAdminPassword('');
      onChanged && onChanged();
    } catch (err) {
      alert(err.response?.data?.message || 'Password change failed');
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <button className="text-red-600 hover:text-red-700 transition-colors" onClick={() => setOpen(true)}>Change Password</button>
      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center">
          <div className="relative bg-white p-6 rounded-2xl shadow-lg w-[560px] transition-all">
            <h3 className="text-2xl font-extrabold mb-4">Change Password</h3>
            <div className="mb-3 flex items-center gap-4">
              <span className="w-40 text-base font-semibold">New Password</span>
              <input
                type="password"
                className="flex-1 px-4 py-2 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="mb-4 flex items-center gap-4">
              <span className="w-40 text-base font-semibold">Admin Password</span>
              <input
                type="password"
                className="flex-1 px-4 py-2 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-center space-x-4 mt-2">
              <button className="px-6 py-2 rounded-full bg-[#2f4863] text-white hover:brightness-110" onClick={() => setOpen(false)}>CANCEL</button>
              <button className="px-6 py-2 rounded-full bg-[#2f4863] text-white hover:brightness-110" onClick={handleChange} disabled={loading || !newPassword || !adminPassword}>
                {loading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
            <img src={TwoLog} alt="" className="absolute bottom-4 left-4 w-16 h-auto opacity-90" />
          </div>
        </div>
      )}
    </>
  );
};

const DeleteButton = ({ userId, onDeleted }) => {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const handleDelete = async () => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
      await axios.post(`http://localhost:5000/api/users/${userId}/delete`, { password }, config);
      setOpen(false);
      setPassword('');
      onDeleted && onDeleted();
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed');
    }
  };
  return (
    <>
      <button className="text-red-600 hover:text-red-700 transition-colors" onClick={() => setOpen(true)}>Delete</button>
      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center">
          <div className="relative bg-white p-6 rounded-2xl shadow-lg w-[560px] transition-all">
            <h3 className="text-2xl font-extrabold mb-4">Delete User</h3>
            <input
              type="password"
              className="w-full px-4 py-2 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50 mb-4"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin Password"
            />
            <div className="flex justify-center space-x-4 mt-2">
              <button className="px-6 py-2 rounded-full bg-[#2f4863] text-white hover:brightness-110" onClick={() => setOpen(false)}>CANCEL</button>
              <button className="px-6 py-2 rounded-full bg-[#2f4863] text-white hover:brightness-110" onClick={handleDelete}>Delete</button>
            </div>
            <img src={TwoLog} alt="" className="absolute bottom-4 left-4 w-16 h-auto opacity-90" />
          </div>
        </div>
      )}
    </>
  );
};

const Users = () => {
  const [users, setUsers] = useState([]);
  const location = useLocation();
  const navigate = useNavigate();
  const roleParam = new URLSearchParams(location.search).get('role');
  const [activeTab, setActiveTab] = useState(roleParam || 'Student');
  const showModal = new URLSearchParams(location.search).get('add') === '1';
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    middleName: '',
  });

  const roles = ['Student', 'Teacher', 'Admin', 'Security Personnel', 'Deleted Users', 'Changed Users'];

  const fetchUsers = useCallback(async () => {
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = {
        headers: { Authorization: `Bearer ${userInfo.token}` },
      };
      const url =
        activeTab === 'Deleted Users'
          ? 'http://localhost:5000/api/users/deleted'
          : activeTab === 'Changed Users'
            ? 'http://localhost:5000/api/users/changed'
            : 'http://localhost:5000/api/users';
      const { data } = await axios.get(url, config);
      setUsers(data);
    } catch (error) {
      console.error(error);
    }
  }, [activeTab]);

  useEffect(() => {
    const t = setTimeout(fetchUsers, 0);
    return () => clearTimeout(t);
  }, [fetchUsers]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = {
        headers: { Authorization: `Bearer ${userInfo.token}` },
      };
      await axios.post(
        'http://localhost:5000/api/users',
        { ...formData, role: activeTab },
        config
      );
      navigate('/users');
      setFormData({ firstName: '', lastName: '', middleName: '' });
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.message || 'Error adding user');
    }
  };

  const filteredUsers = (
    activeTab === 'Deleted Users'
      ? users
      : activeTab === 'Changed Users'
        ? users
        : users.filter((user) => user.role === activeTab)
  ).filter((user) => {
    const query = searchQuery.toLowerCase();
    const fullName = `${user.firstName} ${user.lastName} ${user.middleName || ''}`.toLowerCase();
    const reverseName = `${user.lastName} ${user.firstName}`.toLowerCase();
    const userCode = (user.userCode || '').toLowerCase();

    return fullName.includes(query) || reverseName.includes(query) || userCode.includes(query);
  });

  return (
    <Layout>
      <h1 className="text-3xl font-extrabold tracking-wide text-gray-900 text-center mb-6">ADMIN PANEL</h1>

      <div className="flex items-center mb-6 bg-red-100 rounded-full px-3 py-2">
        {roles.map((role) => (
          <button
            key={role}
            className={`px-4 py-2 mr-2 rounded-full transition-all duration-200 ${activeTab === role ? 'font-bold underline underline-offset-4' : 'text-gray-600 hover:text-gray-800'
              }`}
            onClick={() => {
              setActiveTab(role);
              navigate(`/users?role=${encodeURIComponent(role)}`);
            }}
          >
            {role}s
          </button>
        ))}
      </div>

      <div className="mb-6 relative">
        <input
          type="text"
          placeholder="Smart Search: Enter Name or User Code..."
          className="w-full px-6 py-3 rounded-full bg-white shadow-md border border-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2f4863]/30 transition-all pl-12"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden max-h-[calc(100vh-16rem)] overflow-y-auto custom-scrollbar">
        <table className="min-w-full">
          <thead className="bg-[#2f4863] text-white sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                User Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                Role
              </th>
              {activeTab !== 'Deleted Users' && activeTab !== 'Changed Users' && (
                <>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Registered
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Password
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Action
                  </th>
                </>
              )}
              {activeTab === 'Deleted Users' && (
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  Deleted By
                </th>
              )}
              {activeTab === 'Changed Users' && (
                <>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Changed At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                    Changed By
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.map((user) => (
              <tr key={user._id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.lastName}, {user.firstName} {user.middleName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{user.userCode}</td>
                <td className="px-6 py-4 whitespace-nowrap">{user.role}</td>
                {activeTab !== 'Deleted Users' && activeTab !== 'Changed Users' && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.registered ? 'Registered' : 'Not Registered'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <ChangePasswordButton userId={user._id} onChanged={fetchUsers} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <DeleteButton userId={user._id} onDeleted={fetchUsers} />
                    </td>
                  </>
                )}
                {activeTab === 'Deleted Users' && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.deletedBy ? `${user.deletedBy.lastName}, ${user.deletedBy.firstName} (${user.deletedBy.userCode})` : '—'}
                  </td>
                )}
                {activeTab === 'Changed Users' && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.passwordChangedAt ? new Date(user.passwordChangedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.passwordChangedBy ? `${user.passwordChangedBy.lastName}, ${user.passwordChangedBy.firstName} (${user.passwordChangedBy.userCode})` : '—'}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan="3" className="px-6 py-4 text-center text-gray-500">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center">
          <div className="relative bg-white p-6 rounded-2xl shadow-lg w-[560px] transition-all">
            <h2 className="text-2xl font-extrabold mb-4">ADD {activeTab.toUpperCase()}</h2>
            <form onSubmit={handleAddUser}>
              <div className="mb-3">
                <label className="block text-sm font-semibold uppercase tracking-wide">FIRST NAME</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-semibold uppercase tracking-wide">MIDDLE NAME</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50"
                  value={formData.middleName}
                  onChange={(e) =>
                    setFormData({ ...formData, middleName: e.target.value })
                  }
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm font-semibold uppercase tracking-wide">LAST NAME</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  required
                />
              </div>

              <div className="flex justify-center space-x-4 mt-2">
                <button
                  type="button"
                  onClick={() => navigate('/users')}
                  className="px-6 py-2 rounded-full bg-[#2f4863] text-white hover:brightness-110"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-full bg-[#2f4863] text-white hover:brightness-110"
                >
                  ADD
                </button>
              </div>
            </form>
            <img src={TwoLog} alt="" className="absolute bottom-4 left-4 w-16 h-auto opacity-90" />
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Users;
