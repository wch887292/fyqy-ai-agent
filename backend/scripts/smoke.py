#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飞虹智 V1.0 全模块运行时冒烟测试
- 以 admin 身份登录，跑通「组织->客户->跟进->产品->库存->订单->合伙人->知识库->系统」核心闭环
- 同时覆盖所有只读 GET 端点
- 判定：body.code == 0 为通过；非 0 即真实缺陷（记录 msg）
- 另含负向用例：缺失/非法 id 必须返回 code=400（验证 NaN 崩溃已收敛为 400）
"""
import json, urllib.request, urllib.error, datetime

BASE = "http://127.0.0.1:8080"
lines = []
fails = []

def call(method, path, token=None, body=None):
    url = BASE + path
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "ignore")
    try:
        return json.loads(raw)
    except Exception:
        return {"code": -1, "msg": "non-json: " + raw[:120], "data": None}

def login(username, password="123456"):
    res = call("POST", "/api/v1/user/login", body={"username": username, "password": password})
    if res.get("code") != 0:
        raise RuntimeError("登录失败 %s -> %s" % (username, res))
    return res["data"]["token"]

def check(label, res, expect=0):
    code = res.get("code")
    ok = (code == expect)
    lines.append("[%s] %-34s code=%s msg=%s" % ("PASS" if ok else "FAIL", label, code, (res.get("msg") or "")[:40]))
    if not ok:
        fails.append(label)
    return res

def gid(obj):
    if isinstance(obj, dict):
        for k in ("id", "ID", "userId", "roleId", "customerId", "productId", "orderId"):
            if k in obj and obj[k]:
                return obj[k]
        if "data" in obj and isinstance(obj["data"], dict):
            return gid(obj["data"])
        if "data" in obj and isinstance(obj["data"], list) and obj["data"]:
            return gid(obj["data"][0])
    if isinstance(obj, list) and obj:
        return gid(obj[0])
    return None

print("== 登录 admin ==")
tk = login("admin")

READONLY = [
    ("GET", "/api/v1/dept/list"), ("GET", "/api/v1/role/list"), ("GET", "/api/v1/role/menu_tree"),
    ("GET", "/api/v1/user/options"), ("GET", "/api/v1/user/page?page=1&size=10"),
    ("GET", "/api/v1/enterprise/info"), ("GET", "/api/v1/kb/category/list"),
    ("GET", "/api/v1/kb/doc/page?page=1&size=10"), ("GET", "/api/v1/kb/overview"),
    ("GET", "/api/v1/crm/customer/page?page=1&size=10"), ("GET", "/api/v1/crm/follow/page?page=1&size=10"),
    ("GET", "/api/v1/crm/daily/report/page?page=1&size=10"), ("GET", "/api/v1/crm/stat"),
    ("GET", "/api/v1/erp/product/page?page=1&size=10"), ("GET", "/api/v1/erp/product/options"),
    ("GET", "/api/v1/erp/stock/warn_list"), ("GET", "/api/v1/erp/stock/record?page=1&size=10"),
    ("GET", "/api/v1/erp/order/page?page=1&size=10"), ("GET", "/api/v1/erp/order/status_flow"),
    ("GET", "/api/v1/erp/overview"), ("GET", "/api/v1/partner/config/page?page=1&size=10"),
    ("GET", "/api/v1/partner/options"), ("GET", "/api/v1/partner/performance/page?page=1&size=10"),
    ("GET", "/api/v1/partner/risk/page?page=1&size=10"), ("GET", "/api/v1/partner/overview"),
    ("GET", "/api/v1/system/ai_config/get"), ("GET", "/api/v1/system/config/get"),
    ("GET", "/api/v1/system/log/page?page=1&size=10"), ("GET", "/api/v1/system/log/stat"),
    ("GET", "/api/v1/system/info"), ("GET", "/api/v1/workbench/index"), ("GET", "/api/v1/workbench/todo"),
    ("GET", "/api/v1/workbench/overview"), ("GET", "/api/v1/workbench/ai_briefing"),
    ("GET", "/api/v1/workbench/shortcuts"), ("GET", "/api/v1/workbench/trend"),
    ("GET", "/api/v1/user/profile"),
]
print("== 只读端点 ==")
for m, p in READONLY:
    check("RO " + p, call(m, p, tk))

print("== 组织闭环 ==")
r = check("dept/save", call("POST", "/api/v1/dept/save", tk, {"name": "冒烟测试部", "parent_id": 0}), 0)
dept_id = gid(r)
r = check("role/save", call("POST", "/api/v1/role/save", tk, {"role_name": "冒烟角色", "role_code": "smoke_role", "data_scope": 3}), 0)
role_id = gid(r)
check("role/perm", call("POST", "/api/v1/role/perm", tk, {"role_id": role_id, "menu_codes": ["crm", "kb"]}), 0)
ts = datetime.datetime.now().strftime("%H%M%S")
r = check("user/save", call("POST", "/api/v1/user/save", tk, {
    "username": "smoke_%s" % ts, "real_name": "冒烟员", "phone": "138%s" % ts,
    "dept_id": dept_id, "role_id": role_id, "password": "123456", "status": 1}), 0)
user_id = gid(r)

print("== CRM 闭环 ==")
r = check("customer/save", call("POST", "/api/v1/crm/customer/save", tk, {
    "customer_name": "冒烟联系人", "company_name": "冒烟科技有限公司", "contact_phone": "13900000099",
    "contact_time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "remark": "smoke", "tags": ["A类", "重点"]}), 0)
cid = gid(r)
check("customer/detail", call("GET", "/api/v1/crm/customer/detail?id=%s" % cid, tk), 0)
check("customer/score", call("POST", "/api/v1/crm/customer/score", tk, {"id": cid}), 0)
check("follow/save", call("POST", "/api/v1/crm/follow/save", tk, {"customer_id": cid, "follow_type": "电话", "content": "冒烟跟进"}), 0)
today = datetime.datetime.now().strftime("%Y-%m-%d")
check("daily/report/save", call("POST", "/api/v1/crm/daily/report/save", tk, {
    "date": today, "call_count": 5, "wechat_count": 3, "new_intent": 2,
    "visit_plan": "明日面访", "summary": "冒烟日报"}), 0)
check("daily/report/ai_generate", call("POST", "/api/v1/crm/daily/report/ai_generate", tk, {"date": today}), 0)

print("== ERP 闭环 ==")
r = check("product/save", call("POST", "/api/v1/erp/product/save", tk, {
    "product_name": "冒烟产品", "spec": "标准", "unit": "个", "price": 100, "stock": 20}), 0)
pid = gid(r)
check("stock/in", call("POST", "/api/v1/erp/stock/in", tk, {"product_id": pid, "num": 5, "type": "in", "remark": "冒烟入库"}), 0)
check("stock/out", call("POST", "/api/v1/erp/stock/out", tk, {"product_id": pid, "num": 2, "type": "out", "remark": "冒烟出库"}), 0)
r = check("order/create", call("POST", "/api/v1/erp/order/create", tk, {
    "customer_id": cid, "items": [{"product_id": pid, "num": 2, "price": 100}], "remark": "冒烟订单"}), 0)
oid = gid(r)
check("order/detail", call("GET", "/api/v1/erp/order/detail?id=%s" % oid, tk), 0)
check("order/status", call("PUT", "/api/v1/erp/order/status", tk, {"id": oid, "status": "已取消"}), 0)
check("order/ai_daily", call("GET", "/api/v1/erp/order/ai_daily", tk), 0)

print("== 合伙人闭环 ==")
check("config/save", call("POST", "/api/v1/partner/config/save", tk, {"user_id": user_id, "scope": "crm", "permissions": "{\"modules\":[\"crm\"]}"}), 0)
check("performance/save", call("POST", "/api/v1/partner/performance/save", tk, {"user_id": user_id, "performance_amount": 10000, "month": "2026-08"}), 0)
check("risk/scan", call("POST", "/api/v1/partner/risk/scan", tk), 0)

print("== 知识库闭环（mock 引擎）==")
check("kb/qa", call("POST", "/api/v1/kb/qa", tk, {"question": "公司有什么制度", "top_k": 3}), 0)

print("== 系统配置 ==")
check("ai_config/save", call("POST", "/api/v1/system/ai_config/save", tk, {"provider": "openclaw", "base_url": "", "api_key": "", "model": ""}), 0)
check("config/save", call("POST", "/api/v1/system/config/save", tk, {
    "kb_chunk_size": "800", "kb_top_k": "5", "crm_follow_overdue_days": "7",
    "erp_default_warn_stock": "10", "workbench_notice": "冒烟通知"}), 0)

print("== 负向：非法 id 必须 400（验证 NaN 崩溃收敛）==")
check("customer/detail 无id", call("GET", "/api/v1/crm/customer/detail", tk), 400)
check("customer/detail 非法id", call("GET", "/api/v1/crm/customer/detail?id=abc", tk), 400)
check("customer/score 无id", call("POST", "/api/v1/crm/customer/score", tk, {}), 400)
check("order/detail 无id", call("GET", "/api/v1/erp/order/detail", tk), 400)
check("kb/doc/detail 无id", call("GET", "/api/v1/kb/doc/detail", tk), 400)

print("\n".join(lines))
print("\n=== 汇总：总 %d 项，失败 %d 项 ===" % (len(lines), len(fails)))
if fails:
    print("失败项：")
    for f in fails:
        print("  -", f)
