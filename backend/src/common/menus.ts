/**
 * V1.0 菜单结构定义
 * 严格对应《企业AI一站式平台 V1.0｜可直接交付开发完整输出》第三章「V1.0 前端菜单结构」
 *
 * code 同时作为角色菜单权限的最小授权单元（sys_role.menu_codes）
 */
export interface MenuNode {
  code: string;
  name: string;
  path: string;
  icon?: string;
  children?: MenuNode[];
}

export const MENU_TREE: MenuNode[] = [
  {
    code: 'workbench',
    name: 'AI工作台',
    path: '/workbench',
    icon: 'HomeFilled',
    children: [
      { code: 'workbench:index', name: '今日待办与经营简报', path: '/workbench/index' },
      { code: 'workbench:assistant', name: '企业AI助手', path: '/workbench/assistant' },
    ],
  },
  {
    code: 'org',
    name: '组织管理',
    path: '/org',
    icon: 'OfficeBuilding',
    children: [
      { code: 'org:dept', name: '部门管理', path: '/org/dept' },
      { code: 'org:user', name: '员工管理', path: '/org/user' },
      { code: 'org:role', name: '角色与权限', path: '/org/role' },
      { code: 'org:partner', name: '合伙人设置', path: '/org/partner' },
    ],
  },
  {
    code: 'kb',
    name: 'AI知识库',
    path: '/kb',
    icon: 'Collection',
    children: [
      { code: 'kb:doc', name: '文档列表', path: '/kb/doc' },
      { code: 'kb:upload', name: '文档上传导入', path: '/kb/upload' },
      { code: 'kb:qa', name: '知识库问答', path: '/kb/qa' },
    ],
  },
  {
    code: 'crm',
    name: 'AI销售管理',
    path: '/crm',
    icon: 'User',
    children: [
      { code: 'crm:customer', name: '客户管理', path: '/crm/customer' },
      { code: 'crm:public', name: '客户公海', path: '/crm/public' },
      { code: 'crm:follow', name: '跟进记录', path: '/crm/follow' },
      { code: 'crm:daily', name: '销售日报', path: '/crm/daily' },
      { code: 'crm:stat', name: '销售统计', path: '/crm/stat' },
    ],
  },
  {
    code: 'erp',
    name: 'AI-ERP基础',
    path: '/erp',
    icon: 'Goods',
    children: [
      { code: 'erp:product', name: '产品档案', path: '/erp/product' },
      { code: 'erp:stock', name: '库存管理', path: '/erp/stock' },
      { code: 'erp:order', name: '订单管理', path: '/erp/order' },
      { code: 'erp:daily', name: '经营日报', path: '/erp/daily' },
    ],
  },
  {
    code: 'partner',
    name: '合伙人管理',
    path: '/partner',
    icon: 'Share',
    children: [
      { code: 'partner:config', name: '分权配置', path: '/partner/config' },
      { code: 'partner:performance', name: '业绩归属台账', path: '/partner/performance' },
      { code: 'partner:risk', name: '风险预警记录', path: '/partner/risk' },
    ],
  },
  {
    code: 'system',
    name: '系统设置',
    path: '/system',
    icon: 'Setting',
    children: [
      { code: 'system:enterprise', name: '企业配置', path: '/system/enterprise' },
      { code: 'system:ai', name: '大模型参数配置', path: '/system/ai' },
      { code: 'system:log', name: '日志管理', path: '/system/log' },
    ],
  },
];

/** 拍平后的全部菜单编码 */
export const ALL_MENU_CODES: string[] = (() => {
  const out: string[] = [];
  const walk = (nodes: MenuNode[]) => {
    for (const n of nodes) {
      out.push(n.code);
      if (n.children) walk(n.children);
    }
  };
  walk(MENU_TREE);
  return out;
})();

/** 按已授权编码裁剪菜单树；父节点只要有一个子节点有权限就保留 */
export function filterMenu(codes: string[], isSuper = false): MenuNode[] {
  if (isSuper) return MENU_TREE;
  const set = new Set(codes);
  const walk = (nodes: MenuNode[]): MenuNode[] => {
    const res: MenuNode[] = [];
    for (const n of nodes) {
      const children = n.children ? walk(n.children) : undefined;
      if (set.has(n.code) || (children && children.length)) {
        res.push({ ...n, children });
      }
    }
    return res;
  };
  return walk(MENU_TREE);
}

/** 销售岗默认菜单（种子数据用） */
export const SALES_MENU_CODES = [
  'workbench',
  'workbench:index',
  'workbench:assistant',
  'kb',
  'kb:doc',
  'kb:qa',
  'crm',
  'crm:customer',
  'crm:public',
  'crm:follow',
  'crm:daily',
  'crm:stat',
  'erp',
  'erp:product',
  'erp:order',
];

/** 合伙人默认菜单（种子数据用） */
export const PARTNER_MENU_CODES = [
  ...SALES_MENU_CODES,
  'partner',
  'partner:performance',
  'partner:risk',
];
