# -*- coding: utf-8 -*-
"""
接口级权限守卫回归测试
飞虹智-企业AI一站式平台 V1.0 · 晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心

验证目标：
  1. 敏感接口对无对应菜单权限的账号返回 403（越权拦截）
  2. 跨模块共用的只读接口对全体登录用户仍然 200（不误伤）
  3. 企业管理员（拥有全部菜单）全部 200（不阻断正常业务）

用法：node dist/main.js 起服务后， python scripts/perm-regression.py
"""
import json
import urllib.request
import urllib.error

BASE = 'http://127.0.0.1:8080'


def call(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, {}
    except Exception as e:
        return -1, {'err': str(e)}


def login(username, password='123456'):
    st, res = call('POST', '/api/v1/user/login', body={'username': username, 'password': password})
    if st not in (200, 201) or res.get('code') != 0:
        raise RuntimeError('登录失败 %s -> %s %s' % (username, st, res))
    return res['data']['token']


# 敏感接口：只有具备对应菜单权限才可访问
SENSITIVE = [
    ('GET', '/api/v1/system/log/page?page=1&size=5', 'system:log 操作日志'),
    ('GET', '/api/v1/system/log/stat', 'system:log 日志趋势'),
    ('GET', '/api/v1/system/ai_config/get', 'system:ai 大模型配置'),
    ('POST', '/api/v1/system/ai_config/test', 'system:ai 连通性测试'),
    ('GET', '/api/v1/system/config/get', 'system:enterprise 业务参数'),
    ('GET', '/api/v1/enterprise/info', 'system:enterprise 企业档案'),
    ('GET', '/api/v1/user/page?page=1&size=5', 'org:user 员工分页'),
    ('POST', '/api/v1/user/reset_password', 'org:user 重置密码', {'id': 2, 'password': '123456'}),
    ('POST', '/api/v1/dept/save', 'org:dept 部门保存', {'name': '权限回归临时部门'}),
    ('POST', '/api/v1/role/perm', 'org:role 角色授权'),
    ('GET', '/api/v1/partner/config/page?page=1&size=5', 'partner:config 分权列表'),
    ('GET', '/api/v1/partner/performance/page?page=1&size=5', 'partner:performance 业绩台账'),
    ('GET', '/api/v1/partner/risk/page?page=1&size=5', 'partner:risk 风险预警'),
    ('GET', '/api/v1/erp/stock/record?page=1&size=5', 'erp:stock 出入库流水'),
    ('GET', '/api/v1/erp/stock/warn_list', 'erp:stock 缺货预警'),
    ('GET', '/api/v1/erp/order/ai_daily', 'erp:daily 经营日报'),
    ('GET', '/api/v1/crm/stat', 'crm:stat 销售统计'),
]

# 共用接口：全体登录用户都应放行
SHARED = [
    ('GET', '/api/v1/system/info', '系统信息（全局页头）'),
    ('GET', '/api/v1/dept/list', '部门树（公共下拉）'),
    ('GET', '/api/v1/role/list', '角色列表（公共下拉）'),
    ('GET', '/api/v1/role/menu_tree', '菜单树（静态元数据）'),
    ('GET', '/api/v1/user/options', '员工下拉（公共下拉）'),
    ('GET', '/api/v1/kb/category/list', '知识库分类枚举'),
    ('GET', '/api/v1/erp/order/status_flow', '订单状态流转（静态）'),
    ('GET', '/api/v1/user/profile', '个人信息'),
]

# 业务接口：销售岗（staff）应可正常使用
SALES_OK = [
    ('GET', '/api/v1/workbench/index', '工作台首页'),
    ('GET', '/api/v1/crm/customer/page?page=1&size=5', '客户分页'),
    ('GET', '/api/v1/crm/follow/page?page=1&size=5', '跟进记录'),
    ('GET', '/api/v1/crm/daily/report/page?page=1&size=5', '销售日报'),
    ('GET', '/api/v1/erp/product/page?page=1&size=5', '产品档案'),
    ('GET', '/api/v1/erp/order/page?page=1&size=5', '订单分页'),
    ('GET', '/api/v1/erp/overview', 'ERP 概览'),
    ('GET', '/api/v1/kb/doc/page?page=1&size=5', '知识库文档'),
    ('GET', '/api/v1/kb/overview', '知识库总览'),
    ('GET', '/api/ai/chat/history?limit=3', 'AI 对话历史'),
]

ok = 0
fail = 0
lines = []


def check(title, expect, got, extra=''):
    global ok, fail
    good = (got == expect)
    if good:
        ok += 1
    else:
        fail += 1
    lines.append('%s %-46s 期望%-4s 实际%-4s %s' % ('[PASS]' if good else '[FAIL]', title, expect, got, extra))


def run(username, sensitive_expect, label):
    token = login(username)
    st, prof = call('GET', '/api/v1/user/profile', token)
    codes = prof['data'].get('menus', [])
    lines.append('')
    lines.append('=== %s（%s）一级菜单：%s ===' % (label, username, ','.join(m['code'] for m in codes)))

    # 注意：全局异常过滤器统一返回 HTTP 200，真实业务状态在 body.code（0=成功 / 403=越权）
    for item in SENSITIVE:
        method, path, title = item[0], item[1], item[2]
        body = item[3] if len(item) >= 4 and item[3] is not None else ({} if method == 'POST' else None)
        exp = sensitive_expect.get(title, 403)
        code, res = call(method, path, token, body=body)
        got = res.get('code', code)
        check('%s | %s' % (username, title), exp, got, res.get('msg', '')[:28])

    for method, path, title in SHARED:
        code, res = call(method, path, token)
        check('%s | 共用·%s' % (username, title), 0, res.get('code', code))


# ---------- 0. 准备角色授权接口所需的合法 body（幂等：原样回写菜单，不改库） ----------
_setup_tk = login('admin')
_setup_st, _setup_roles = call('GET', '/api/v1/role/list', _setup_tk)
if _setup_roles.get('code') == 0 and _setup_roles.get('data'):
    _r = _setup_roles['data'][0]
    _body = {'role_id': _r['id'], 'menu_codes': _r.get('menu_codes', [])}
    for _i in range(len(SENSITIVE)):
        if SENSITIVE[_i][2] == 'org:role 角色授权':
            SENSITIVE[_i] = (SENSITIVE[_i][0], SENSITIVE[_i][1], SENSITIVE[_i][2], _body)
            break

# ---------- 1. 企业管理员：全部放行（业务 code == 0） ----------
admin_expect = {it[2]: 0 for it in SENSITIVE}
run('admin', admin_expect, '企业管理员')

# ---------- 2. 销售专员 staff：仅 crm/erp/kb/workbench 基础权限 ----------
sales02_expect = {it[2]: 403 for it in SENSITIVE}
sales02_expect['crm:stat 销售统计'] = 0          # SALES_MENU_CODES 含 crm:stat
run('sales02', sales02_expect, '销售专员')

# 销售岗正常业务不能被误伤
tk = login('sales02')
for method, path, title in SALES_OK:
    code, res = call(method, path, tk)
    check('sales02 | 业务·%s' % title, 0, res.get('code', code), res.get('msg', '')[:28])

# ---------- 3. 部门管理员 dept_admin：多 org:dept / org:user ----------
sales01_expect = {it[2]: 403 for it in SENSITIVE}
sales01_expect['org:user 员工分页'] = 0
sales01_expect['org:user 重置密码'] = 0
sales01_expect['org:dept 部门保存'] = 0
sales01_expect['crm:stat 销售统计'] = 0
run('sales01', sales01_expect, '部门管理员')

# ---------- 4. 合伙人 partner：多 partner:performance / partner:risk ----------
partner_expect = {it[2]: 403 for it in SENSITIVE}
partner_expect['partner:performance 业绩台账'] = 0
partner_expect['partner:risk 风险预警'] = 0
partner_expect['crm:stat 销售统计'] = 0
run('partner01', partner_expect, '合伙人')

# ---------- 清理：删除回归测试创建的临时部门 ----------
lines.append('')
lines.append('=== 清理临时数据 ===')
admin_tk = login('admin')
st, lst = call('GET', '/api/v1/dept/list', admin_tk)
temp_ids = [d['id'] for d in (lst.get('data') or []) if d.get('name') == '权限回归临时部门']
for did in temp_ids:
    code, res = call('DELETE', '/api/v1/dept/%d' % did, admin_tk)
    check('清理 | 删除临时部门 %d' % did, 0, res.get('code', code), res.get('msg', '')[:28])
if not temp_ids:
    lines.append('（无临时部门需清理）')

print('\n'.join(lines))
print('')
print('=' * 78)
print('通过 %d 项，失败 %d 项' % (ok, fail))
print('=' * 78)
