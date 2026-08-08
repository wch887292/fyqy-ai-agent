/**
 * 路由表
 * 与后端 common/menus.ts 的 MENU_TREE 一一对应，
 * 实际可见性由后端下发的 menus 裁剪，前端只负责渲染与守卫。
 */
import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';
import { useUserStore } from '../store/user';

const Layout = () => import('../layout/index.vue');

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/login/index.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: Layout,
    redirect: '/workbench/index',
    children: [
      // ============ 模块一：AI 工作台 ============
      {
        path: 'workbench/index',
        component: () => import('../views/workbench/index.vue'),
        meta: { code: 'workbench:index', title: '今日待办与经营简报' },
      },
      {
        path: 'workbench/assistant',
        component: () => import('../views/workbench/assistant.vue'),
        meta: { code: 'workbench:assistant', title: '企业AI助手' },
      },

      // ============ 模块二：组织管理 ============
      {
        path: 'org/dept',
        component: () => import('../views/org/dept.vue'),
        meta: { code: 'org:dept', title: '部门管理' },
      },
      {
        path: 'org/user',
        component: () => import('../views/org/user.vue'),
        meta: { code: 'org:user', title: '员工管理' },
      },
      {
        path: 'org/role',
        component: () => import('../views/org/role.vue'),
        meta: { code: 'org:role', title: '角色与权限' },
      },
      {
        path: 'org/partner',
        component: () => import('../views/org/partner.vue'),
        meta: { code: 'org:partner', title: '合伙人设置' },
      },

      // ============ 模块三：AI 知识库 ============
      {
        path: 'kb/doc',
        component: () => import('../views/kb/doc.vue'),
        meta: { code: 'kb:doc', title: '文档列表' },
      },
      {
        path: 'kb/upload',
        component: () => import('../views/kb/upload.vue'),
        meta: { code: 'kb:upload', title: '文档上传导入' },
      },
      {
        path: 'kb/qa',
        component: () => import('../views/kb/qa.vue'),
        meta: { code: 'kb:qa', title: '知识库问答' },
      },

      // ============ 模块四：AI 销售管理 ============
      {
        path: 'crm/customer',
        component: () => import('../views/crm/customer.vue'),
        meta: { code: 'crm:customer', title: '客户管理' },
      },
      {
        path: 'crm/public',
        component: () => import('../views/crm/public.vue'),
        meta: { code: 'crm:public', title: '客户公海' },
      },
      {
        path: 'crm/follow',
        component: () => import('../views/crm/follow.vue'),
        meta: { code: 'crm:follow', title: '跟进记录' },
      },
      {
        path: 'crm/daily',
        component: () => import('../views/crm/daily.vue'),
        meta: { code: 'crm:daily', title: '销售日报' },
      },
      {
        path: 'crm/stat',
        component: () => import('../views/crm/stat.vue'),
        meta: { code: 'crm:stat', title: '销售统计' },
      },

      // ============ 模块五：AI-ERP 基础 ============
      {
        path: 'erp/product',
        component: () => import('../views/erp/product.vue'),
        meta: { code: 'erp:product', title: '产品档案' },
      },
      {
        path: 'erp/stock',
        component: () => import('../views/erp/stock.vue'),
        meta: { code: 'erp:stock', title: '库存管理' },
      },
      {
        path: 'erp/order',
        component: () => import('../views/erp/order.vue'),
        meta: { code: 'erp:order', title: '订单管理' },
      },
      {
        path: 'erp/daily',
        component: () => import('../views/erp/daily.vue'),
        meta: { code: 'erp:daily', title: '经营日报' },
      },

      // ============ 模块六：合伙人管理 ============
      {
        path: 'partner/config',
        component: () => import('../views/partner/config.vue'),
        meta: { code: 'partner:config', title: '分权配置' },
      },
      {
        path: 'partner/performance',
        component: () => import('../views/partner/performance.vue'),
        meta: { code: 'partner:performance', title: '业绩归属台账' },
      },
      {
        path: 'partner/risk',
        component: () => import('../views/partner/risk.vue'),
        meta: { code: 'partner:risk', title: '风险预警记录' },
      },

      // ============ 模块七：系统设置 ============
      {
        path: 'system/enterprise',
        component: () => import('../views/system/enterprise.vue'),
        meta: { code: 'system:enterprise', title: '企业配置' },
      },
      {
        path: 'system/ai',
        component: () => import('../views/system/ai.vue'),
        meta: { code: 'system:ai', title: '大模型参数配置' },
      },
      {
        path: 'system/log',
        component: () => import('../views/system/log.vue'),
        meta: { code: 'system:log', title: '日志管理' },
      },

      {
        path: '403',
        component: () => import('../views/error/403.vue'),
        meta: { title: '无权访问', skipAuth: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('../views/error/404.vue'),
    meta: { public: true, title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const store = useUserStore();
  document.title = `${to.meta.title || ''} - 飞虹智企业AI一站式平台`;

  if (to.meta.public) {
    // 已登录再访问登录页，直接回工作台
    if (to.path === '/login' && store.token) return '/workbench/index';
    return true;
  }

  if (!store.token) return { path: '/login', query: { redirect: to.fullPath } };

  // 刷新后 profile 丢失，补拉一次；失败则回登录页
  if (!store.loaded) {
    try {
      await store.loadProfile();
    } catch {
      await store.logout();
      return { path: '/login' };
    }
  }

  // 页面级权限校验
  const code = to.meta.code as string | undefined;
  if (code && !to.meta.skipAuth && !store.has(code)) return '/403';

  return true;
});

export default router;
