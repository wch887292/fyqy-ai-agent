import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import * as path from 'path';
import * as fs from 'fs';

import configuration from './config/configuration';
import { ALL_ENTITIES, SysOperLog } from './entities';
import { AuthGuard } from './common/auth';
import { OperLogInterceptor } from './common/oper-log.interceptor';
import { InfraModule } from './infra/infra.module';

import { AuthModule } from './modules/auth/auth.module';
import { OrgModule } from './modules/org/org.module';
import { AiModule } from './modules/ai/ai.module';
import { KbModule } from './modules/kb/kb.module';
import { CrmModule } from './modules/crm/crm.module';
import { ErpModule } from './modules/erp/erp.module';
import { PartnerModule } from './modules/partner/partner.module';
import { SystemModule } from './modules/system/system.module';
import { WorkbenchModule } from './modules/workbench/workbench.module';
import { SeedModule } from './modules/seed/seed.module';

/**
 * 应用主模块
 * 飞虹智-企业AI一站式平台 V1.0
 * 晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
 *
 * 数据库连接按 DB_DRIVER 自适应：
 *   sqlite -> 本地文件，开箱即用，用于开发与轻量演示
 *   mysql  -> 生产私有化部署
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.local'],
    }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const db = cfg.get('db');
        const common = {
          entities: ALL_ENTITIES,
          synchronize: db.synchronize,
          logging: false as const,
        };
        if (db.driver === 'mysql') {
          return {
            type: 'mysql' as const,
            host: db.host,
            port: db.port,
            username: db.user,
            password: db.password,
            database: db.name,
            charset: 'utf8mb4',
            timezone: '+08:00',
            ...common,
          };
        }
        // SQLite：确保数据目录存在，避免首次启动报错
        const file = path.resolve(process.cwd(), db.sqliteFile);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        return { type: 'better-sqlite3' as const, database: file, ...common };
      },
    }),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('jwt').secret,
        signOptions: { expiresIn: cfg.get('jwt').expiresIn },
      }),
    }),

    // 全局操作日志拦截器所需的仓储
    TypeOrmModule.forFeature([SysOperLog]),

    InfraModule,

    AuthModule,
    OrgModule,
    AiModule,
    KbModule,
    CrmModule,
    ErpModule,
    PartnerModule,
    SystemModule,
    WorkbenchModule,
    SeedModule,
  ],
  providers: [
    // 全局鉴权 + 租户隔离
    { provide: APP_GUARD, useClass: AuthGuard },
    // 全局操作日志
    { provide: APP_INTERCEPTOR, useClass: OperLogInterceptor },
  ],
})
export class AppModule {}
