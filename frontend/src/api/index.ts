import req from './request';

/** 用户与鉴权 */
export const userApi = {
  login: (data: any) => req.post('/v1/user/login', data),
  logout: () => req.post('/v1/user/logout'),
  profile: () => req.get('/v1/user/profile'),
  changePassword: (data: any) => req.post('/v1/user/password', data),
  save: (data: any) => req.post('/v1/user/save', data),
  page: (params: any) => req.get('/v1/user/page', { params }),
  options: () => req.get('/v1/user/options'),
  resetPassword: (data: any) => req.post('/v1/user/reset_password', data),
  remove: (id: number) => req.delete(`/v1/user/${id}`),
};

/** 企业 */
export const enterpriseApi = {
  create: (data: any) => req.post('/v1/enterprise/create', data),
  info: () => req.get('/v1/enterprise/info'),
  update: (data: any) => req.post('/v1/enterprise/update', data),
  page: (params: any) => req.get('/v1/enterprise/page', { params }),
};

/** 部门 */
export const deptApi = {
  save: (data: any) => req.post('/v1/dept/save', data),
  list: () => req.get('/v1/dept/list'),
  remove: (id: number) => req.delete(`/v1/dept/${id}`),
};

/** 角色 */
export const roleApi = {
  save: (data: any) => req.post('/v1/role/save', data),
  list: () => req.get('/v1/role/list'),
  perm: (data: any) => req.post('/v1/role/perm', data),
  menuTree: () => req.get('/v1/role/menu_tree'),
  remove: (id: number) => req.delete(`/v1/role/${id}`),
};

/** AI 中间层 */
export const aiApi = {
  chat: (data: any) => req.post('/ai/chat', data),
  search: (data: any) => req.post('/ai/search', data),
  extract: (data: any) => req.post('/ai/extract', data),
  generate: (data: any) => req.post('/ai/generate', data),
  classify: (data: any) => req.post('/ai/classify', data),
  history: (params: any) => req.get('/ai/chat/history', { params }),
};

/** 知识库 */
export const kbApi = {
  categories: () => req.get('/v1/kb/category/list'),
  upload: (data: any) => req.post('/v1/kb/doc/upload', data),
  page: (params: any) => req.get('/v1/kb/doc/page', { params }),
  detail: (id: number) => req.get('/v1/kb/doc/detail', { params: { id } }),
  update: (data: any) => req.put('/v1/kb/doc/update', data),
  revectorize: (data: any) => req.post('/v1/kb/doc/revectorize', data),
  qa: (data: any) => req.post('/v1/kb/qa', data),
  overview: () => req.get('/v1/kb/overview'),
  remove: (id: number) => req.delete(`/v1/kb/doc/${id}`),
};

/** CRM */
export const crmApi = {
  saveCustomer: (data: any) => req.post('/v1/crm/customer/save', data),
  customerPage: (params: any) => req.get('/v1/crm/customer/page', { params }),
  customerDetail: (id: number) => req.get('/v1/crm/customer/detail', { params: { id } }),
  moveToPublic: (data: any) => req.post('/v1/crm/customer/public', data),
  claim: (data: any) => req.post('/v1/crm/customer/claim', data),
  score: (data: any) => req.post('/v1/crm/customer/score', data),
  exportRows: (params: any) => req.get('/v1/crm/customer/export', { params }),
  removeCustomer: (id: number) => req.delete(`/v1/crm/customer/${id}`),

  saveFollow: (data: any) => req.post('/v1/crm/follow/save', data),
  followList: (params: any) => req.get('/v1/crm/follow/list', { params }),
  followPage: (params: any) => req.get('/v1/crm/follow/page', { params }),

  saveReport: (data: any) => req.post('/v1/crm/daily/report/save', data),
  getReport: (params: any) => req.get('/v1/crm/daily/report/get', { params }),
  aiGenerateReport: (data: any) => req.post('/v1/crm/daily/report/ai_generate', data),
  reportPage: (params: any) => req.get('/v1/crm/daily/report/page', { params }),

  stat: (params?: any) => req.get('/v1/crm/stat', { params }),
};

/** ERP */
export const erpApi = {
  saveProduct: (data: any) => req.post('/v1/erp/product/save', data),
  productPage: (params: any) => req.get('/v1/erp/product/page', { params }),
  productOptions: () => req.get('/v1/erp/product/options'),
  removeProduct: (id: number) => req.delete(`/v1/erp/product/${id}`),

  stockIn: (data: any) => req.post('/v1/erp/stock/in', data),
  stockOut: (data: any) => req.post('/v1/erp/stock/out', data),
  warnList: (params: any) => req.get('/v1/erp/stock/warn_list', { params }),
  handleWarn: (data: any) => req.post('/v1/erp/stock/warn_handle', data),
  stockRecord: (params: any) => req.get('/v1/erp/stock/record', { params }),

  createOrder: (data: any) => req.post('/v1/erp/order/create', data),
  updateStatus: (data: any) => req.put('/v1/erp/order/status', data),
  orderPage: (params: any) => req.get('/v1/erp/order/page', { params }),
  orderDetail: (id: number) => req.get('/v1/erp/order/detail', { params: { id } }),
  statusFlow: () => req.get('/v1/erp/order/status_flow'),
  aiDaily: (date?: string) => req.get('/v1/erp/order/ai_daily', { params: { date } }),
  overview: () => req.get('/v1/erp/overview'),
};

/** 合伙人 */
export const partnerApi = {
  saveConfig: (data: any) => req.post('/v1/partner/config/save', data),
  getConfig: (userId?: number) => req.get('/v1/partner/config/get', { params: { user_id: userId } }),
  configPage: (params: any) => req.get('/v1/partner/config/page', { params }),
  options: () => req.get('/v1/partner/options'),
  removeConfig: (id: number) => req.delete(`/v1/partner/config/${id}`),

  savePerformance: (data: any) => req.post('/v1/partner/performance/save', data),
  performancePage: (params: any) => req.get('/v1/partner/performance/page', { params }),
  removePerformance: (id: number) => req.delete(`/v1/partner/performance/${id}`),

  riskPage: (params: any) => req.get('/v1/partner/risk/page', { params }),
  handleRisk: (data: any) => req.post('/v1/partner/risk/handle', data),
  scanRisk: () => req.post('/v1/partner/risk/scan'),
  overview: () => req.get('/v1/partner/overview'),
};

/** 系统设置 */
export const systemApi = {
  saveAiConfig: (data: any) => req.post('/v1/system/ai_config/save', data),
  getAiConfig: () => req.get('/v1/system/ai_config/get'),
  testAiConfig: (data: any) => req.post('/v1/system/ai_config/test', data),
  saveConfig: (data: any) => req.post('/v1/system/config/save', data),
  getConfig: () => req.get('/v1/system/config/get'),
  logPage: (params: any) => req.get('/v1/system/log/page', { params }),
  logStat: () => req.get('/v1/system/log/stat'),
  cleanLog: (data: any) => req.post('/v1/system/log/clean', data),
  info: () => req.get('/v1/system/info'),
};

/** AI 工作台 */
export const workbenchApi = {
  index: () => req.get('/v1/workbench/index'),
  todo: () => req.get('/v1/workbench/todo'),
  overview: () => req.get('/v1/workbench/overview'),
  aiBriefing: () => req.get('/v1/workbench/ai_briefing'),
  shortcuts: () => req.get('/v1/workbench/shortcuts'),
  trend: () => req.get('/v1/workbench/trend'),
};
