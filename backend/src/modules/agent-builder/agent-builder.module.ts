import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AgentSimple, AgentAdvanced, AgentAdvancedNode, AgentExecRecord, KbDocument } from "../../entities";
import { AgentBuilderService } from "./agent-builder.service";
import { AgentBuilderController } from "./agent-builder.controller";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentSimple, AgentAdvanced, AgentAdvancedNode, AgentExecRecord, KbDocument]),
    AiModule,
  ],
  controllers: [AgentBuilderController],
  providers: [AgentBuilderService],
  exports: [AgentBuilderService],
})
export class AgentBuilderModule {}
