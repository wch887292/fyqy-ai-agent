import { Controller, Get, Post, Put, Delete, Query, Body, Param, UseGuards } from "@nestjs/common";
import { AgentBuilderService } from "./agent-builder.service";
import { AuthGuard, AuthUser, CurrentUser as GetCurrent } from "../../common/auth";
import { R } from "../../common/result";

@Controller("agent-builder")
@UseGuards(AuthGuard)
export class AgentBuilderController {
  constructor(private readonly svc: AgentBuilderService) {}

  // ── 知识库文档列表（供智能体关联选择） ──
  @Get("kb-docs")
  async kbDocs(@GetCurrent() user: AuthUser, @Query("keyword") keyword?: string) {
    const list = await this.svc.kbDocList(user.enterpriseId, keyword);
    return R.ok(list);
  }

  // ════════════ 简易智能体 ════════════

  @Get("simple/list")
  async simpleList(@GetCurrent() user: AuthUser, @Query() query: any) {
    return R.ok(await this.svc.simplePage(query, user));
  }

  @Post("simple/save")
  async simpleSave(@GetCurrent() user: AuthUser, @Body() dto: any) {
    return R.ok(await this.svc.simpleSave(dto, user));
  }

  @Post("simple/enable")
  async simpleEnable(@GetCurrent() user: AuthUser, @Body() dto: any) {
    return R.ok(await this.svc.simpleEnable(dto.id, dto.enable, user));
  }

  @Delete("simple/delete/:id")
  async simpleDelete(@GetCurrent() user: AuthUser, @Param("id") id: number) {
    return R.ok(await this.svc.simpleDelete(id, user));
  }

  @Post("simple/chat/:id")
  async simpleChat(@GetCurrent() user: AuthUser, @Param("id") id: number, @Body() dto: any) {
    return R.ok(await this.svc.simpleChat(id, dto, user));
  }

  // ════════════ 高级智能体 ════════════

  @Get("advanced/list")
  async advancedList(@GetCurrent() user: AuthUser, @Query() query: any) {
    return R.ok(await this.svc.advancedPage(query, user));
  }

  @Post("advanced/save")
  async advancedSave(@GetCurrent() user: AuthUser, @Body() dto: any) {
    return R.ok(await this.svc.advancedSave(dto, user));
  }

  @Post("advanced/enable")
  async advancedEnable(@GetCurrent() user: AuthUser, @Body() dto: any) {
    return R.ok(await this.svc.advancedEnable(dto.id, dto.enable, user));
  }

  @Delete("advanced/delete/:id")
  async advancedDelete(@GetCurrent() user: AuthUser, @Param("id") id: number) {
    return R.ok(await this.svc.advancedDelete(id, user));
  }

  @Get("advanced/nodes/:flowId")
  async advancedNodes(@GetCurrent() user: AuthUser, @Param("flowId") flowId: number) {
    return R.ok(await this.svc.advancedNodes(flowId, user));
  }

  @Post("advanced/chat/:id")
  async advancedChat(@GetCurrent() user: AuthUser, @Param("id") id: number, @Body() dto: any) {
    return R.ok(await this.svc.advancedChat(id, dto, user));
  }

  // ════════════ 执行记录 ════════════

  @Get("record/list")
  async recordList(@GetCurrent() user: AuthUser, @Query() query: any) {
    return R.ok(await this.svc.recordPage(query, user));
  }
}
