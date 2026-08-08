# -*- coding: utf-8 -*-
"""
V2.0 运行时冒烟测试
飞虹智-企业AI一站式平台 V2.0 · 晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心

覆盖 V2.0 全部新增能力：
  1. OpenClaw 智能体引擎：模板库 / 任务增改 / 启停 / 手动执行 / 执行日志
  2. 事件联动：订单审核通过(待审核->生产中) -> 自动生成生产工单 + 站内消息
  3. 生产工单：新增、状态流转、AI 工期提示、完工入库回写库存
  4. 合伙人自动分利：分利规则 -> 订单已完成 -> 自动生成结算流水 -> 手动结算 -> 导出对账单
  5. 站内消息：未读角标、分页、标记已读、全部已读
  6. 批量导入导出：客户模板/导入/导出、订单导出、工单导出
  7. 知识库增强：文档版本快照 / 版本恢复 / 问答会话历史

用法：node dist/main.js 起服务后，python scripts/smoke-v2.py
"""
import base64
import json
import time
import urllib.request
import urllib.error

BASE = 'http://127.0.0.1:8080'

ok = 0
fail = 0
lines = []


def call(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json; charset=utf-8')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode('utf-8'))
        except Exception:
            return {'code': e.code, 'msg': 'HTTP %s' % e.code, 'data': None}
    except Exception as e:
        return {'code': -1, 'msg': str(e), 'data': None}


def check(title, res, expect=0, extra=''):
    global ok, fail
    got = res.get('code')
    good = (got == expect)
    if good:
        ok += 1
    else:
        fail += 1
    lines.append('%s %-52s code=%-5s %s %s' % (
        '[PASS]' if good else '[FAIL]', title, got, (res.get('msg') or '')[:34], extra))
    return res.get('data')


def assert_true(title, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
    lines.append('%s %-52s %s %s' % ('[PASS]' if cond else '[FAIL]', title, '', extra))


def login(username, password='123456'):
    res = call('POST', '/api/v1/user/login', body={'username': username, 'password': password})
    if res.get('code') != 0:
        raise RuntimeError('登录失败 %s -> %s' % (username, res))
    return res['data']['token']


print('== V2.0 冒烟：登录 admin ==')
tk = login('admin')

# ============================================================
# 一、智能体引擎
# ============================================================
lines.append('')
lines.append('===== 一、OpenClaw 智能体引擎 =====')

tpls = check('agent/template/list 内置模板库', call('GET', '/api/v1/agent/template/list', tk))
assert_true('内置 4 套智能体模板', isinstance(tpls, list) and len(tpls) >= 4,
            '实际 %s 套' % (len(tpls) if isinstance(tpls, list) else 0))

# 导入 4 套模板为任务
task_ids = {}
for t in (tpls or []):
    # 出参统一为实体 camelCase 风格，入参统一 snake_case
    key = t.get('templateKey') or t.get('template_key')
    d = check('agent/task/save 导入模板 %s' % key, call('POST', '/api/v1/agent/task/save', tk, {
        'agent_name': t.get('agentName') or t.get('agent_name'),
        'template_key': key,
        'trigger_type': t.get('triggerType') or t.get('trigger_type'),
        'cron_expr': t.get('cronExpr') or t.get('cron_expr') or '',
        'biz_prompt': t.get('bizPrompt') or t.get('biz_prompt') or '',
        'enable': 1,
    }))
    if d:
        task_ids[key] = d.get('id')

page = check('agent/task/page 任务分页', call('GET', '/api/v1/agent/task/page?page=1&size=20', tk))
assert_true('任务列表已落库', bool(page and page.get('total', 0) >= 4), '总数 %s' % (page or {}).get('total'))

sales_id = task_ids.get('sales_assistant')
if sales_id:
    check('agent/task/enable 停用', call('POST', '/api/v1/agent/task/enable', tk, {'id': sales_id, 'enable': 0}))
    check('agent/task/enable 启用', call('POST', '/api/v1/agent/task/enable', tk, {'id': sales_id, 'enable': 1}))
    r = check('agent/manual_run 手动执行销售助理', call('POST', '/api/v1/agent/manual_run', tk, {'id': sales_id}))
    assert_true('销售助理返回执行摘要', bool(r and r.get('output')), str((r or {}).get('output'))[:40])

risk_id = task_ids.get('risk_inspection')
if risk_id:
    r = check('agent/manual_run 手动执行风险巡检', call('POST', '/api/v1/agent/manual_run', tk, {'id': risk_id}))

kb_id = task_ids.get('kb_inspection')
if kb_id:
    check('agent/manual_run 手动执行知识库巡检', call('POST', '/api/v1/agent/manual_run', tk, {'id': kb_id}))

logp = check('agent/log/page 执行日志', call('GET', '/api/v1/agent/log/page?page=1&size=10', tk))
assert_true('执行日志已记录', bool(logp and logp.get('total', 0) >= 1), '总数 %s' % (logp or {}).get('total'))

# ============================================================
# 二、事件联动：订单审核 -> 自动生成工单
# ============================================================
lines.append('')
lines.append('===== 二、订单审核 -> 自动生成生产工单（事件总线） =====')

prods = call('GET', '/api/v1/erp/product/page?page=1&size=1', tk).get('data') or {}
plist = prods.get('list') or []
custs = call('GET', '/api/v1/crm/customer/page?page=1&size=1', tk).get('data') or {}
clist = custs.get('list') or []

order_id = None
if plist and clist:
    p = plist[0]
    c = clist[0]
    d = check('erp/order/save 新建订单', call('POST', '/api/v1/erp/order/create', tk, {
        'customer_id': c['id'],
        'delivery_date': '2026-09-30',
        'remark': 'V2.0 冒烟：事件联动测试单',
        'items': [{'product_id': p['id'], 'num': 12, 'price': p.get('price') or 100}],
    }))
    order_id = (d or {}).get('id') or (d or {}).get('order_id')
    assert_true('订单创建成功', bool(order_id), 'order_id=%s' % order_id)
else:
    lines.append('[SKIP] 无产品或客户基础数据，跳过订单联动用例')

wo_id = None
if order_id:
    check('erp/order/status 待审核->生产中（审核通过）', call('PUT', '/api/v1/erp/order/status', tk, {
        'id': order_id, 'order_status': '生产中'}))
    # 事件是 setImmediate 异步派发，这里轮询等待
    import time
    for _ in range(20):
        wp = call('GET', '/api/v1/prod/workorder/page?page=1&size=10&order_id=%s' % order_id, tk).get('data') or {}
        wl = wp.get('list') or []
        if wl:
            wo_id = wl[0]['id']
            break
        time.sleep(0.3)
    assert_true('订单审核后自动生成生产工单', bool(wo_id), 'work_order_id=%s' % wo_id)

# ============================================================
# 三、生产工单
# ============================================================
lines.append('')
lines.append('===== 三、简易生产工单管理 =====')

if not wo_id and plist:
    d = check('prod/workorder/save 手动新建工单', call('POST', '/api/v1/prod/workorder/save', tk, {
        'order_id': order_id or 0,
        'product_id': plist[0]['id'],
        'produce_num': 12,
        'remark': 'V2.0 冒烟手动工单',
    }))
    wo_id = (d or {}).get('id')

if wo_id:
    check('prod/workorder/page 工单分页', call('GET', '/api/v1/prod/workorder/page?page=1&size=10', tk))
    tip = check('prod/workorder/ai_tip AI工期提示', call('GET', '/api/v1/prod/workorder/ai_tip?id=%s' % wo_id, tk))
    assert_true('AI 生产提示非空', bool(tip and (tip.get('ai_tip') or tip.get('tip'))),
                str((tip or {}).get('ai_tip') or (tip or {}).get('tip'))[:40])
    check('prod/workorder/status 待排产->生产中', call('PUT', '/api/v1/prod/workorder/status', tk, {
        'id': wo_id, 'status': '生产中', 'finish_num': 0}))
    check('prod/workorder/status 生产中->部分完成', call('PUT', '/api/v1/prod/workorder/status', tk, {
        'id': wo_id, 'status': '部分完成', 'finish_num': 5}))
    bad = call('PUT', '/api/v1/prod/workorder/status', tk, {'id': wo_id, 'status': '待排产'})
    check('prod/workorder/status 非法回退被拦截', bad, 400)
    over = call('PUT', '/api/v1/prod/workorder/status', tk, {'id': wo_id, 'status': '部分完成', 'finish_num': 9999})
    check('prod/workorder/status 完成数超上限被拦截', over, 400)
    check('prod/workorder/status 部分完成->全部完工', call('PUT', '/api/v1/prod/workorder/status', tk, {
        'id': wo_id, 'status': '全部完工', 'finish_num': 12}))

    # 完工入库回写库存
    pid = plist[0]['id'] if plist else None
    before = 0
    if pid:
        dp = call('GET', '/api/v1/erp/product/page?page=1&size=50', tk).get('data') or {}
        for x in dp.get('list') or []:
            if x['id'] == pid:
                before = x.get('stock_num') or 0
    r = check('prod/workorder/stock_in 完工一键入库', call('POST', '/api/v1/prod/workorder/stock_in', tk, {'id': wo_id}))
    if pid:
        dp = call('GET', '/api/v1/erp/product/page?page=1&size=50', tk).get('data') or {}
        after = 0
        for x in dp.get('list') or []:
            if x['id'] == pid:
                after = x.get('stock_num') or 0
        assert_true('入库后库存已回写', after > before, '%s -> %s' % (before, after))

# ============================================================
# 四、合伙人自动分利
# ============================================================
lines.append('')
lines.append('===== 四、合伙人分权分利分风险闭环 =====')

partners = call('GET', '/api/v1/partner/options', tk).get('data') or []
puid = None
if partners:
    puid = partners[0].get('id') or partners[0].get('user_id')

if puid:
    # 幂等：规则唯一键为 (user_id, settle_type)，已存在则改为编辑，保证冒烟可重复执行
    exist_rules = ((call('GET', '/api/v1/partner/rule/page?page=1&size=50', tk).get('data') or {}).get('list')) or []
    hit = next((r for r in exist_rules
                if str(r.get('userId') or r.get('user_id')) == str(puid)
                and (r.get('settleType') or r.get('settle_type')) == 'order'), None)
    check('partner/rule/save 分利规则（按订单10%）', call('POST', '/api/v1/partner/rule/save', tk, {
        'id': hit.get('id') if hit else None,
        'user_id': puid, 'settle_type': 'order', 'ratio': 10, 'enable': 1,
        'settle_condition': json.dumps({'min_amount': 0}, ensure_ascii=False)}))
    check('partner/rule/page 规则分页', call('GET', '/api/v1/partner/rule/page?page=1&size=10', tk))

    # 造一张归属该合伙人的订单，走完整状态到「已完成」触发自动分利
    if plist and clist:
        d = call('POST', '/api/v1/erp/order/create', tk, {
            'customer_id': clist[0]['id'],
            'owner_user_id': puid,
            'delivery_date': '2026-09-30',
            'remark': 'V2.0 冒烟：自动分利测试单',
            'items': [{'product_id': plist[0]['id'], 'num': 3, 'price': 1000}],
        }).get('data') or {}
        oid2 = d.get('id') or d.get('order_id')
        if oid2:
            for st in ['生产中', '已发货', '已完成']:
                call('PUT', '/api/v1/erp/order/status', tk, {'id': oid2, 'order_status': st})
            import time
            got_flow = None
            for _ in range(20):
                sp = call('GET', '/api/v1/partner/settle/page?page=1&size=20', tk).get('data') or {}
                for f in sp.get('list') or []:
                    if f.get('order_id') == oid2:
                        got_flow = f
                        break
                if got_flow:
                    break
                time.sleep(0.3)
            assert_true('订单完成后自动生成结算流水', bool(got_flow),
                        '结算金额 %s' % (got_flow or {}).get('settle_amount'))
            if got_flow:
                assert_true('分成金额=订单额×比例', abs(float(got_flow['settle_amount']) - 300.0) < 0.01,
                            '3×1000×10%% = 300，实际 %s' % got_flow['settle_amount'])
                check('partner/settle/manual 手动标记已结算',
                      call('POST', '/api/v1/partner/settle/manual', tk, {'id': got_flow['id']}))

    check('partner/settle/page 结算流水分页', call('GET', '/api/v1/partner/settle/page?page=1&size=10', tk))
    exp = check('partner/settle/export 导出对账单', call('GET', '/api/v1/partner/settle/export', tk))
    assert_true('对账单有数据行', bool(exp), '%s 行' % (len(exp) if isinstance(exp, list) else 0))
else:
    lines.append('[SKIP] 无合伙人账号，跳过分利用例')

# ============================================================
# 五、站内消息
# ============================================================
lines.append('')
lines.append('===== 五、站内消息通知 =====')

cnt = check('notice/unread/count 未读角标', call('GET', '/api/v1/notice/unread/count', tk))
np = check('notice/page 消息分页', call('GET', '/api/v1/notice/page?page=1&size=10', tk))
nlist = (np or {}).get('list') or []
assert_true('智能体/工单已产生站内消息', len(nlist) >= 1, '共 %s 条' % (np or {}).get('total'))
if nlist:
    check('notice/read 标记单条已读', call('PUT', '/api/v1/notice/read', tk, {'id': nlist[0]['id']}))
check('notice/read_all 全部已读', call('PUT', '/api/v1/notice/read_all', tk, {}))
cnt2 = call('GET', '/api/v1/notice/unread/count', tk).get('data') or {}
assert_true('全部已读后角标归零', (cnt2.get('count') if isinstance(cnt2, dict) else cnt2) in (0, None),
            '剩余 %s' % cnt2)

# ============================================================
# 六、批量导入导出
# ============================================================
lines.append('')
lines.append('===== 六、批量导入导出 =====')

tpl = check('common/template/customer 客户导入模板', call('GET', '/api/v1/common/template/customer', tk))
assert_true('模板文件已生成', bool(tpl and tpl.get('file_base64')), (tpl or {}).get('file_name'))

# 用 CSV（SheetJS 可直接解析）构造导入数据，带 BOM 保证中文正常
# 手机号带运行时随机后缀，保证脚本可重复执行时「新增」与「幂等跳过」两条链路都被真实覆盖
sfx = str(int(time.time()))[-6:]
p1, p2, p3 = '139%s1' % sfx, '139%s2' % sfx, '139%s3' % sfx
csv = '\ufeff客户姓名,公司名称,联系电话,客户等级,客户标签,备注\n'
csv += 'V2冒烟客户甲,晋江甲贸易,%s,A,导入测试,批量导入用例\n' % p1
csv += 'V2冒烟客户乙,晋江乙鞋业,%s,B,导入测试,批量导入用例\n' % p2
csv += ',缺姓名公司,%s,C,,应当失败\n' % p3
b64 = base64.b64encode(csv.encode('utf-8')).decode('ascii')

imp = check('common/import/customer 客户批量导入', call('POST', '/api/v1/common/import/customer', tk, {
    'file_name': 'v2_smoke_customer.csv', 'file_base64': b64}))
assert_true('导入成功 2 条 + 失败 1 条', bool(imp and imp.get('success') == 2 and imp.get('fail') == 1),
            str(imp))

imp2 = call('POST', '/api/v1/common/import/customer', tk, {
    'file_name': 'v2_smoke_customer.csv', 'file_base64': b64}).get('data') or {}
assert_true('重复导入按手机号幂等跳过', imp2.get('skipped') == 2, str(imp2))

ec = check('common/export/customer 客户导出', call('GET', '/api/v1/common/export/customer?page=1', tk))
assert_true('客户导出文件非空', bool(ec and ec.get('file_base64')), '%s 行' % (ec or {}).get('total'))
eo = check('common/export/order 订单导出', call('GET', '/api/v1/common/export/order', tk))
assert_true('订单导出文件非空', bool(eo and eo.get('file_base64')), '%s 行' % (eo or {}).get('total'))
ew = check('common/export/workorder 工单导出', call('GET', '/api/v1/common/export/workorder', tk))
assert_true('工单导出文件非空', bool(ew and ew.get('file_base64')), '%s 行' % (ew or {}).get('total'))

kb_txt = base64.b64encode('飞虹智V2.0批量上传测试文档：合伙人分利规则按订单金额10%计提。'.encode('utf-8')).decode('ascii')
ik = check('common/import/kb 知识库批量上传', call('POST', '/api/v1/common/import/kb', tk, {
    'category': 'system',
    'files': [{'file_name': 'v2_batch_1.txt', 'file_base64': kb_txt},
              {'file_name': 'v2_batch_2.txt', 'file_base64': kb_txt}]}))
assert_true('批量上传 2 个文档成功', bool(ik and ik.get('success') == 2), str((ik or {}).get('msg')))

# ============================================================
# 七、知识库增强
# ============================================================
lines.append('')
lines.append('===== 七、AI 知识库增强（版本 / 会话历史） =====')

doc_id = None
if ik and ik.get('docs'):
    doc_id = ik['docs'][0]['doc_id']

if doc_id:
    check('kb/doc/update 修改文档（触发版本快照）', call('PUT', '/api/v1/kb/doc/update', tk, {
        'id': doc_id, 'title': 'V2批量文档-改名1', 'content': '第一次修改内容'}))
    check('kb/doc/update 再次修改', call('PUT', '/api/v1/kb/doc/update', tk, {
        'id': doc_id, 'title': 'V2批量文档-改名2', 'content': '第二次修改内容'}))
    vs = check('kb/doc/version/list 历史版本列表',
               call('GET', '/api/v1/kb/doc/version/list?doc_id=%s' % doc_id, tk))
    assert_true('已生成 >=2 个历史版本', bool(vs and len(vs) >= 2), '%s 个版本' % (len(vs) if vs else 0))
    if vs:
        check('kb/doc/version/recover 恢复历史版本', call('POST', '/api/v1/kb/doc/version/recover', tk, {
            'version_id': vs[-1]['id']}))

call('POST', '/api/ai/kb/qa', tk, {'question': '合伙人分利比例是多少？'})
ch = check('kb/chat/history/page 问答会话历史',
           call('GET', '/api/v1/kb/chat/history/page?page=1&size=10', tk))

# ============================================================
# 汇总
# ============================================================
print('\n'.join(lines))
print('')
print('=' * 78)
print('V2.0 冒烟结果：通过 %s / 失败 %s / 合计 %s' % (ok, fail, ok + fail))
print('=' * 78)
