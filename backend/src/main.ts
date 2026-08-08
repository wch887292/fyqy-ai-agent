import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionFilter, TransformInterceptor } from './common/http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const port = config.get('port');
  const mode = config.get('mode');

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableCors({ origin: true, credentials: true });
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
      forbidNonWhitelisted: false,
      validationError: { target: false },
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionFilter());

  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  const db = config.get('db');
  const vec = config.get('vector');
  const sto = config.get('storage');
  const llm = config.get('llm');

  logger.log('='.repeat(72));
  logger.log(`  ${config.get('appName')} V2.0`);
  logger.log('  晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心');
  logger.log('-'.repeat(72));
  logger.log(`  运行模式   : ${mode}`);
  logger.log(`  服务地址   : http://localhost:${port}/api`);
  logger.log(`  数据库     : ${db.driver}${db.driver === 'sqlite' ? ` (${db.sqliteFile})` : ` (${db.host}:${db.port}/${db.name})`}`);
  logger.log(`  向量库     : ${vec.driver}`);
  logger.log(`  文件存储   : ${sto.driver}`);
  logger.log(`  大模型     : ${llm.endpoint ? `OpenClaw ${llm.endpoint}` : '未配置（自动降级为规则引擎，功能可完整演示）'}`);
  logger.log(`  智能体调度 : 已启用（每分钟扫描 cron 任务 + 订单事件触发）`);
  logger.log(`  V2.0 新增  : 智能体引擎 / 合伙人自动分利 / 生产工单 / 站内消息 / 批量导入导出`);
  logger.log('='.repeat(72));
}

bootstrap();
