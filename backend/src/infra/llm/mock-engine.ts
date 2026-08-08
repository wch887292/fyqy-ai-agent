/**
 * 规则化降级引擎（Mock Engine）
 *
 * 设计意图：
 *   OpenClaw 私有化大模型未接入 / 网络不通 / 密钥失效 时，系统不能瘫痪。
 *   本引擎基于真实业务数据做规则化生成，保证：
 *     1. 全流程演示可跑通，客户现场不会白屏
 *     2. 输出内容基于企业真实数据，不是假字符串
 *     3. 一旦配置 OpenClaw，自动切换为大模型输出，业务代码零改动
 *
 * 注意：这是「兜底」不是「替代」。真实交付必须接入 OpenClaw 才有完整 AI 能力。
 */
export type LlmScene =
  | 'chat'
  | 'kb_qa'
  | 'doc_tag'
  | 'customer_intention'
  | 'follow_suggest'
  | 'daily_report'
  | 'biz_daily'
  | 'stock_advice'
  | 'order_warn'
  | 'extract'
  | 'risk_advice';

const pick = <T>(arr: T[], seed: number): T => arr[Math.abs(seed) % arr.length];

export class MockEngine {
  static run(scene: LlmScene, payload: any = {}): string {
    switch (scene) {
      case 'kb_qa':
        return this.kbQa(payload);
      case 'doc_tag':
        return this.docTag(payload);
      case 'customer_intention':
        return this.customerIntention(payload);
      case 'follow_suggest':
        return this.followSuggest(payload);
      case 'daily_report':
        return this.dailyReport(payload);
      case 'biz_daily':
        return this.bizDaily(payload);
      case 'stock_advice':
        return this.stockAdvice(payload);
      case 'order_warn':
        return this.orderWarn(payload);
      case 'extract':
        return this.extract(payload);
      case 'risk_advice':
        return this.riskAdvice(payload);
      default:
        return this.chat(payload);
    }
  }

  /** 通用对话 */
  private static chat(p: any): string {
    const q = p.question || '';
    if (!q.trim()) return '请描述您的问题，我会结合企业知识库为您解答。';
    return [
      `关于「${q}」，当前企业知识库中未检索到直接匹配的资料。`,
      '',
      '建议您：',
      '1. 在【AI知识库】上传相关制度或产品文档后重新提问，我可以基于企业真实资料回答；',
      '2. 若需要完整的大模型推理能力，请在【系统设置 - 大模型参数配置】填入 OpenClaw 接口地址与密钥。',
      '',
      '（当前运行于规则引擎兜底模式，未接入大模型）',
    ].join('\n');
  }

  /** 知识库问答：基于检索到的真实片段做摘录式回答 */
  private static kbQa(p: any): string {
    const refs: Array<{ title: string; snippet: string }> = p.refs || [];
    const q = p.question || '';
    if (!refs.length) {
      return `企业知识库中暂未收录与「${q}」相关的资料。\n\n建议补充方向：可将相关制度文件、产品说明或话术手册上传至知识库对应分类，上传后即可被检索问答。`;
    }
    const lines = refs
      .slice(0, 3)
      .map((r, i) => `${i + 1}. 依据《${r.title}》：${(r.snippet || '').replace(/\s+/g, ' ').slice(0, 160)}`);
    return [
      `根据企业知识库中的 ${refs.length} 份相关资料，关于「${q}」整理如下：`,
      '',
      ...lines,
      '',
      `以上内容摘自企业内部资料，如需更精准的归纳与推理，请接入 OpenClaw 大模型。`,
    ].join('\n');
  }

  /** 文档标签与摘要：基于词频提取 */
  private static docTag(p: any): string {
    const title: string = p.title || '';
    const content: string = (p.content || '').slice(0, 3000);
    const stop = new Set(['公司', '我们', '进行', '这个', '可以', '相关', '以及', '通过', '一个', '如果', '为了']);
    const freq = new Map<string, number>();
    const text = (title + ' ' + content).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, ' ');
    for (const seg of text.split(/\s+/)) {
      for (let i = 0; i + 2 <= seg.length; i++) {
        const w = seg.slice(i, i + 2);
        if (!/[\u4e00-\u9fa5]{2}/.test(w) || stop.has(w)) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
    const tags = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w]) => w);
    if (!tags.length) tags.push('企业资料');
    const summary = content.replace(/\s+/g, ' ').slice(0, 80) || title;
    return JSON.stringify({ tags, summary });
  }

  /** 客户意向打分：基于跟进频次、沟通内容关键词、时间衰减 */
  private static customerIntention(p: any): string {
    const followCount: number = p.followCount || 0;
    const daysSinceLast: number = p.daysSinceLastFollow ?? 999;
    const text: string = (p.text || '').toString();

    let score = 30;
    score += Math.min(followCount * 8, 32); // 跟进越勤，意向越明确
    if (daysSinceLast <= 3) score += 15;
    else if (daysSinceLast <= 7) score += 8;
    else if (daysSinceLast > 30) score -= 18;

    const hot = ['报价', '价格', '下单', '合同', '样品', '打样', '交期', '账期', '签约', '付款', '数量', '急'];
    const cold = ['再看看', '考虑', '不需要', '暂时', '以后再说', '太贵', '没预算'];
    const hits = hot.filter((k) => text.includes(k)).length;
    const colds = cold.filter((k) => text.includes(k)).length;
    score += hits * 6 - colds * 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 30 ? 'C' : 'D';
    const reasonParts: string[] = [];
    reasonParts.push(`累计跟进${followCount}次`);
    if (followCount === 0) reasonParts.push('尚无有效跟进记录');
    else if (daysSinceLast <= 7) reasonParts.push(`最近${daysSinceLast}天内有联系`);
    else if (daysSinceLast < 900) reasonParts.push(`距上次联系已${daysSinceLast}天`);
    if (hits) reasonParts.push(`沟通中出现${hits}个成交信号词`);
    if (colds) reasonParts.push(`存在${colds}处推脱表述`);

    return JSON.stringify({ score, grade, reason: reasonParts.join('，') });
  }

  /** 跟进建议 */
  private static followSuggest(p: any): string {
    const type: string = p.followType || '电话';
    const custName: string = p.customerName || '客户';
    const content: string = p.content || '';
    const seed = content.length + custName.length;

    if (content.includes('报价') || content.includes('价格')) {
      return [
        '建议动作：48小时内送达正式报价单，并约定一次当面或视频过方案的时间。',
        '',
        `参考话术：${custName}您好，报价单我已按您说的规格整理好发您邮箱了。价格这块我给您争取到的是我们这个量级能做的方案，具体明细我想花十分钟当面跟您过一遍，您看是明天上午还是下午方便？`,
      ].join('\n');
    }
    if (content.includes('样品') || content.includes('打样')) {
      return [
        '建议动作：确认打样规格与寄送地址，明确样品到货时间并主动回访确认。',
        '',
        `参考话术：${custName}您好，样品这边我已经安排下去了，预计三个工作日出货。到货后我再跟您电话确认下手感和规格，如果有需要调整的地方我们马上改。`,
      ].join('\n');
    }
    if (content.includes('考虑') || content.includes('再看看')) {
      return [
        '建议动作：不逼单，改为提供决策materials，一周后以行业信息为由自然触达。',
        '',
        `参考话术：${custName}您好，不打扰您太久。我这边整理了两个同行业客户的合作案例发您参考，您有需要随时找我。下周我们有批新到的货，到时候给您同步一下。`,
      ].join('\n');
    }
    return [
      `建议动作：本次为${type}沟通，建议 3 天内做一次轻度触达，保持温度并推进到下一环节。`,
      '',
      `参考话术：${custName}您好，上次沟通的事我这边跟进了一下，${pick(['有个新情况想同步给您', '有些新的信息可以给您参考', '这边有了新的进展'], seed)}。您这边最近方便的时候我详细跟您说下。`,
    ].join('\n');
  }

  /** 销售日报 */
  private static dailyReport(p: any): string {
    const d = p.data || {};
    const call = d.callCnt || 0;
    const wx = d.wechatAddCnt || 0;
    const intent = d.intentionCustCnt || 0;
    const visit = d.visitCnt || 0;
    const follows: any[] = p.follows || [];
    const names = [...new Set(follows.map((f) => f.customerName).filter(Boolean))].slice(0, 3);
    const total = call + wx + intent + visit;

    const achievement =
      total === 0
        ? '今日暂无有效外呼与拜访记录，需要复盘时间分配。'
        : `今日完成电话外呼 ${call} 通，新增微信好友 ${wx} 位，新增意向客户 ${intent} 个，约见/拜访 ${visit} 次。` +
          (names.length ? `重点跟进客户：${names.join('、')}。` : '');

    let exp: string;
    if (intent >= 2) exp = '今天意向客户转化不错，说明当前的开场切入点是有效的，明天继续用同样的话术结构打。';
    else if (call >= 10 && intent === 0) exp = '今天量做上去了但没转化，问题大概率出在开场三十秒没抓住痛点，明天要换切入角度。';
    else if (visit > 0) exp = '面访的沟通深度明显比电话强，客户的真实顾虑当面才问得出来，后面要多争取见面机会。';
    else exp = '今天整体节奏偏慢，客户触达量不够，明天要把上午的时间全部留给外呼。';

    const plan: string[] = [];
    if (names.length) plan.push(`1. 重点跟进 ${names[0]}，推进到报价或样品环节`);
    else plan.push('1. 上午集中外呼不少于 15 通，优先打三天内未联系的客户');
    plan.push(`2. 新增意向客户目标 ${Math.max(intent + 1, 2)} 个，并当天录入系统`);
    plan.push('3. 整理今日未接通客户名单，安排二次触达时间');

    return ['【今日成果】', achievement, '', '【心得体会】', exp, '', '【明日计划】', ...plan].join('\n');
  }

  /** 经营日报 */
  private static bizDaily(p: any): string {
    // 兼容两种入参形态：{ data: {...} }（工作台）与扁平对象（ERP 经营日报）
    const d = p?.data || p || {};
    const orderCnt = Number(d.orderCnt ?? d.order_count ?? 0);
    const amount = Number(d.amount ?? d.order_amount ?? 0);
    const newCust = Number(d.newCustomer ?? d.newCust ?? d.new_customer ?? 0);
    const warnCnt = Number(d.stockWarnCnt ?? d.warnCnt ?? d.stock_warn_count ?? 0);
    const abnormal = Number(d.abnormalOrderCnt ?? d.abnormalCnt ?? 0);
    const doneCnt = Number(d.doneCnt ?? d.done_count ?? 0);
    const cancelCnt = Number(d.cancelCnt ?? d.cancel_count ?? 0);

    const lines: string[] = [];
    lines.push(
      orderCnt > 0
        ? `今日新增订单 ${orderCnt} 笔，合计金额 ¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}，新增客户 ${newCust} 个。`
        : `今日暂无新增订单，新增客户 ${newCust} 个，需关注前端获客节奏。`,
    );

    if (doneCnt > 0 || cancelCnt > 0) {
      lines.push(`其中已完成 ${doneCnt} 单，已取消 ${cancelCnt} 单。`);
    }

    const risks: string[] = [];
    if (warnCnt > 0) risks.push(`${warnCnt} 个产品库存已低于预警线`);
    if (abnormal > 0) risks.push(`${abnormal} 笔订单存在状态停滞风险`);
    if (cancelCnt > 0) risks.push(`${cancelCnt} 笔订单被取消，需复盘原因`);
    lines.push(risks.length ? `风险提示：${risks.join('；')}。` : '风险提示：今日未发现库存与订单异常。');

    if (warnCnt > 0) lines.push('建议：优先处理缺货产品的补货申请，避免影响在手订单交付。');
    else if (orderCnt === 0) lines.push('建议：安排销售团队对高意向客户做一轮集中促单。');
    else lines.push('建议：保持当前节奏，重点盯紧生产中订单的交期节点。');

    return lines.join('\n');
  }

  /** 库存补货建议 */
  private static stockAdvice(p: any): string {
    const name = p.productName || '该产品';
    const stock = p.stockNum ?? 0;
    const warn = p.warnStock ?? 0;
    const gap = Math.max(warn - stock, 0);
    const suggestLow = Math.max(gap + Math.ceil(warn * 0.5), 10);
    const suggestHigh = suggestLow * 2;
    return `${name}当前库存 ${stock}，已低于预警库存 ${warn}，缺口 ${gap}。建议本次补货 ${suggestLow}~${suggestHigh}，并核对在手订单占用量，避免超卖。`;
  }

  /** 订单异常研判 */
  private static orderWarn(p: any): string {
    const amount = Number(p.totalAmount || 0);
    const days = p.deliveryDays;
    const risks: string[] = [];
    if (typeof days === 'number' && days >= 0 && days <= 3) risks.push(`交期仅剩 ${days} 天，排产压力大`);
    if (typeof days === 'number' && days < 0) risks.push('交期已过期');
    if (amount <= 0) risks.push('订单金额为 0，请核对明细');
    if (amount >= 500000) risks.push('订单金额较大，建议确认客户账期与预付款');
    if (p.stockShort) risks.push('关联产品库存不足，存在无法按期交付风险');
    if (!risks.length) return '未发现明显异常';
    return `风险提示：${risks.join('；')}。建议立即与客户确认交期与付款安排，并同步生产排期。`;
  }

  /** 信息抽取：正则兜底 */
  private static extract(p: any): string {
    const text: string = p.text || '';
    const phone = (text.match(/1[3-9]\d{9}/) || [''])[0];
    const company = (text.match(/[\u4e00-\u9fa5A-Za-z0-9（）()]{2,30}?(有限公司|公司|厂|商行|工作室|集团)/) || [''])[0];
    let name = '';
    const nameMatch = text.match(/([\u4e00-\u9fa5]{1,3})(总|经理|老板|先生|女士|工)/);
    if (nameMatch) name = nameMatch[0];
    const intention = /报价|下单|合同|样品|采购|需要/.test(text) ? '有采购意向' : '';
    return JSON.stringify({
      company_name: company,
      customer_name: name,
      phone,
      intention,
      remark: text.replace(/\s+/g, ' ').slice(0, 100),
    });
  }

  /** 风险处置建议 */
  private static riskAdvice(p: any): string {
    const type = p.riskType;
    if (type === 'follow_overdue') return `客户已超过 ${p.days || 7} 天未跟进，建议今日内完成一次电话触达，避免流失到竞对。`;
    if (type === 'order_abnormal') return '订单状态长时间停滞，建议核实生产进度与客户确认情况，必要时升级处理。';
    if (type === 'stock_warn') return '库存已触发预警，建议立即发起采购或生产补货，优先保障在手订单。';
    return '建议尽快核实该风险点并指定责任人跟进处理。';
  }
}
