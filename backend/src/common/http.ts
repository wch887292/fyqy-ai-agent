import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { R } from './result';

/**
 * 全局响应包装器
 * Controller 直接 return 业务数据，这里统一裹成 { code, msg, data }
 * 若 Controller 已返回标准结构则原样透出
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'code' in data && 'msg' in data) return data;
        return R.ok(data);
      }),
    );
  }
}

/** 全局异常过滤器：任何异常都以统一结构返回，不泄露堆栈给前端 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let msg = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as any;
      msg = typeof r === 'string' ? r : Array.isArray(r?.message) ? r.message[0] : r?.message || exception.message;
    } else if (exception?.message) {
      msg = exception.message;
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} -> ${msg}`, exception?.stack);
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${msg}`);
    }

    // HTTP 状态统一 200，业务状态放 code，前端只处理一种分支
    res.status(HttpStatus.OK).json(R.fail(msg, status));
  }
}
