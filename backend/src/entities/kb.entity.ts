import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { T, bigintCol, numericTransformer } from '../common/db-types';

/** 知识库文档分类枚举（对应文档五大库） */
export const KB_CATEGORIES = [
  { code: 'system', name: '企业制度库' },
  { code: 'product', name: '产品资料库' },
  { code: 'script', name: '销售话术库' },
  { code: 'train', name: '培训知识库' },
  { code: 'contract', name: '合同文档库' },
] as const;

/** 知识库文档主表 */
@Entity('kb_document')
@Index('idx_kb_ent_cat', ['enterpriseId', 'category'])
export class KbDocument {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ length: 64, comment: 'system/product/script/train/contract' })
  category: string;

  @Column({ length: 255 })
  title: string;

  @Column({ name: 'file_name', length: 255, nullable: true })
  fileName: string;

  @Column({ name: 'file_path', length: 512, nullable: true })
  filePath: string;

  @Column({ name: 'file_size', type: T.bigint, default: 0, transformer: numericTransformer })
  fileSize: number;

  @Column({ type: T.longtext, nullable: true, comment: 'AI解析后的完整文本' })
  content: string;

  @Column({ type: T.text, nullable: true, comment: 'AI生成摘要' })
  summary: string;

  @Column({ name: 'tag_list', length: 512, nullable: true, comment: 'AI生成标签' })
  tagList: string;

  @Column({ name: 'perm_scope', length: 32, default: 'all', comment: 'all全员/dept指定部门/role指定角色' })
  permScope: string;

  @Column({ name: 'perm_targets', length: 512, nullable: true, comment: '部门ID或角色ID列表' })
  permTargets: string;

  @Column({ name: 'vector_status', type: 'tinyint', default: 0, comment: '0待向量化 1完成 2失败' })
  vectorStatus: number;

  @Column({ name: 'chunk_count', type: 'int', default: 0 })
  chunkCount: number;

  @Column({ name: 'created_by', ...bigintCol() })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** 知识库切片与向量表 */
@Entity('kb_chunk')
@Index('idx_chunk_ent_doc', ['enterpriseId', 'docId'])
export class KbChunk {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'doc_id', ...bigintCol(false) })
  docId: number;

  @Column({ name: 'chunk_index', type: 'int', default: 0 })
  chunkIndex: number;

  @Column({ type: T.text })
  content: string;

  @Column({ type: T.longtext, nullable: true, comment: 'memory模式存向量JSON' })
  embedding: string;

  @Column({ name: 'vector_id', length: 64, nullable: true, comment: 'Milvus主键' })
  vectorId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** AI问答会话历史 */
@Entity('kb_chat_history')
@Index('idx_chat_ent_user', ['enterpriseId', 'userId'])
export class KbChatHistory {
  @PrimaryGeneratedColumn({ type: T.pk })
  id: number;

  @Column({ name: 'enterprise_id', ...bigintCol(false) })
  enterpriseId: number;

  @Column({ name: 'user_id', ...bigintCol(false) })
  userId: number;

  @Column({ type: T.text })
  question: string;

  @Column({ type: T.longtext, nullable: true })
  answer: string;

  @Column({ name: 'ref_docs', type: T.text, nullable: true, comment: '引用文档JSON' })
  refDocs: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
