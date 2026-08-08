import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  CrmCustomer,
  CrmFollow,
  Department,
  Enterprise,
  ErpOrder,
  ErpOrderItem,
  ErpProduct,
  ErpStockRecord,
  ErpStockWarn,
  KbDocument,
  PartnerConfig,
  PartnerPerformance,
  SysRole,
  SysUser,
} from '../../entities';
import { bizNo } from '../../common/scope';
import { ALL_MENU_CODES } from '../../common/menus';
import { OrgService } from '../org/org.service';
import { AiService } from '../ai/ai.service';
import {
  DEMO_CUSTOMERS,
  DEMO_DEPTS,
  DEMO_DOCS,
  DEMO_ENTERPRISE,
  DEMO_FOLLOWS,
  DEMO_ORDERS,
  DEMO_PRODUCTS,
  DEMO_USERS,
} from './seed.data';

/**
 * 数据初始化服务
 *
 * 启动策略（幂等，重复启动不会重复写入）：
 *   1. 库为空 -> 创建演示企业 + 内置角色 + 管理员账号 + 平台超级管理员
 *   2. dev 模式或显式开启 SEED_DEMO=true -> 追加全套演示业务数据，开箱即可跑通全流程
 *   3. prod 模式默认只建租户骨架，不塞演示数据，避免污染客户正式环境
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger('SeedService');

  constructor(
    @InjectRepository(Enterprise) private readonly entRepo: Repository<Enterprise>,
    @InjectRepository(Department) private readonly deptRepo: Repository<Department>,
    @InjectRepository(SysRole) private readonly roleRepo: Repository<SysRole>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    @InjectRepository(CrmCustomer) private readonly custRepo: Repository<CrmCustomer>,
    @InjectRepository(CrmFollow) private readonly followRepo: Repository<CrmFollow>,
    @InjectRepository(ErpProduct) private readonly prodRepo: Repository<ErpProduct>,
    @InjectRepository(ErpStockRecord) private readonly recRepo: Repository<ErpStockRecord>,
    @InjectRepository(ErpStockWarn) private readonly warnRepo: Repository<ErpStockWarn>,
    @InjectRepository(ErpOrder) private readonly orderRepo: Repository<ErpOrder>,
    @InjectRepository(ErpOrderItem) private readonly itemRepo: Repository<ErpOrderItem>,
    @InjectRepository(KbDocument) private readonly docRepo: Repository<KbDocument>,
    @InjectRepository(PartnerConfig) private readonly pcfgRepo: Repository<PartnerConfig>,
    @InjectRepository(PartnerPerformance) private readonly perfRepo: Repository<PartnerPerformance>,
    private readonly org: OrgService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    try {
      const count = await this.entRepo.count();
      if (count > 0) {
        this.logger.log('检测到已有企业数据，跳过初始化');
        return;
      }

      this.logger.log('首次启动，开始初始化数据…');
      const { enterprise_id, admin_username, init_password } =
        await this.org.createEnterprise(DEMO_ENTERPRISE);

      await this.ensureSuperAdmin(enterprise_id);

      const seedDemo =
        process.env.SEED_DEMO === 'true' ||
        (process.env.SEED_DEMO !== 'false' && this.config.get('mode') === 'dev');

      if (seedDemo) {
        await this.seedDemo(enterprise_id);
      }

      this.logger.log('─'.repeat(64));
      this.logger.log(`初始化完成｜演示企业：${DEMO_ENTERPRISE.name}（ID ${enterprise_id}）`);
      this.logger.log(`企业管理员：${admin_username} / ${init_password}`);
      this.logger.log(`平台超管  ：superadmin / admin@2026`);
      if (seedDemo) {
        this.logger.log(`业务账号  ：sales01 / partner01 / stock01，初始密码均为 123456`);
      }
      this.logger.log('─'.repeat(64));
    } catch (e: any) {
      // 初始化失败不能拖垮服务，打日志让运维介入即可
      this.logger.error(`数据初始化失败：${e.message}`);
    }
  }

  /** 平台级超级管理员，可跨租户运维 */
  private async ensureSuperAdmin(entId: number) {
    const exist = await this.userRepo.findOne({ where: { username: 'superadmin' } });
    if (exist) return;
    const role = await this.roleRepo.save(
      this.roleRepo.create({
        enterpriseId: entId,
        roleName: '平台超级管理员',
        roleCode: 'super_admin',
        dataScope: 3,
        menuCodes: ALL_MENU_CODES.join(','),
        remark: '平台级，管理全部企业租户',
      }),
    );
    await this.userRepo.save(
      this.userRepo.create({
        enterpriseId: entId,
        deptId: 0,
        roleIds: String(role.id),
        username: 'superadmin',
        password: await bcrypt.hash('admin@2026', 10),
        realName: '平台超级管理员',
        post: '平台运维',
        isPartner: 0,
        isSuper: 1,
        status: 1,
      }),
    );
  }

  /** 全套演示业务数据 */
  private async seedDemo(entId: number) {
    // ---------- 部门 ----------
    const deptMap = new Map<string, number>();
    const rootDept = await this.deptRepo.findOne({ where: { enterpriseId: entId, parentId: 0 } });
    deptMap.set('总经办', Number(rootDept?.id || 0));
    for (const d of DEMO_DEPTS) {
      const saved = await this.deptRepo.save(
        this.deptRepo.create({
          enterpriseId: entId,
          name: d.name,
          parentId: Number(rootDept?.id || 0),
          sort: d.sort,
        }),
      );
      deptMap.set(d.name, Number(saved.id));
    }

    // ---------- 员工 ----------
    const roles = await this.roleRepo.find({ where: { enterpriseId: entId } });
    const roleMap = new Map(roles.map((r) => [r.roleCode, Number(r.id)]));
    const userMap = new Map<string, SysUser>();
    const pwd = await bcrypt.hash('123456', 10);

    for (const u of DEMO_USERS) {
      const saved = await this.userRepo.save(
        this.userRepo.create({
          enterpriseId: entId,
          deptId: deptMap.get(u.dept) || 0,
          roleIds: String(roleMap.get(u.role) || ''),
          username: u.username,
          password: pwd,
          realName: u.realName,
          phone: u.phone,
          post: u.post,
          isPartner: u.isPartner,
          isSuper: 0,
          status: 1,
        }),
      );
      userMap.set(u.username, saved);
    }
    // 销售主管兼任销售部负责人
    const salesDeptId = deptMap.get('销售部');
    if (salesDeptId && userMap.get('sales01')) {
      await this.deptRepo.update(salesDeptId, {
        leaderUserId: Number(userMap.get('sales01').id),
      });
    }

    // ---------- 客户 ----------
    const custMap = new Map<string, CrmCustomer>();
    for (const c of DEMO_CUSTOMERS) {
      const owner = c.owner ? userMap.get(c.owner) : null;
      const lastFollow = c.followDays
        ? new Date(Date.now() - c.followDays * 86400000)
        : null;
      const saved = await this.custRepo.save(
        this.custRepo.create({
          enterpriseId: entId,
          companyName: c.companyName,
          customerName: c.customerName,
          phone: c.phone,
          // contact_time 一律服务器时间
          contactTime: lastFollow || new Date(),
          remark: c.remark,
          tags: c.tags,
          grade: c.grade,
          intentionScore: c.intentionScore,
          aiAnalysis: '',
          ownerUserId: owner ? Number(owner.id) : 0,
          deptId: owner ? Number(owner.deptId) : 0,
          isPublic: (c as any).isPublic ?? 0,
          lastFollowTime: lastFollow,
          nextFollowTime: null,
        }),
      );
      custMap.set(c.customerName, saved);
    }

    // ---------- 跟进记录 ----------
    for (const f of DEMO_FOLLOWS) {
      const cust = custMap.get(f.customer);
      const user = userMap.get(f.user);
      if (!cust || !user) continue;
      const created = new Date(Date.now() - f.daysAgo * 86400000);
      const next = f.nextDays ? new Date(Date.now() + f.nextDays * 86400000) : null;
      const row = this.followRepo.create({
        enterpriseId: entId,
        customerId: Number(cust.id),
        userId: Number(user.id),
        followType: f.followType,
        content: f.content,
        nextFollowTime: next,
        aiSuggest: '',
      });
      const saved = await this.followRepo.save(row);
      // CreateDateColumn 会被自动赋值，这里回写成模拟的历史时间
      await this.followRepo.update(saved.id, { createdAt: created } as any);
      if (next) await this.custRepo.update(cust.id, { nextFollowTime: next });
    }

    // ---------- 产品与库存 ----------
    const prodMap = new Map<string, ErpProduct>();
    for (const p of DEMO_PRODUCTS) {
      const saved = await this.prodRepo.save(
        this.prodRepo.create({ enterpriseId: entId, status: 1, ...p }),
      );
      prodMap.set(p.productCode, saved);

      // 建账初始入库流水，保证库存有据可查
      await this.recRepo.save(
        this.recRepo.create({
          enterpriseId: entId,
          productId: Number(saved.id),
          type: 'in',
          num: p.stockNum,
          beforeNum: 0,
          afterNum: p.stockNum,
          bizType: 'init',
          bizId: 0,
          remark: '系统初始化建账入库',
          operatorId: Number(userMap.get('stock01')?.id || 0),
        }),
      );

      // 低于预警线的直接生成预警，首页待办立刻有内容
      if (p.stockNum < p.warnStock) {
        await this.warnRepo.save(
          this.warnRepo.create({
            enterpriseId: entId,
            productId: Number(saved.id),
            productName: p.productName,
            stockNum: p.stockNum,
            warnStock: p.warnStock,
            aiAdvice: `${p.productName}当前库存 ${p.stockNum}，低于预警线 ${p.warnStock}，缺口 ${
              p.warnStock - p.stockNum
            }。建议本次补货 ${p.warnStock - p.stockNum + Math.ceil(p.warnStock * 0.5)} 以上，并核对在手订单占用量。`,
            handled: 0,
          }),
        );
      }
    }

    // ---------- 订单 ----------
    for (const o of DEMO_ORDERS) {
      const cust = custMap.get(o.customer);
      const owner = userMap.get(o.owner);
      if (!cust || !owner) continue;

      const items = o.items
        .map((it) => {
          const p = prodMap.get(it.code);
          if (!p) return null;
          return {
            productId: Number(p.id),
            productName: p.productName,
            spec: p.spec,
            price: it.price,
            num: it.num,
            amount: Number((it.price * it.num).toFixed(2)),
          };
        })
        .filter(Boolean) as any[];
      const total = items.reduce((s, i) => s + i.amount, 0);

      const delivery = new Date(Date.now() + o.deliveryDaysLater * 86400000);
      const p2 = (n: number) => String(n).padStart(2, '0');
      const deliveryDate = `${delivery.getFullYear()}-${p2(delivery.getMonth() + 1)}-${p2(delivery.getDate())}`;

      const warnMsgs: string[] = [];
      if (o.deliveryDaysLater <= 3) warnMsgs.push(`交期仅剩 ${o.deliveryDaysLater} 天，排产压力大`);
      for (const it of items) {
        const p = [...prodMap.values()].find((x) => Number(x.id) === it.productId);
        if (p && p.stockNum < it.num) warnMsgs.push(`${p.productName}库存不足，存在无法按期交付风险`);
      }

      const order = await this.orderRepo.save(
        this.orderRepo.create({
          enterpriseId: entId,
          orderNo: bizNo('SO'),
          customerId: Number(cust.id),
          customerName: cust.customerName,
          totalAmount: Number(total.toFixed(2)),
          orderStatus: o.status,
          ownerUserId: Number(owner.id),
          deliveryDate,
          aiWarnMsg: warnMsgs.length ? `风险提示：${warnMsgs.join('；')}。建议立即与客户确认交期与付款安排。` : '',
          remark: o.remark,
        }),
      );

      for (const it of items) {
        await this.itemRepo.save(
          this.itemRepo.create({ enterpriseId: entId, orderId: Number(order.id), ...it }),
        );
      }
    }

    // ---------- 合伙人分权与业绩台账 ----------
    const partner = userMap.get('partner01');
    if (partner) {
      await this.pcfgRepo.save(
        this.pcfgRepo.create({
          enterpriseId: entId,
          userId: Number(partner.id),
          partnerType: '区域合伙人',
          dataScope: 2,
          menuCodes: ['workbench', 'crm', 'crm:customer', 'crm:follow', 'partner', 'partner:performance', 'partner:risk'].join(','),
          defaultRatio: 8,
          enable: 1,
          remark: '负责闽南片区，按回款业绩计提',
        }),
      );

      const period = new Date();
      const pStr = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}`;
      for (const rec of [
        { amount: 58000, no: '', remark: '闽南片区上月回款业绩' },
        { amount: 36400, no: '', remark: '新客户开发业绩归属' },
      ]) {
        await this.perfRepo.save(
          this.perfRepo.create({
            enterpriseId: entId,
            userId: Number(partner.id),
            orderId: 0,
            orderNo: rec.no,
            performanceAmount: rec.amount,
            ratio: 8,
            estimateAmount: Number(((rec.amount * 8) / 100).toFixed(2)),
            period: pStr,
            remark: rec.remark,
          }),
        );
      }
    }

    // ---------- 知识库文档（含向量化） ----------
    const adminUser = await this.userRepo.findOne({
      where: { enterpriseId: entId, username: DEMO_ENTERPRISE.admin_username },
    });
    for (const d of DEMO_DOCS) {
      const doc = await this.docRepo.save(
        this.docRepo.create({
          enterpriseId: entId,
          category: d.category,
          title: d.title,
          fileName: d.fileName,
          filePath: '',
          fileSize: Buffer.byteLength(d.content, 'utf8'),
          content: d.content,
          summary: d.content.replace(/\s+/g, ' ').slice(0, 80),
          tagList: '',
          permScope: d.permScope,
          permTargets: '',
          vectorStatus: 0,
          chunkCount: 0,
          createdBy: Number(adminUser?.id || 0),
        }),
      );
      try {
        await this.ai.embedDocument({
          enterpriseId: entId,
          docId: Number(doc.id),
          content: d.content,
        });
      } catch (e: any) {
        this.logger.warn(`文档《${d.title}》向量化失败：${e.message}`);
      }
    }

    this.logger.log(
      `演示数据写入完成：员工 ${DEMO_USERS.length} 人、客户 ${DEMO_CUSTOMERS.length} 个、` +
        `产品 ${DEMO_PRODUCTS.length} 项、订单 ${DEMO_ORDERS.length} 笔、知识库文档 ${DEMO_DOCS.length} 份`,
    );
  }
}
