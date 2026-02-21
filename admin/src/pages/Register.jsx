import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Background from '../assets/BackGround.png';
import TwoLog from '../assets/Logo1.png';

const Register = () => {
    const [step, setStep] = useState('code'); // 'code', 'confirm', 'password'
    const [userCode, setUserCode] = useState('');
    const [userInfo, setUserInfo] = useState(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLookup = async (e) => {
        e.preventDefault();
        if (userCode.length !== 7) {
            setError('Enter valid 7-character user code');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const { data } = await axios.get(`http://localhost:5000/api/users/lookup/${userCode.toUpperCase()}`);

            // Only allow Admin and Security Personnel to register here
            if (data.role !== 'Admin' && data.role !== 'Security Personnel') {
                setError('Not authorized. This page is for Admin and Security staff only.');
                setLoading(false);
                return;
            }

            if (data.registered) {
                setError('This account is already registered. Please login.');
                setLoading(false);
                return;
            }

            setUserInfo(data);
            setStep('confirm');
        } catch (err) {
            setError(err.response?.data?.message || 'User not found');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await axios.post('http://localhost:5000/api/users/register-password', {
                userCode: userCode.toUpperCase(),
                password
            });
            alert('Registration successful! You can now log in.');
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed');
        } finally {
            setLoading(false);
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
                <h2 className="text-2xl font-extrabold mb-6 flex items-center gap-3">
                    <img src={TwoLog} alt="" className="w-10 h-auto" />
                    ADMIN REGISTRATION
                </h2>

                {error && <p className="text-red-500 mb-4 bg-red-50 p-3 rounded-xl border border-red-100 text-xs font-bold uppercase tracking-widest">{error}</p>}

                {step === 'code' && (
                    <form onSubmit={handleLookup}>
                        <div className="mb-6">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest ml-1 mb-1">Enter User Code</label>
                            <input
                                type="text"
                                className="w-full px-6 py-3 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50 text-center text-xl font-black tracking-[0.3em] uppercase"
                                value={userCode}
                                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                                placeholder="XXXXXXX"
                                maxLength={7}
                                required
                            />
                            <p className="mt-2 text-[10px] text-gray-400 font-bold uppercase text-center tracking-tighter italic">
                                Enter the unique code provided to you
                            </p>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full px-6 py-3 rounded-2xl bg-[#2f4863] text-white font-extrabold cursor-pointer hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'LOOKING UP...' : 'CONTINUE'}
                        </button>
                    </form>
                )}

                {step === 'confirm' && userInfo && (
                    <div className="animate-in fade-in transition-all duration-300">
                        <div className="bg-gray-50 rounded-2xl p-6 mb-6 border border-gray-100">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Identity Confirmed</p>
                            <h3 className="text-xl font-black text-gray-800 mb-1">{userInfo.lastName}, {userInfo.firstName}</h3>
                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                                {userInfo.role}
                            </span>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('password')}
                                className="flex-1 px-6 py-3 rounded-2xl bg-[#2f4863] text-white font-extrabold hover:bg-red-600 transition-colors"
                            >
                                THIS IS ME
                            </button>
                            <button
                                onClick={() => { setStep('code'); setUserInfo(null); }}
                                className="px-6 py-3 rounded-2xl bg-gray-100 text-gray-500 font-extrabold hover:bg-gray-200 transition-colors"
                            >
                                NOT ME
                            </button>
                        </div>
                    </div>
                )}

                {step === 'password' && (
                    <form onSubmit={handleRegister} className="animate-in slide-in-from-right-4 transition-all duration-300">
                        <div className="mb-6">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest ml-1 mb-1">Set Password</label>
                            <input
                                type="password"
                                className="w-full px-6 py-3 rounded-full bg-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-[#2f4863]/50"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="MINIMUM 6 CHARACTERS"
                                minLength={6}
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full px-6 py-3 rounded-2xl bg-[#2f4863] text-white font-extrabold cursor-pointer hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'REGISTERING...' : 'FINISH REGISTRATION'}
                        </button>
                    </form>
                )}

                <div className="mt-8 text-center border-t border-gray-50 pt-4">
                    <button
                        onClick={() => navigate('/')}
                        className="text-[10px] font-black text-[#2f4863] uppercase tracking-widest hover:text-red-600 transition-colors"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Register;
