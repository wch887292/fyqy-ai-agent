import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 文件存储服务
 *   local —— 落本地磁盘（配合 Docker volume 即可满足单机私有化交付）
 *   minio —— 对象存储，动态加载 minio SDK，未安装时自动回落 local
 * 存储路径强制按 enterprise_id 分目录，物理层面隔离租户文件。
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private readonly cfg: any;
  private minio: any = null;

  constructor(private readonly config: ConfigService) {
    this.cfg = this.config.get('storage');
  }

  async onModuleInit() {
    const dir = path.resolve(this.cfg.localDir);
    fs.mkdirSync(dir, { recursive: true });

    if (this.cfg.driver !== 'minio') {
      this.logger.log(`文件存储：本地磁盘 ${dir}`);
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('minio');
      const u = new URL(this.cfg.endpoint);
      this.minio = new Client({
        endPoint: u.hostname,
        port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
        useSSL: u.protocol === 'https:',
        accessKey: this.cfg.accessKey,
        secretKey: this.cfg.secretKey,
      });
      const exists = await this.minio.bucketExists(this.cfg.bucket);
      if (!exists) await this.minio.makeBucket(this.cfg.bucket);
      this.logger.log(`文件存储：MinIO ${this.cfg.endpoint}/${this.cfg.bucket}`);
    } catch (e: any) {
      this.minio = null;
      this.logger.warn(`MinIO 初始化失败(${e.message})，回落本地磁盘存储`);
    }
  }

  /** 保存文件，返回可用于回读的存储路径 */
  async save(enterpriseId: number, fileName: string, buf: Buffer): Promise<string> {
    const safeName = `${Date.now()}_${fileName.replace(/[\\/:*?"<>|]/g, '_')}`;
    const objectKey = `ent_${enterpriseId}/${safeName}`;

    if (this.minio) {
      try {
        await this.minio.putObject(this.cfg.bucket, objectKey, buf);
        return `minio://${this.cfg.bucket}/${objectKey}`;
      } catch (e: any) {
        this.logger.error(`MinIO 上传失败(${e.message})，改存本地`);
      }
    }

    const full = path.resolve(this.cfg.localDir, objectKey);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buf);
    return `local://${objectKey}`;
  }

  /** 回读文件 */
  async read(storePath: string): Promise<Buffer> {
    if (storePath?.startsWith('minio://') && this.minio) {
      const rest = storePath.slice('minio://'.length);
      const idx = rest.indexOf('/');
      const bucket = rest.slice(0, idx);
      const key = rest.slice(idx + 1);
      const stream = await this.minio.getObject(bucket, key);
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      return Buffer.concat(chunks);
    }
    const key = storePath.replace(/^local:\/\//, '');
    return fs.readFileSync(path.resolve(this.cfg.localDir, key));
  }

  async remove(storePath: string): Promise<void> {
    try {
      if (storePath?.startsWith('minio://') && this.minio) {
        const rest = storePath.slice('minio://'.length);
        const idx = rest.indexOf('/');
        await this.minio.removeObject(rest.slice(0, idx), rest.slice(idx + 1));
        return;
      }
      const key = storePath.replace(/^local:\/\//, '');
      const full = path.resolve(this.cfg.localDir, key);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (e: any) {
      this.logger.warn(`删除文件失败：${e.message}`);
    }
  }
}
