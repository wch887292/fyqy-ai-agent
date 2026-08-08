import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { SysOperLog } from '../entities';
import { AuthUser } from './auth';

/** URL 前缀 -> 业务模块名 */
const MODULE_MAP: Array<[string, string]> = [
  ['/api/ai', 'AI中间层'],
  ['/api/v1/enterprise', '组织管理'],
  ['/api/v1/dept', '组织管理'],
  ['/api/v1/role', '组织管理'],
  ['/api/v1/user', '组织管理'],
  ['/api/v1/kb', 'AI知识库'],
  ['/api/v1/crm', 'AI销售CRM'],
  ['/api/v1/erp', 'AI-ERP'],
  ['/api/v1/partner', '合伙人管理'],
  ['/api/v1/system', '系统设置'],
  ['/api/v1/workbench', 'AI工作台'],
];

/** 敏感字段脱敏，避免密码、密钥明文落库 */
const SENSITIVE = ['password', 'api_key', 'apiKey', 'file_base64', 'fileBase64', 'secret'];

function desensitize(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = Array.isArray(obj) ? [] : {};
  for (const k of Object.keys(obj)) {
    if (SENSITIVE.includes(k)) {
      out[k] = '******';
    } else if (typeof obj[k] === 'object' && obj[k] !== null) {
      out[k] = desensitize(obj[k]);
    } else if (typeof obj[k] === 'string' && obj[k].length > 500) {
      out[k] = obj[k].slice(0, 500) + `...(共${obj[k].length}字)`;
    } else {
      out[k] = obj[k];
    }
  }
  return out;
}

/**
 * 操作日志拦截器
 * 只记录写操作（POST/PUT/DELETE），查询不记录，避免日志表暴涨。
 * 落库失败绝不影响主业务。
 */
@Injectable()
export class OperLogInterceptor implements NestInterceptor {
  constructor(@InjectRepository(SysOperLog) private readonly repo: Repository<SysOperLog>) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    if (!['POST', 'PUT', 'DELETE'].includes(method)) return next.handle();

    const start = Date.now();
    const url: string = req.originalUrl || req.url || '';
    const write = (success: number, errorMsg?: string) => {
      const user: AuthUser = req.user;
      const mod = MODULE_MAP.find(([p]) => url.startsWith(p))?.[1] || '其他';
      const entity = this.repo.create({
        enterpriseId: Number(req.enterpriseId || user?.enterpriseId || 0),
        userId: user?.userId || 0,
        username: user?.realName || user?.username || '匿名',
        module: mod,
        action: `${method} ${url.split('?')[0]}`,
        method,
        url: url.slice(0, 250),
        ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].slice(0, 60),
        params: JSON.stringify(desensitize(req.body || {})).slice(0, 2000),
        success,
        errorMsg: errorMsg?.slice(0, 500),
        costMs: Date.now() - start,
      });
      this.repo.save(entity).catch(() => void 0);
    };

    return next.handle().pipe(
      tap(() => write(1)),
      catchError((err) => {
        write(0, err?.message || '未知异常');
        return throwError(() => err);
      }),
    );
  }
}
