# 一次性脚本：dump V2.0 各接口真实出参样本，供前端视图开发对齐字段
import json
import urllib.request

BASE = 'http://127.0.0.1:8080/api'


def call(method, path, token=None, body=None):
    data = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception as e:
        return {'code': -1, 'msg': str(e)}


tk = call('POST', '/v1/user/login', None, {'username': 'admin', 'password': '123456'})['data']['token']

targets = [
    ('GET', '/v1/agent/template/list', None),
    ('GET', '/v1/agent/task/page?page=1&size=1', None),
    ('GET', '/v1/agent/log/page?page=1&size=1', None),
    ('GET', '/v1/prod/workorder/page?page=1&size=1', None),
    ('GET', '/v1/partner/rule/page?page=1&size=1', None),
    ('GET', '/v1/partner/settle/page?page=1&size=1', None),
    ('GET', '/v1/notice/page?page=1&size=1', None),
    ('GET', '/v1/notice/unread/count', None),
    ('GET', '/v1/partner/options', None),
    ('GET', '/v1/erp/product/options', None),
    ('GET', '/v1/erp/order/page?page=1&size=1', None),
]

for m, p, b in targets:
    r = call(m, p, tk, b)
    d = r.get('data')
    if isinstance(d, dict) and 'list' in d:
        sample = d['list'][0] if d['list'] else {}
        print('### %s -> total=%s' % (p, d.get('total')))
        print(json.dumps(sample, ensure_ascii=False, indent=1, default=str))
    elif isinstance(d, list):
        print('### %s -> len=%s' % (p, len(d)))
        print(json.dumps(d[0] if d else {}, ensure_ascii=False, indent=1, default=str))
    else:
        print('### %s -> %s' % (p, json.dumps(d, ensure_ascii=False, default=str)[:400]))
    print()
