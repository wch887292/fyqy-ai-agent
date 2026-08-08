import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErpOrder, ErpOrderItem, ErpProduct, ErpStockRecord, ProdWorkOrder } from '../../entities';
import { ProdService } from './prod.service';
import { ProdController } from './prod.controller';
import { NoticeModule } from '../notice/notice.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProdWorkOrder,
      ErpProduct,
      ErpStockRecord,
      ErpOrder,
      ErpOrderItem,
    ]),
    NoticeModule,
  ],
  providers: [ProdService],
  controllers: [ProdController],
  exports: [ProdService],
})
export class ProdModule {}
