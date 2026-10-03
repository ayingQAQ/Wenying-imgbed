import axios from 'axios';

// 创建axios实例
const instance = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/' : '/api',
  withCredentials: true, // 始终携带 Cookie（HttpOnly session cookie）
});

instance.interceptors.request.use(config => {
  let visitorId = localStorage.getItem('imgbedVisitorId');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('imgbedVisitorId', visitorId);
  }
  config.headers['X-Visitor-ID'] = visitorId;
  return config;
});

export default instance;
