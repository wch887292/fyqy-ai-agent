import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, RequireMenu, TenantId } from '../../common/auth';
import { AgentService } from './agent.service';

/**
 * OpenClaw 智能体自动化引擎 /api/v1/agent
 * 对应 V2.0 文档「OpenClaw 智能体自动化引擎」
 */
@Controller('v1/agent')
export class AgentController {
  constructor(private readonly svc: AgentService) {}

  @Get('template/list')
  @RequireMenu('agent', 'agent:task')
  templateList() {
    return this.svc.templateList();
  }

  @Post('task/save')
  @RequireMenu('agent', 'agent:task')
  taskSave(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.taskSave(entId, user, body);
  }

  @Get('task/page')
  @RequireMenu('agent', 'agent:task')
  taskPage(@TenantId() entId: number, @Query() query: any) {
    return this.svc.taskPage(entId, query);
  }

  @Post('task/enable')
  @RequireMenu('agent', 'agent:task')
  taskEnable(@TenantId() entId: number, @Body() body: any) {
    return this.svc.taskEnable(entId, body);
  }

  @Get('log/page')
  @RequireMenu('agent', 'agent:log')
  logPage(@TenantId() entId: number, @Query() query: any) {
    return this.svc.logPage(entId, query);
  }

  @Post('manual_run')
  @RequireMenu('agent', 'agent:task')
  manualRun(@TenantId() entId: number, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.svc.manualRun(entId, user, body.task_id ?? body.taskId ?? body.id);
  }
}
