import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KbChunk, SysConfig } from '../entities';
import { LlmService } from './llm/llm.service';
import { EmbeddingService } from './vector/embedding.service';
import { VectorService } from './vector/vector.service';
import { StorageService } from './storage/storage.service';
import { DocParserService } from './parser/doc-parser.service';

/**
 * 基础设施层
 * 大模型、向量、存储、解析四大能力统一在此收口，全局可注入。
 * 业务模块只依赖这里的抽象，不感知底层用的是 SQLite 还是 MySQL、memory 还是 Milvus。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SysConfig, KbChunk])],
  providers: [LlmService, EmbeddingService, VectorService, StorageService, DocParserService],
  exports: [LlmService, EmbeddingService, VectorService, StorageService, DocParserService],
})
export class InfraModule {}
