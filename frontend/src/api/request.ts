import axios from 'axios';
import { ElMessage } from 'element-plus';

const request = axios.create({
  baseURL: '/api',
  timeout: 120000,
});

/** 请求拦截：统一带 token */
request.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('fae_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

/** 响应拦截：统一解包 { code, msg, data } */
request.interceptors.response.use(
  (resp) => {
    const body = resp.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data;
      ElMessage.error(body.msg || '操作失败');
      return Promise.reject(new Error(body.msg || '操作失败'));
    }
    return body;
  },
  (err) => {
    const status = err?.response?.status;
    const msg = err?.response?.data?.msg || err.message || '网络异常';
    if (status === 401) {
      localStorage.removeItem('fae_token');
      localStorage.removeItem('fae_user');
      ElMessage.error('登录已过期，请重新登录');
      // 避免在登录页反复跳转
      if (!location.hash.includes('/login')) location.hash = '#/login';
    } else if (status === 403) {
      ElMessage.error(msg);
    } else {
      ElMessage.error(msg);
    }
    return Promise.reject(err);
  },
);

export default request;
