import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SystemService } from './system.service';
import { AuthUser, CurrentUser, Public, RequireMenu, TenantId } from '../../common/auth';

/**
 * 健康检查 /health
 *
 * 免鉴权，供 Docker HEALTHCHECK、K8s 探针与负载均衡器调用。
 * 注意 main.ts 的 setGlobalPrefix 已将 health 排除，故路径不带 /api 前缀。
 * 不返回任何业务或租户数据，仅暴露存活状态。
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      app: '飞虹智-企业AI一站式平台',
      version: '1.0.0',
      mode: process.env.APP_MODE || 'dev',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }
}

/**
 * 系统设置 /api/v1/system
 * 对应文档 1.7 章节
 *
 * 权限说明：
 *   - info 仅返回版本、运行模式、驱动名与企业名称，是全局布局页头的数据源，全体登录可读；
 *   - 大模型配置、业务参数、操作日志均为管理员职能，按 system:ai / system:enterprise / system:log 收口。
 */
@Controller('v1/system')
export class SystemController {
  constructor(private readonly svc: SystemService) {}

  // ---------- 大模型配置 ----------

  /** POST /api/v1/system/ai_config/save 保存 OpenClaw 大模型配置 */
  @Post('ai_config/save')
  @RequireMenu('system:ai')
  saveAiConfig(@TenantId() entId: number, @Body() body: any) {
    return this.svc.saveAiConfig(entId, body);
  }

  /** GET /api/v1/system/ai_config/get 获取大模型配置 */
  @Get('ai_config/get')
  @RequireMenu('system:ai')
  getAiConfig(@TenantId() entId: number) {
    return this.svc.getAiConfig(entId);
  }

  /** POST /api/v1/system/ai_config/test 大模型连通性测试 */
  @Post('ai_config/test')
  @RequireMenu('system:ai')
  testAiConfig(@TenantId() entId: number, @Body() body: any) {
    return this.svc.testAiConfig(entId, body);
  }

  // ---------- 业务参数 ----------

  /** POST /api/v1/system/config/save 保存企业业务参数 */
  @Post('config/save')
  @RequireMenu('system:enterprise')
  saveConfig(@TenantId() entId: number, @Body() body: any) {
    return this.svc.saveConfig(entId, body);
  }

  /** GET /api/v1/system/config/get 读取企业业务参数 */
  @Get('config/get')
  @RequireMenu('system:enterprise')
  getConfig(@TenantId() entId: number) {
    return this.svc.getConfig(entId);
  }

  // ---------- 操作日志 ----------

  /** GET /api/v1/system/log/page 操作日志分页 */
  @Get('log/page')
  @RequireMenu('system:log')
  logPage(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Query() query: any) {
    return this.svc.logPage(entId, user, query);
  }

  /** GET /api/v1/system/log/stat 近 7 日操作趋势 */
  @Get('log/stat')
  @RequireMenu('system:log')
  logStat(@TenantId() entId: number) {
    return this.svc.logStat(entId);
  }

  /** POST /api/v1/system/log/clean 清理历史日志 */
  @Post('log/clean')
  @RequireMenu('system:log')
  cleanLog(@TenantId() entId: number, @Body() body: any) {
    return this.svc.cleanLog(entId, Number(body.days || 90));
  }

  // ---------- 运行信息 ----------

  /** GET /api/v1/system/info 系统运行信息（全局页头数据源，全体登录可读） */
  @Get('info')
  info(@TenantId() entId: number) {
    return this.svc.info(entId);
  }
}
