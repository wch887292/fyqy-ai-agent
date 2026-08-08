<template>
  <div class="page">
    <!-- 企业基础信息 -->
    <div class="page-card">
      <h3 class="page-title">企业配置</h3>
      <p class="page-desc">
        企业主体信息会用于系统登录页、导出报表抬头与 AI 生成内容的落款；同一套系统内所有业务数据均按该企业租户隔离
      </p>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" style="max-width: 640px">
        <el-form-item label="企业全称" prop="name">
          <el-input v-model="form.name" placeholder="与营业执照一致的企业全称" maxlength="60" />
        </el-form-item>
        <el-form-item label="企业简称">
          <el-input v-model="form.shortName" placeholder="用于系统顶栏与报表抬头显示" maxlength="20" />
        </el-form-item>
        <el-form-item label="所属行业">
          <el-select
            v-model="form.industry"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="选择或自定义输入"
            style="width: 100%"
          >
            <el-option v-for="i in industries" :key="i" :label="i" :value="i" />
          </el-select>
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contactPerson" placeholder="企业对接负责人" maxlength="20" />
        </el-form-item>
        <el-form-item label="联系电话" prop="contactPhone">
          <el-input v-model="form.contactPhone" placeholder="用于系统告警与售后联络" maxlength="20" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Check" :loading="saving" @click="submit">保存企业信息</el-button>
          <span class="text-sub ml-8">
            当前组织规模：{{ info.dept_count ?? 0 }} 个部门 / {{ info.user_count ?? 0 }} 名员工
          </span>
        </el-form-item>
      </el-form>
    </div>

    <!-- 运行环境 -->
    <div class="page-card">
      <h3 class="page-title">运行环境</h3>
      <p class="page-desc">私有化部署的实际运行参数，出现异常时可先据此判断是配置问题还是环境问题</p>

      <el-descriptions :column="3" border size="small" v-loading="sysLoading">
        <el-descriptions-item label="系统版本">{{ sys.version || '-' }}</el-descriptions-item>
        <el-descriptions-item label="运行模式">{{ sys.mode_text || '-' }}</el-descriptions-item>
        <el-descriptions-item label="Node 版本">{{ sys.node_version || '-' }}</el-descriptions-item>
        <el-descriptions-item label="数据库驱动">{{ sys.db_driver || '-' }}</el-descriptions-item>
        <el-descriptions-item label="向量库">
          {{ sys.vector_driver || '-' }}
          <span v-if="sys.vector_dim" class="text-sub">（{{ sys.vector_dim }} 维）</span>
        </el-descriptions-item>
        <el-descriptions-item label="文件存储">{{ sys.storage_driver || '-' }}</el-descriptions-item>
        <el-descriptions-item label="大模型状态">
          <el-tag :type="sys.llm_ready ? 'success' : 'warning'" size="small" effect="dark">
            {{ sys.llm_ready ? '已接入 OpenClaw' : '规则引擎兜底' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="持续运行">{{ uptimeText }}</el-descriptions-item>
        <el-descriptions-item label="在册员工">{{ sys.user_count ?? 0 }} 人</el-descriptions-item>
        <el-descriptions-item label="研发主体" :span="3">{{ sys.vendor || '-' }}</el-descriptions-item>
      </el-descriptions>
    </div>

    <!-- 业务参数 -->
    <div class="page-card">
      <h3 class="page-title">业务参数配置</h3>
      <p class="page-desc">以下参数直接影响知识库检索质量、客户跟进提醒与库存预警触发条件，修改后立即对全企业生效</p>

      <el-form :model="cfg" label-width="150px" v-loading="cfgLoading" style="max-width: 720px">
        <el-form-item label="知识库分片大小">
          <el-input-number v-model="cfg.kb_chunk_size" :min="200" :max="2000" :step="100" controls-position="right" />
          <div class="tip">
            单个文档切分成向量片段的字符数。数值越小检索越精准但片段更碎，越大上下文更完整但可能引入噪声，常规文档建议 800
          </div>
        </el-form-item>
        <el-form-item label="检索 TopK">
          <el-input-number v-model="cfg.kb_top_k" :min="1" :max="20" controls-position="right" />
          <div class="tip">知识库问答时召回的片段条数。条数过少答案不全，过多会稀释重点，建议 3 至 8 条</div>
        </el-form-item>
        <el-form-item label="客户跟进逾期天数">
          <el-input-number
            v-model="cfg.crm_follow_overdue_days"
            :min="1"
            :max="90"
            controls-position="right"
          />
          <div class="tip">超过该天数未产生跟进记录的客户，会在工作台待办与客户列表中标记为逾期，提醒销售及时联系</div>
        </el-form-item>
        <el-form-item label="默认库存预警线">
          <el-input-number
            v-model="cfg.erp_default_warn_stock"
            :min="0"
            :max="99999"
            controls-position="right"
          />
          <div class="tip">新建产品时的默认安全库存值。库存低于该数值即生成预警并推送至工作台，单个产品可另行设置</div>
        </el-form-item>
        <el-form-item label="首页公告">
          <el-input
            v-model="cfg.workbench_notice"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="填写后将在所有员工的 AI 工作台顶部横幅展示，如月度冲刺目标、制度变更通知等；留空则不展示"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Check" :loading="cfgSaving" @click="submitConfig">
            保存业务参数
          </el-button>
          <el-button :icon="RefreshLeft" @click="loadConfig">还原</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, FormInstance } from 'element-plus';
import { Check, RefreshLeft } from '@element-plus/icons-vue';
import { enterpriseApi, systemApi } from '../../api';

const saving = ref(false);
const sysLoading = ref(false);
const cfgLoading = ref(false);
const cfgSaving = ref(false);
const info = ref<any>({});
const sys = ref<any>({});

const industries = ['制造业', '批发零售', '建材家居', '食品饮料', '服装鞋帽', '电子科技', '医疗器械', '物流运输', '专业服务'];

/* ---------- 企业信息 ---------- */
const formRef = ref<FormInstance>();
const form = reactive<any>({
  name: '',
  shortName: '',
  industry: '',
  contactPerson: '',
  contactPhone: '',
});

const rules = {
  name: [{ required: true, message: '请输入企业全称', trigger: 'blur' }],
  contactPhone: [{ pattern: /^[\d\-+() ]{6,20}$/, message: '联系电话格式不正确', trigger: 'blur' }],
};

async function loadInfo() {
  // 该接口返回 camelCase，与其他 snake_case 接口不同
  const res: any = await enterpriseApi.info();
  info.value = res || {};
  Object.assign(form, {
    name: res?.name || '',
    shortName: res?.shortName || '',
    industry: res?.industry || '',
    contactPerson: res?.contactPerson || '',
    contactPhone: res?.contactPhone || '',
  });
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    await enterpriseApi.update({
      name: form.name,
      short_name: form.shortName,
      industry: form.industry,
      contact_person: form.contactPerson,
      contact_phone: form.contactPhone,
    });
    ElMessage.success('企业信息已更新');
    loadInfo();
  } finally {
    saving.value = false;
  }
}

/* ---------- 运行环境 ---------- */
async function loadSys() {
  sysLoading.value = true;
  try {
    sys.value = (await systemApi.info()) as any;
  } finally {
    sysLoading.value = false;
  }
}

const uptimeText = computed(() => fmtUptime(sys.value.uptime_seconds));

function fmtUptime(sec: any) {
  const s = Number(sec || 0);
  if (!s) return '-';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}天${h}小时${m}分`;
  if (h) return `${h}小时${m}分`;
  return `${m}分${s % 60}秒`;
}

/* ---------- 业务参数 ---------- */
const cfg = reactive<any>({
  kb_chunk_size: 800,
  kb_top_k: 5,
  crm_follow_overdue_days: 7,
  erp_default_warn_stock: 10,
  workbench_notice: '',
});

async function loadConfig() {
  cfgLoading.value = true;
  try {
    const res: any = await systemApi.getConfig();
    Object.assign(cfg, {
      kb_chunk_size: Number(res?.kb_chunk_size || 800),
      kb_top_k: Number(res?.kb_top_k || 5),
      crm_follow_overdue_days: Number(res?.crm_follow_overdue_days || 7),
      erp_default_warn_stock: Number(res?.erp_default_warn_stock || 10),
      workbench_notice: res?.workbench_notice || '',
    });
  } finally {
    cfgLoading.value = false;
  }
}

async function submitConfig() {
  cfgSaving.value = true;
  try {
    await systemApi.saveConfig({
      kb_chunk_size: String(cfg.kb_chunk_size),
      kb_top_k: String(cfg.kb_top_k),
      crm_follow_overdue_days: String(cfg.crm_follow_overdue_days),
      erp_default_warn_stock: String(cfg.erp_default_warn_stock),
      workbench_notice: cfg.workbench_notice,
    });
    ElMessage.success('业务参数已保存');
  } finally {
    cfgSaving.value = false;
  }
}

onMounted(() => {
  loadInfo();
  loadSys();
  loadConfig();
});
</script>

<style scoped lang="scss">
.tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  line-height: 1.7;
  margin-top: 2px;
}

.ml-8 {
  margin-left: 8px;
  font-size: 12px;
}
</style>
