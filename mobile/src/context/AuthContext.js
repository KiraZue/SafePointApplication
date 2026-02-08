  import React, { createContext, useState, useContext, useEffect } from 'react';
  import api from '../services/api';
  import AsyncStorage from '@react-native-async-storage/async-storage';

  const AuthContext = createContext();

  export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [splashLoading, setSplashLoading] = useState(true);

    useEffect(() => {
      checkUser();
    }, []);

    const checkUser = async () => {
      try {
        const userInfo = await AsyncStorage.getItem('userInfo');
        if (userInfo) {
          const parsedUser = JSON.parse(userInfo);
          setUser(parsedUser);
          if (parsedUser.token) {
            api.defaults.headers.common['Authorization'] = `Bearer ${parsedUser.token}`;
          }
        }
      } catch (e) {
        console.log('Error loading user info', e);
      } finally {
        setSplashLoading(false);
      }
    };

    const login = async (identifier, password) => {
      setLoading(true);
      try {
        const payload = {};
        if (/^[A-Z0-9]{7}$/i.test(identifier.trim())) {
          payload.userCode = identifier.trim().toUpperCase();
        } else {
          payload.fullName = identifier.trim();
        }
        payload.password = password;
        const response = await api.post('/users/login', payload);
        setUser(response.data);
        // Set token for future requests
        api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        await AsyncStorage.setItem('userInfo', JSON.stringify(response.data));
        setLoading(false);
        return { success: true };
      } catch (error) {
        setLoading(false);
        return { 
          success: false, 
          message: error.response?.data?.message || 'Login failed' 
        };
      }
    };

    const logout = () => {
      setUser(null);
      AsyncStorage.removeItem('userInfo');
      delete api.defaults.headers.common['Authorization'];
    };

    return (
      <AuthContext.Provider value={{ user, login, logout, loading, splashLoading }}>
        {children}
      </AuthContext.Provider>
    );
  };

  export const useAuth = () => useContext(AuthContext);
