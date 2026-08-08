import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KbChunk, KbDocument, SysUser } from '../../entities';
import { KbService } from './kb.service';
import { KbController } from './kb.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([KbDocument, KbChunk, SysUser]), AiModule],
  providers: [KbService],
  controllers: [KbController],
  exports: [KbService],
})
export class KbModule {}
