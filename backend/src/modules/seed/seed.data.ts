/**
 * 演示种子数据
 * 单独抽出，方便企业按行业替换，不污染业务逻辑
 *
 * 场景设定：晋江本地鞋材制造企业，覆盖 销售 -> 订单 -> 库存 -> 合伙人分账 全链路
 */

export const DEMO_ENTERPRISE = {
  name: '晋江华祥鞋材科技有限公司',
  short_name: '华祥鞋材',
  industry: '鞋材制造 / 工贸',
  contact_person: '陈志远',
  contact_phone: '13859566001',
  admin_username: 'admin',
  admin_password: '123456',
};

export const DEMO_DEPTS = [
  { name: '销售部', sort: 1 },
  { name: '生产部', sort: 2 },
  { name: '供应链部', sort: 3 },
];

export const DEMO_USERS = [
  {
    username: 'sales01',
    realName: '林晓东',
    phone: '13859566011',
    post: '销售主管',
    dept: '销售部',
    role: 'dept_admin',
    isPartner: 0,
  },
  {
    username: 'sales02',
    realName: '王雅琳',
    phone: '13859566012',
    post: '销售专员',
    dept: '销售部',
    role: 'staff',
    isPartner: 0,
  },
  {
    username: 'partner01',
    realName: '苏文彬',
    phone: '13859566021',
    post: '区域合伙人',
    dept: '销售部',
    role: 'partner',
    isPartner: 1,
  },
  {
    username: 'stock01',
    realName: '洪建国',
    phone: '13859566031',
    post: '仓储主管',
    dept: '供应链部',
    role: 'staff',
    isPartner: 0,
  },
];

export const DEMO_PRODUCTS = [
  {
    productCode: 'EVA-3820',
    productName: 'EVA 高回弹中底料',
    spec: '密度0.18 / 厚度10mm',
    unit: '片',
    price: 12.5,
    costPrice: 7.8,
    stockNum: 4200,
    warnStock: 800,
  },
  {
    productCode: 'RB-1105',
    productName: '耐磨橡胶大底',
    spec: '35-44码通用 / 黑',
    unit: '双',
    price: 18.0,
    costPrice: 11.2,
    stockNum: 620,
    warnStock: 800,
  },
  {
    productCode: 'FK-2201',
    productName: '飞织一体鞋面',
    spec: '3D立体飞织 / 灰白',
    unit: '双',
    price: 26.0,
    costPrice: 16.5,
    stockNum: 1500,
    warnStock: 400,
  },
  {
    productCode: 'GL-0808',
    productName: '鞋用环保热熔胶',
    spec: '25kg / 桶',
    unit: '桶',
    price: 480.0,
    costPrice: 342.0,
    stockNum: 96,
    warnStock: 30,
  },
  {
    productCode: 'IN-5501',
    productName: '成型透气鞋垫',
    spec: '记忆棉 / 全码',
    unit: '双',
    price: 6.8,
    costPrice: 3.9,
    stockNum: 180,
    warnStock: 500,
  },
];

export const DEMO_CUSTOMERS = [
  {
    companyName: '泉州安踏供应链服务有限公司',
    customerName: '张海鹏',
    phone: '13905958801',
    remark: '年采购量大，关注交期稳定性与批次一致性，已索取 EVA 中底料报价。',
    tags: '大客户,品牌方,月结60天',
    grade: 'A',
    intentionScore: 88,
    owner: 'sales01',
    followDays: 1,
  },
  {
    companyName: '晋江鸿星运动用品有限公司',
    customerName: '许志斌',
    phone: '13905958802',
    remark: '正在对比三家供应商，要求先打样，样品合格后再谈价格。',
    tags: '打样中,价格敏感',
    grade: 'B',
    intentionScore: 72,
    owner: 'sales01',
    followDays: 3,
  },
  {
    companyName: '莆田市天成鞋业有限公司',
    customerName: '李金田',
    phone: '13905958803',
    remark: '外贸单为主，需要环保检测报告，对热熔胶环保等级要求高。',
    tags: '外贸,环保要求',
    grade: 'B',
    intentionScore: 66,
    owner: 'sales02',
    followDays: 5,
  },
  {
    companyName: '广州鞋汇贸易有限公司',
    customerName: '周敏',
    phone: '13905958804',
    remark: '首次接触，说再看看，暂时没有明确采购计划。',
    tags: '待培育',
    grade: 'C',
    intentionScore: 41,
    owner: 'sales02',
    followDays: 12,
  },
  {
    companyName: '温州瓯海鞋材批发行',
    customerName: '陈立文',
    phone: '13905958805',
    remark: '两年前有过合作，后续断联，本次重新触达。',
    tags: '老客户,沉睡',
    grade: 'D',
    intentionScore: 25,
    owner: 'sales01',
    followDays: 26,
  },
  {
    companyName: '成都西部鞋都商贸有限公司',
    customerName: '罗永强',
    phone: '13905958806',
    remark: '公海客户，来源展会名片，尚未分配销售。',
    tags: '展会线索',
    grade: 'C',
    intentionScore: 35,
    owner: '',
    followDays: 0,
    isPublic: 1,
  },
];

export const DEMO_FOLLOWS = [
  {
    customer: '张海鹏',
    user: 'sales01',
    followType: '电话',
    content: '电话沟通 EVA-3820 报价，客户认可品质，要求给到月结60天账期，并确认春季订单交期能否压到12天。',
    daysAgo: 1,
    nextDays: 2,
  },
  {
    customer: '张海鹏',
    user: 'sales01',
    followType: '拜访',
    content: '到客户工厂面访，参观产线，客户提出需要提供三个批次的密度检测数据作为入库依据。',
    daysAgo: 6,
    nextDays: 0,
  },
  {
    customer: '许志斌',
    user: 'sales01',
    followType: '微信',
    content: '客户确认打样规格：飞织鞋面灰白配色，寄样地址已提供，要求三个工作日内出货。',
    daysAgo: 3,
    nextDays: 3,
  },
  {
    customer: '李金田',
    user: 'sales02',
    followType: '电话',
    content: '客户询问热熔胶是否有 REACH 环保检测报告，已答复会安排质检部出具。',
    daysAgo: 5,
    nextDays: 2,
  },
  {
    customer: '周敏',
    user: 'sales02',
    followType: '电话',
    content: '客户说再看看，暂时没有采购计划，未拒绝后续联系。',
    daysAgo: 12,
    nextDays: 0,
  },
];

export const DEMO_DOCS = [
  {
    category: 'system',
    title: '员工考勤与请假管理制度',
    fileName: '员工考勤与请假管理制度.txt',
    permScope: 'all',
    content: `第一章 总则
第一条 为规范公司考勤管理，保障生产经营秩序，结合公司实际情况制定本制度。本制度适用于公司全体在职员工，含试用期员工与劳务派遣人员。

第二章 工作时间
第二条 生产岗实行两班制：白班 08:00-17:00，中班 17:00-次日 02:00，中间休息一小时。
第三条 行政与销售岗实行标准工时制：周一至周六 08:30-18:00，午休 12:00-13:30。
第四条 因订单交期需要加班的，由部门负责人提前一个工作日提交加班申请，经生产总监审批后执行，加班时长计入调休或按规定支付加班费。

第三章 请假规定
第五条 事假：需提前一个工作日提交申请。请假半天以内由部门负责人审批；一天至三天由分管副总审批；三天以上报总经理审批。事假期间不计发当日工资。
第六条 病假：须提供二级以上医院开具的病假证明，连续病假超过三天的须提交完整病历。病假期间按当地最低工资标准的百分之八十计发。
第七条 年休假：员工累计工作满一年不满十年的，年休假五天；满十年不满二十年的，年休假十天；满二十年的，年休假十五天。年休假原则上当年清零，不跨年结转。
第八条 婚假三天，符合晚婚条件的另加七天；产假按国家规定执行，陪产假十五天；丧假直系亲属三天。

第四章 考勤异常处理
第九条 迟到或早退三十分钟以内的，每次扣款五十元；超过三十分钟不足两小时的，按半天事假处理；超过两小时的，按旷工半天处理。
第十条 未履行请假手续擅自离岗的按旷工处理，旷工一天扣发三天工资；连续旷工三天或全年累计旷工七天的，公司有权解除劳动合同。
第十一条 忘打卡每月可申请补卡两次，需部门负责人签字确认，超出部分按迟到处理。

第五章 附则
第十二条 本制度由人力资源部负责解释，自发布之日起施行。`,
  },
  {
    category: 'product',
    title: 'EVA 高回弹中底料产品技术说明书',
    fileName: 'EVA高回弹中底料产品说明书.txt',
    permScope: 'all',
    content: `产品名称：EVA 高回弹中底料
产品编号：EVA-3820
适用范围：运动鞋、休闲鞋、跑鞋中底，亦可用于鞋垫夹层。

一、技术参数
密度：0.18 g/cm³（可按客户需求在 0.15-0.25 区间定制）
硬度：邵氏 C 型 45±3 度
回弹率：不低于 55%
拉伸强度：≥ 2.5 MPa
撕裂强度：≥ 8 kN/m
压缩永久变形：≤ 35%（50℃ × 6h）
常规厚度：8mm / 10mm / 12mm，可按图纸开模。

二、产品优势
1. 采用超临界发泡工艺，泡孔均匀细密，同等密度下回弹优于常规注射发泡产品约百分之十五。
2. 批次密度波动控制在正负 0.005 以内，适合品牌方大货生产的一致性要求。
3. 材料不含邻苯二甲酸酯、偶氮染料，通过 REACH 与 RoHS 检测。
4. 耐黄变等级达到灰卡四级，白色中底长期存放不易发黄。

三、加工建议
成型温度建议控制在 165-175℃，模压时间 480-600 秒，冷却定型不少于 300 秒。与橡胶大底贴合时建议使用水性环保胶，处理剂需与 EVA 面层匹配，粘接强度可达 35 N/cm 以上。

四、包装与交期
标准包装：每片独立叠放，每箱 200 片，纸箱外尺寸 1000×600×500mm。
常规交期：现货规格三个工作日内发货；定制密度或定制厚度需开模，交期 12-15 个工作日。
最小起订量：定制规格 3000 片，常规规格 500 片起订。

五、质保与售后
质保期自交货之日起十二个月。如出现密度不达标、开裂、异常黄变等质量问题，经双方确认后可换货或退货，运费由责任方承担。`,
  },
  {
    category: 'script',
    title: '新客户首次拜访开场话术手册',
    fileName: '新客户首访开场话术手册.txt',
    permScope: 'all',
    content: `一、电话首次触达（目标：拿到见面机会，不谈价格）
开场：您好，请问是 X 总吗？我是晋江华祥鞋材的小林。冒昧打扰您一分钟，我们专门做 EVA 中底和飞织鞋面，安踏、鸿星的部分线在用我们的料。我今天打给您不是推销，是想请教一下贵司现在中底这块主要卡在哪个环节，是密度稳定性还是交期？
要点：三十秒内说清「我是谁、做什么、谁在用、为什么找你」，把提问权交回客户。

二、客户说"我们已经有供应商了"
应对：那正常，做到您这个规模肯定有稳定供应商。我不是来抢单的，只是想做您的第二供应商。您现在这家如果哪天交期爆了或者密度批次不稳，您至少手上有个备选，不至于停线。我给您寄一份样品您放着，不用马上给我答复。
要点：降低对方决策压力，用「备胎」定位切入，先进入名单再谈份额。

三、客户说"你们价格多少"
应对：价格我肯定给您一个有诚意的数，但报价前我想先确认三件事：您要的密度、月用量、还有账期。因为这三个变量一变价格差得挺远，我不想随口报一个数把您误导了。您方便说一下大概的月用量吗？
要点：不在信息不完整时报价，把价格谈判转成需求确认。

四、客户说"太贵了"
应对：我理解，单价看确实比市面上低密度的料高。不过您可以算一笔账：我们的批次密度波动在正负 0.005 以内，您那边成型不良率能降下来。按您月产十万双算，不良率降一个点，省下来的成本比这个差价高。要不我按您现在的用量帮您算一版成本对比表？
要点：把单价之争拉到总成本之争，用客户自己的数据说话。

五、面访结束前的收尾
话术：X 总，今天占用您时间了。我回去做两件事：一是把您说的三个批次检测数据整理好发您，二是安排样品这周内寄到。下周三我再跟您电话确认一下样品情况，您看方便吗？
要点：每次沟通结束必须留下一个明确的下一步动作和时间点，不留开放式结尾。`,
  },
];

export const DEMO_ORDERS = [
  {
    customer: '张海鹏',
    owner: 'sales01',
    status: '生产中',
    deliveryDaysLater: 9,
    remark: '春季新款首批订单，客户要求分两批交付。',
    items: [
      { code: 'EVA-3820', num: 3000, price: 12.5 },
      { code: 'IN-5501', num: 3000, price: 6.8 },
    ],
  },
  {
    customer: '许志斌',
    owner: 'sales01',
    status: '待审核',
    deliveryDaysLater: 2,
    remark: '打样确认后的小批量试单，交期偏紧。',
    items: [{ code: 'FK-2201', num: 800, price: 26.0 }],
  },
];
