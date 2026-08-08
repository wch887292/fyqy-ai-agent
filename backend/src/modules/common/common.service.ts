import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import {
  CrmCustomer,
  ErpOrder,
  ErpOrderItem,
  ProdWorkOrder,
  SysUser,
} from '../../entities';
import { AuthUser } from '../../common/auth';
import { applyScope, parsePage } from '../../common/scope';
import { OrgService } from '../org/org.service';
import { KbService } from '../kb/kb.service';

/** 一次导入的最大行数，防止误传超大文件拖垮单进程 */
const MAX_IMPORT_ROWS = 5000;
/** 一次导出的最大行数 */
const MAX_EXPORT_ROWS = 20000;

/** 表头别名映射：Excel 里各种写法 -> 统一字段键 */
type FieldDef = { key: string; aliases: string[]; required?: boolean };

const CUSTOMER_FIELDS: FieldDef[] = [
  { key: 'customerName', aliases: ['客户姓名', '客户名称', '姓名', '联系人', 'customer_name', 'customerName'], required: true },
  { key: 'companyName', aliases: ['公司名称', '企业名称', '单位', 'company_name', 'companyName'] },
  { key: 'phone', aliases: ['联系电话', '手机号', '电话', '手机', 'phone', 'mobile'] },
  { key: 'grade', aliases: ['客户等级', '等级', 'grade'] },
  { key: 'tags', aliases: ['客户标签', '标签', 'tags'] },
  { key: 'remark', aliases: ['备注', '说明', 'remark'] },
  { key: 'ownerUserName', aliases: ['归属人', '归属员工', '负责人', 'owner', 'owner_user_name'] },
];

const GRADES = ['A', 'B', 'C', 'D'];

/**
 * V2.0 批量导入导出服务
 *
 * 设计取舍：
 *   1. 导出统一返回 { file_name, file_base64 }，走平台统一响应体 { code, msg, data }，
 *      前端用 base64 -> Blob 下载。这样不必为二进制流破例绕过全局响应拦截器，
 *      也天然带上业务错误提示（如无权限时返回 403 而不是下载一个坏文件）。
 *   2. 导入同时兼容 multipart/form-data（file 字段）与 JSON（file_base64 字段），
 *      前者对齐接口文档，后者方便脚本与冒烟测试直接调用。
 *   3. 全部查询强制 enterprise_id 过滤 + 数据权限 applyScope，导出不会越权拿到别人的数据。
 */
@Injectable()
export class CommonService {
  private readonly logger = new Logger('CommonService');

  constructor(
    @InjectRepository(CrmCustomer) private readonly custRepo: Repository<CrmCustomer>,
    @InjectRepository(ErpOrder) private readonly orderRepo: Repository<ErpOrder>,
    @InjectRepository(ErpOrderItem) private readonly itemRepo: Repository<ErpOrderItem>,
    @InjectRepository(ProdWorkOrder) private readonly woRepo: Repository<ProdWorkOrder>,
    @InjectRepository(SysUser) private readonly userRepo: Repository<SysUser>,
    private readonly org: OrgService,
    private readonly kb: KbService,
  ) {}

  // ==================== 公共工具 ====================

  private async scopeUserIds(entId: number, user: AuthUser): Promise<number[]> {
    if (user.isSuper || user.dataScope >= 3) return [];
    if (user.dataScope === 2) return this.org.deptUserIds(entId, user.deptId);
    return [user.userId];
  }

  /** 取出上传文件的二进制内容：multipart 优先，其次 base64 */
  private pickBuffer(file: any, body: any): { buf: Buffer; fileName: string } {
    if (file?.buffer?.length) {
      return { buf: file.buffer, fileName: file.originalname || 'upload.xlsx' };
    }
    const b64: string = (body?.file_base64 ?? body?.fileBase64 ?? '').replace(
      /^data:.*?;base64,/,
      '',
    );
    if (!b64) throw new BadRequestException('请上传 Excel 文件');
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) throw new BadRequestException('文件内容为空');
    return { buf, fileName: body?.file_name ?? body?.fileName ?? 'upload.xlsx' };
  }

  /** 解析 Excel 第一个 sheet 为对象数组（表头为 key） */
  private readSheet(buf: Buffer): Record<string, any>[] {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    } catch (e: any) {
      throw new BadRequestException(`Excel 解析失败：${e?.message || '文件格式不正确'}`);
    }
    const name = wb.SheetNames[0];
    if (!name) throw new BadRequestException('Excel 中没有任何工作表');
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[name], {
      defval: '',
      raw: false,
    });
    if (!rows.length) throw new BadRequestException('Excel 中没有数据行（第一行需为表头）');
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`单次导入不能超过 ${MAX_IMPORT_ROWS} 行，请拆分后再导入`);
    }
    return rows;
  }

  /** 按别名把一行 Excel 映射成标准字段对象 */
  private mapRow(row: Record<string, any>, defs: FieldDef[]): Record<string, string> {
    const norm = (s: string) => String(s || '').replace(/\s|\*|＊|:|：/g, '').toLowerCase();
    const bucket: Record<string, string> = {};
    const entries = Object.entries(row).map(([k, v]) => [norm(k), v] as [string, any]);
    for (const def of defs) {
      const hit = entries.find(([k]) => def.aliases.some((a) => norm(a) === k));
      bucket[def.key] = hit ? String(hit[1] ?? '').trim() : '';
    }
    return bucket;
  }

  /** 生成 xlsx Buffer */
  private buildXlsx(sheetName: string, header: string[], rows: any[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(10, Math.min(40, h.length * 2 + 6)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** 统一导出返回体 */
  private fileResult(fileNamePrefix: string, buf: Buffer, total: number) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
    return {
      file_name: `${fileNamePrefix}_${stamp}.xlsx`,
      file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_base64: buf.toString('base64'),
      total,
    };
  }

  private fmtTime(v: any): string {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ==================== 客户导入 ====================

  /** 下载客户导入模板 */
  customerTemplate() {
    const header = ['客户姓名*', '公司名称', '联系电话', '客户等级', '客户标签', '备注', '归属人'];
    const demo = [
      ['张三', '晋江市某某贸易有限公司', '13800000001', 'A', '意向强,老客户转介', '来自展会名片', ''],
      ['李四', '泉州某某鞋业', '13800000002', 'B', '价格敏感', '需二次报价', ''],
    ];
    const buf = this.buildXlsx('客户导入模板', header, demo);
    return this.fileResult('客户导入模板', buf, demo.length);
  }

  /**
   * CRM 客户 Excel 批量导入
   * 规则：
   *   - 客户姓名必填；
   *   - 手机号在本企业内已存在则跳过（幂等，可重复导入不产生脏数据）；
   *   - 归属人可写员工姓名，匹配不到则归属为导入人本人；
   *   - 单行失败不影响整体，逐行返回失败原因。
   */
  async importCustomer(entId: number, user: AuthUser, file: any, body: any) {
    const { buf } = this.pickBuffer(file, body);
    const rows = this.readSheet(buf);

    // 预载本企业用户，用于「归属人姓名 -> userId」匹配
    const users = await this.userRepo.find({
      where: { enterpriseId: entId },
      select: ['id', 'realName', 'deptId'] as any,
    });
    const userByName = new Map<string, SysUser>();
    users.forEach((u) => userByName.set(String(u.realName || '').trim(), u));

    // 预载已有手机号，做去重
    const existed = await this.custRepo.find({
      where: { enterpriseId: entId },
      select: ['id', 'phone'] as any,
    });
    const phoneSet = new Set(existed.map((c) => String(c.phone || '').trim()).filter(Boolean));

    const errors: { row: number; msg: string }[] = [];
    const toInsert: CrmCustomer[] = [];
    let skipped = 0;

    rows.forEach((raw, idx) => {
      const rowNo = idx + 2; // Excel 行号（含表头）
      const r = this.mapRow(raw, CUSTOMER_FIELDS);

      if (!r.customerName) {
        errors.push({ row: rowNo, msg: '客户姓名为空' });
        return;
      }
      const phone = r.phone.replace(/[\s-]/g, '');
      if (phone && !/^[0-9+()（）-]{5,20}$/.test(phone)) {
        errors.push({ row: rowNo, msg: `联系电话格式不正确：${r.phone}` });
        return;
      }
      if (phone && phoneSet.has(phone)) {
        skipped++;
        return;
      }
      const grade = GRADES.includes(r.grade.toUpperCase()) ? r.grade.toUpperCase() : 'C';
      const owner = r.ownerUserName ? userByName.get(r.ownerUserName) : undefined;

      if (phone) phoneSet.add(phone);
      toInsert.push(
        this.custRepo.create({
          enterpriseId: entId,
          customerName: r.customerName.slice(0, 128),
          companyName: r.companyName.slice(0, 255),
          phone: phone.slice(0, 32),
          tags: r.tags.replace(/[、；;|]/g, ',').slice(0, 512),
          remark: r.remark,
          grade,
          intentionScore: 0,
          ownerUserId: owner ? Number(owner.id) : user.userId,
          deptId: owner ? Number(owner.deptId || 0) : user.deptId,
          isPublic: 0,
          contactTime: new Date(),
        }),
      );
    });

    if (toInsert.length) {
      // 分批落库，SQLite 单条 SQL 变量数有上限
      for (let i = 0; i < toInsert.length; i += 200) {
        await this.custRepo.save(toInsert.slice(i, i + 200));
      }
    }

    this.logger.log(
      `客户导入 ent=${entId} user=${user.userId} 总${rows.length} 成功${toInsert.length} 跳过${skipped} 失败${errors.length}`,
    );

    return {
      total: rows.length,
      success: toInsert.length,
      skipped,
      fail: errors.length,
      errors: errors.slice(0, 100),
      msg: `共 ${rows.length} 行，成功导入 ${toInsert.length} 条，手机号重复跳过 ${skipped} 条，失败 ${errors.length} 条`,
    };
  }

  // ==================== 客户导出 ====================

  async exportCustomer(entId: number, user: AuthUser, query: any) {
    const qb = this.custRepo
      .createQueryBuilder('c')
      .where('c.enterpriseId = :entId', { entId })
      .andWhere('c.isPublic = :pub', { pub: Number(query?.is_public ?? query?.isPublic ?? 0) });

    const kw = String(query?.keyword ?? '').trim();
    if (kw) {
      qb.andWhere(
        '(c.customerName LIKE :kw OR c.companyName LIKE :kw OR c.phone LIKE :kw)',
        { kw: `%${kw}%` },
      );
    }
    const grade = String(query?.grade ?? '').trim();
    if (grade) qb.andWhere('c.grade = :grade', { grade });

    applyScope(qb, user, 'c', 'ownerUserId', await this.scopeUserIds(entId, user));
    const list = await qb.orderBy('c.id', 'DESC').take(MAX_EXPORT_ROWS).getMany();

    const nameMap = await this.userNameMap(entId);
    const header = [
      '客户姓名',
      '公司名称',
      '联系电话',
      '客户等级',
      'AI意向分',
      '客户标签',
      '归属人',
      '最近跟进',
      '下次跟进',
      '备注',
      '创建时间',
    ];
    const rows = list.map((c) => [
      c.customerName,
      c.companyName || '',
      c.phone || '',
      c.grade,
      c.intentionScore ?? 0,
      c.tags || '',
      nameMap.get(Number(c.ownerUserId)) || '',
      this.fmtTime(c.lastFollowTime),
      this.fmtTime(c.nextFollowTime),
      c.remark || '',
      this.fmtTime(c.createdAt),
    ]);
    return this.fileResult('客户列表', this.buildXlsx('客户列表', header, rows), rows.length);
  }

  // ==================== 订单导出 ====================

  async exportOrder(entId: number, user: AuthUser, query: any) {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.enterpriseId = :entId', { entId });

    const kw = String(query?.keyword ?? '').trim();
    if (kw) qb.andWhere('(o.orderNo LIKE :kw OR o.customerName LIKE :kw)', { kw: `%${kw}%` });
    const status = String(query?.order_status ?? query?.orderStatus ?? '').trim();
    if (status) qb.andWhere('o.orderStatus = :status', { status });
    const start = String(query?.start_date ?? query?.startDate ?? '').trim();
    const end = String(query?.end_date ?? query?.endDate ?? '').trim();
    if (start) qb.andWhere('o.createdAt >= :start', { start: `${start} 00:00:00` });
    if (end) qb.andWhere('o.createdAt <= :end', { end: `${end} 23:59:59` });

    applyScope(qb, user, 'o', 'ownerUserId', await this.scopeUserIds(entId, user));
    const list = await qb.orderBy('o.id', 'DESC').take(MAX_EXPORT_ROWS).getMany();

    // 明细：一次查出，按订单聚合成「产品×数量」文本，避免 N+1
    const ids = list.map((o) => Number(o.id));
    const items = ids.length
      ? await this.itemRepo
          .createQueryBuilder('i')
          .where('i.enterpriseId = :entId', { entId })
          .andWhere('i.orderId IN (:...ids)', { ids })
          .getMany()
      : [];
    const itemMap = new Map<number, string[]>();
    items.forEach((it) => {
      const arr = itemMap.get(Number(it.orderId)) || [];
      arr.push(`${it.productName}×${it.num}`);
      itemMap.set(Number(it.orderId), arr);
    });

    const nameMap = await this.userNameMap(entId);
    const header = [
      '订单号',
      '客户名称',
      '订单金额',
      '订单状态',
      '产品明细',
      '交期',
      '归属人',
      'AI预警',
      '备注',
      '创建时间',
    ];
    const rows = list.map((o) => [
      o.orderNo,
      o.customerName || '',
      Number(o.totalAmount || 0),
      o.orderStatus,
      (itemMap.get(Number(o.id)) || []).join('；'),
      o.deliveryDate || '',
      nameMap.get(Number(o.ownerUserId)) || '',
      o.aiWarnMsg || '',
      o.remark || '',
      this.fmtTime(o.createdAt),
    ]);
    return this.fileResult('销售订单', this.buildXlsx('销售订单', header, rows), rows.length);
  }

  // ==================== 生产工单导出 ====================

  async exportWorkorder(entId: number, user: AuthUser, query: any) {
    const qb = this.woRepo.createQueryBuilder('w').where('w.enterpriseId = :entId', { entId });

    const kw = String(query?.keyword ?? '').trim();
    if (kw) qb.andWhere('(w.workNo LIKE :kw OR w.productName LIKE :kw)', { kw: `%${kw}%` });
    const status = String(query?.status ?? '').trim();
    if (status) qb.andWhere('w.status = :status', { status });

    applyScope(qb, user, 'w', 'ownerUserId', await this.scopeUserIds(entId, user));
    const list = await qb.orderBy('w.id', 'DESC').take(MAX_EXPORT_ROWS).getMany();

    // 关联销售订单号
    const orderIds = [...new Set(list.map((w) => Number(w.orderId)).filter(Boolean))];
    const orders = orderIds.length
      ? await this.orderRepo
          .createQueryBuilder('o')
          .where('o.enterpriseId = :entId', { entId })
          .andWhere('o.id IN (:...ids)', { ids: orderIds })
          .getMany()
      : [];
    const orderNoMap = new Map(orders.map((o) => [Number(o.id), o.orderNo]));

    const nameMap = await this.userNameMap(entId);
    const header = [
      '工单号',
      '关联订单',
      '产品名称',
      '生产数量',
      '已完成',
      '完成率',
      '工单状态',
      '计划完工',
      '实际完工',
      'AI生产提示',
      '负责人',
      '创建时间',
    ];
    const rows = list.map((w) => {
      const num = Number(w.produceNum || 0);
      const fin = Number(w.finishNum || 0);
      return [
        w.workNo,
        orderNoMap.get(Number(w.orderId)) || '',
        w.productName || '',
        num,
        fin,
        num > 0 ? `${Math.round((fin / num) * 100)}%` : '0%',
        w.status,
        this.fmtTime(w.planFinishTime),
        this.fmtTime(w.actualFinishTime),
        w.aiTip || '',
        nameMap.get(Number(w.ownerUserId)) || '',
        this.fmtTime(w.createdAt),
      ];
    });
    return this.fileResult('生产工单', this.buildXlsx('生产工单', header, rows), rows.length);
  }

  // ==================== 知识库批量上传 ====================

  /**
   * 知识库批量上传：复用 KbService.upload，逐个解析 + 向量化。
   * 入参兼容两种：
   *   - multipart: files[]
   *   - JSON: { files: [{ file_name, file_base64 }], category }
   */
  async importKb(entId: number, user: AuthUser, files: any[], body: any) {
    const list: { file_name: string; file_base64: string }[] = [];

    if (Array.isArray(files) && files.length) {
      files.forEach((f) =>
        list.push({
          file_name: f.originalname || 'upload',
          file_base64: Buffer.from(f.buffer).toString('base64'),
        }),
      );
    } else if (Array.isArray(body?.files)) {
      body.files.forEach((f: any) =>
        list.push({
          file_name: f.file_name ?? f.fileName ?? '',
          file_base64: (f.file_base64 ?? f.fileBase64 ?? '').replace(/^data:.*?;base64,/, ''),
        }),
      );
    }

    if (!list.length) throw new BadRequestException('请至少选择一个文档');
    if (list.length > 50) throw new BadRequestException('单次最多批量上传 50 个文档');

    const category = body?.category || 'system';
    const ok: any[] = [];
    const errors: { file: string; msg: string }[] = [];

    for (const f of list) {
      try {
        const r = await this.kb.upload(entId, user, {
          file_name: f.file_name,
          file_base64: f.file_base64,
          category,
          perm_scope: body?.perm_scope ?? body?.permScope ?? 'all',
          tag_list: body?.tag_list ?? body?.tagList ?? '',
        });
        ok.push({ file: f.file_name, doc_id: r.doc_id, title: r.title });
      } catch (e: any) {
        errors.push({ file: f.file_name, msg: e?.message || '上传失败' });
      }
    }

    return {
      total: list.length,
      success: ok.length,
      fail: errors.length,
      docs: ok,
      errors,
      msg: `共 ${list.length} 个文档，成功 ${ok.length} 个，失败 ${errors.length} 个`,
    };
  }

  // ==================== 内部 ====================

  private async userNameMap(entId: number): Promise<Map<number, string>> {
    const users = await this.userRepo.find({
      where: { enterpriseId: entId },
      select: ['id', 'realName'] as any,
    });
    return new Map(users.map((u) => [Number(u.id), u.realName]));
  }

  /** 供其它模块复用的分页参数（保持与平台一致） */
  static page(query: any) {
    return parsePage(query);
  }
}
