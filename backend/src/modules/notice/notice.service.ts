import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SysNotice, SysUser } from '../../entities';
import { snakePage } from '../../common/result';
import { parsePage } from '../../common/scope';

/**
 * 站内消息通知服务（V2.0 新增）
 *
 * 同时充当文档中规划的「notify-service」逻辑服务：
 *   其它业务模块（智能体引擎、订单事件、风险巡检等）统一通过本服务的 send()
 *   向指定用户推送站内消息，保证消息入口单一、租户隔离、可统一查询与已读管理。
 */
@Injectable()
export class NoticeService {
  constructor(
    @InjectRepository(SysNotice) private readonly noticeRepo: Repository<SysNotice>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
  ) {}

  /** 推送一条消息（被其它模块调用） */
  async send(
    entId: number,
    receiveUserId: number,
    title: string,
    content: string,
    bizType?: string,
    bizId = 0,
    createdBy = 0,
  ): Promise<SysNotice> {
    if (!receiveUserId) return null;
    const n = this.noticeRepo.create({
      enterpriseId: entId,
      receiveUserId,
      title,
      content,
      bizType: bizType ?? null,
      bizId,
      isRead: 0,
      createdBy,
    });
    return this.noticeRepo.save(n);
  }

  /** 按业务类型/ID 推送给一组用户 */
  async sendToMany(
    entId: number,
    userIds: number[],
    title: string,
    content: string,
    bizType?: string,
    bizId = 0,
    createdBy = 0,
  ): Promise<void> {
    const ids = [...new Set(userIds.filter(Boolean))];
    for (const uid of ids) await this.send(entId, uid, title, content, bizType, bizId, createdBy);
  }

  /** 当前用户消息分页 */
  async page(entId: number, userId: number, query: any) {
    const { page, size, skip, take } = parsePage(query);
    const qb = this.noticeRepo
      .createQueryBuilder('n')
      .where('n.enterpriseId = :entId', { entId })
      .andWhere('n.receiveUserId = :uid', { uid: userId });
    if (query.is_read !== undefined && query.is_read !== '' && query.is_read !== null) {
      qb.andWhere('n.isRead = :r', { r: Number(query.is_read) });
    }
    if (query.biz_type) qb.andWhere('n.bizType = :bt', { bt: query.biz_type });
    qb.orderBy('n.createdAt', 'DESC');
    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();
    return snakePage(list, total, page, size);
  }

  /** 单条标记已读 */
  async read(entId: number, userId: number, noticeId: number) {
    await this.noticeRepo.update(
      { id: noticeId, enterpriseId: entId, receiveUserId: userId },
      { isRead: 1 },
    );
    return { success: true };
  }

  /** 全部标记已读 */
  async readAll(entId: number, userId: number) {
    await this.noticeRepo.update(
      { enterpriseId: entId, receiveUserId: userId, isRead: 0 },
      { isRead: 1 },
    );
    return { success: true };
  }

  /** 未读数量（右上角铃铛角标） */
  async unreadCount(entId: number, userId: number): Promise<number> {
    return this.noticeRepo.count({ where: { enterpriseId: entId, receiveUserId: userId, isRead: 0 } });
  }

  /** 解析用户名（用于消息内容填充） */
  async userName(entId: number, userId: number): Promise<string> {
    if (!userId) return '';
    const u = await this.userRepo.findOne({ where: { enterpriseId: entId, id: userId } });
    return u?.realName || u?.username || '';
  }
}
