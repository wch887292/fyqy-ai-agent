/**
 * 用户状态：登录态、身份信息、菜单权限
 * 菜单由后端按角色裁剪后下发，前端不做二次硬编码
 */
import { defineStore } from 'pinia';
import { userApi } from '../api';

export interface MenuNode {
  code: string;
  name: string;
  path: string;
  icon?: string;
  children?: MenuNode[];
}

export interface UserProfile {
  user_id: number;
  username: string;
  real_name: string;
  phone: string;
  post: string;
  dept_id: number;
  dept_name: string;
  is_super: number;
  is_partner: number;
  data_scope: number;
  enterprise_id: number;
  enterprise_name: string;
  menus: MenuNode[];
}

const TOKEN_KEY = 'fae_token';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    profile: null as UserProfile | null,
    loaded: false,
  }),

  getters: {
    menus: (s): MenuNode[] => s.profile?.menus || [],
    isSuper: (s): boolean => Number(s.profile?.is_super) === 1,
    isPartner: (s): boolean => Number(s.profile?.is_partner) === 1,
    realName: (s): string => s.profile?.real_name || s.profile?.username || '',
    enterpriseName: (s): string => s.profile?.enterprise_name || '',
    /** 拍平的菜单编码集合，用于按钮级/页面级鉴权 */
    menuCodes(s): string[] {
      const out: string[] = [];
      const walk = (nodes: MenuNode[]) => {
        for (const n of nodes) {
          out.push(n.code);
          if (n.children) walk(n.children);
        }
      };
      walk(s.profile?.menus || []);
      return out;
    },
  },

  actions: {
    async login(username: string, password: string) {
      const data: any = await userApi.login({ username, password });
      this.token = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
      await this.loadProfile();
      return data;
    },

    async loadProfile() {
      const data: any = await userApi.profile();
      this.profile = data;
      this.loaded = true;
      return data;
    },

    /** 有 token 但没拉过 profile 时补拉（刷新页面场景） */
    async ensureProfile() {
      if (this.token && !this.loaded) await this.loadProfile();
    },

    has(code: string): boolean {
      if (this.isSuper) return true;
      return this.menuCodes.includes(code);
    },

    async logout() {
      try {
        await userApi.logout();
      } catch {
        /* 忽略登出接口异常，本地状态照常清理 */
      }
      this.token = '';
      this.profile = null;
      this.loaded = false;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('fae_user');
    },
  },
});
