<template>
  <div class="page">
    <!-- 今日日报 -->
    <div class="page-card">
      <h3 class="page-title">
        今日日报
        <el-tag v-if="report.exists" type="success" size="small" effect="plain">已提交</el-tag>
        <el-tag v-else type="warning" size="small" effect="plain">未提交</el-tag>
      </h3>
      <p class="page-desc">
        电话量、微信添加、拜访量等数据由系统按当日跟进记录自动统计，你只需补充心得与明日计划；同一天重复保存会覆盖上一版
      </p>

      <div class="filter-bar">
        <el-date-picker
          v-model="reportDate"
          type="date"
          placeholder="日报日期"
          value-format="YYYY-MM-DD"
          :clearable="false"
          style="width: 160px"
          @change="loadReport"
        />
        <el-button :icon="Refresh" @click="loadReport">重新读取</el-button>
        <div class="flex-1"></div>
        <el-button type="warning" :icon="MagicStick" :loading="aiLoading" @click="doAiGenerate">
          AI 一键生成
        </el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存日报</el-button>
      </div>

      <el-form v-loading="reportLoading" :model="form" label-width="110px">
        <el-row :gutter="14">
          <el-col :xs="12" :sm="6">
            <el-form-item label="电话量">
              <el-input-number v-model="form.call_cnt" :min="0" :max="999" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-form-item label="微信添加">
              <el-input-number
                v-model="form.wechat_add_cnt"
                :min="0"
                :max="999"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-form-item label="意向客户">
              <el-input-number
                v-model="form.intention_cust_cnt"
                :min="0"
                :max="999"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="12" :sm="6">
            <el-form-item label="拜访量">
              <el-input-number v-model="form.visit_cnt" :min="0" :max="999" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <div v-if="autoStat" class="auto-tip">
          系统自动统计：电话 {{ autoStat.callCnt || 0 }} · 微信 {{ autoStat.wechatCnt || 0 }} · 拜访
          {{ autoStat.visitCnt || 0 }} · 新增客户 {{ autoStat.newCustCnt || 0 }}（其中意向
          {{ autoStat.intentionCnt || 0 }}） · 跟进记录 {{ autoStat.followCnt || 0 }} 条。与实际不符可手工修正
        </div>

        <el-form-item label="心得体会" class="mt-12">
          <el-input
            v-model="form.experience"
            type="textarea"
            :rows="4"
            placeholder="今天客户的真实反馈、成交或卡壳的原因、有效的话术，写具体一点便于复盘"
          />
        </el-form-item>
        <el-form-item label="明日计划">
          <el-input
            v-model="form.tomorrow_plan"
            type="textarea"
            :rows="4"
            placeholder="明日要联系的客户、要推进的环节、需要协调的资源"
          />
        </el-form-item>
        <el-form-item label="AI 日报正文">
          <el-input
            v-model="form.ai_auto_content"
            type="textarea"
            :rows="8"
            placeholder="可点击「AI 一键生成」自动成文，也可手工撰写"
          />
          <div v-if="aiGenerated" class="text-sub tiny mt-8">
            AI 依据你今日的客户跟进与订单数据生成，请核对后提交
          </div>
        </el-form-item>
      </el-form>
    </div>

    <!-- 历史日报 -->
    <div class="page-card">
      <h3 class="page-title">历史日报</h3>
      <p class="page-desc">按数据权限展示本人或团队的日报，用于回看阶段性动作量与问题</p>

      <div class="filter-bar">
        <el-date-picker
          v-model="query.report_date"
          type="date"
          placeholder="按日期筛选"
          value-format="YYYY-MM-DD"
          clearable
          style="width: 160px"
          @change="reload"
        />
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="report_date" label="日期" width="120" />
        <el-table-column prop="user_name" label="提交人" width="100">
          <template #default="{ row }">{{ row.user_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="call_cnt" label="电话量" width="90" align="center" />
        <el-table-column prop="wechat_add_cnt" label="微信添加" width="100" align="center" />
        <el-table-column prop="intention_cust_cnt" label="意向客户" width="100" align="center" />
        <el-table-column prop="visit_cnt" label="拜访量" width="90" align="center" />
        <el-table-column label="心得体会" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.experience || '-' }}</template>
        </el-table-column>
        <el-table-column label="明日计划" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.tomorrow_plan || '-' }}</template>
        </el-table-column>
        <el-table-column label="提交时间" width="150">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </div>

    <!-- 日报详情 -->
    <el-dialog v-model="detailVisible" title="日报详情" width="680px">
      <template v-if="detail">
        <div class="d-head">
          <div>
            <h3 class="d-name">{{ detail.report_date }} 销售日报</h3>
            <p class="text-sub">{{ detail.user_name || '-' }}</p>
          </div>
        </div>
        <div class="stat-grid mt-12">
          <div class="stat-card">
            <div class="label">电话量</div>
            <div class="value">{{ detail.call_cnt || 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="label">微信添加</div>
            <div class="value">{{ detail.wechat_add_cnt || 0 }}</div>
          </div>
          <div class="stat-card success">
            <div class="label">意向客户</div>
            <div class="value">{{ detail.intention_cust_cnt || 0 }}</div>
          </div>
          <div class="stat-card warn">
            <div class="label">拜访量</div>
            <div class="value">{{ detail.visit_cnt || 0 }}</div>
          </div>
        </div>
        <h4 class="sec-title mt-16">心得体会</h4>
        <div class="text-block">{{ detail.experience || '未填写' }}</div>
        <h4 class="sec-title mt-12">明日计划</h4>
        <div class="text-block">{{ detail.tomorrow_plan || '未填写' }}</div>
        <h4 class="sec-title mt-12">日报正文</h4>
        <div class="ai-box">{{ detail.ai_auto_content || '未生成' }}</div>
      </template>
      <template #footer>
        <el-button type="primary" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { MagicStick, Refresh, Search } from '@element-plus/icons-vue';
import { crmApi } from '../../api';

const todayStr = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const reportDate = ref(todayStr);
const reportLoading = ref(false);
const saving = ref(false);
const aiLoading = ref(false);
const aiGenerated = ref(false);
const report = ref<any>({});
const autoStat = ref<any>(null);

const form = reactive<any>({
  call_cnt: 0,
  wechat_add_cnt: 0,
  intention_cust_cnt: 0,
  visit_cnt: 0,
  experience: '',
  tomorrow_plan: '',
  ai_auto_content: '',
});

/* ---------- 今日日报 ---------- */
async function loadReport() {
  reportLoading.value = true;
  aiGenerated.value = false;
  try {
    // 后端入参为 report_date
    const res: any = await crmApi.getReport({ report_date: reportDate.value });
    report.value = res || {};
    autoStat.value = res?.auto_stat || null;
    Object.assign(form, {
      call_cnt: Number(res?.call_cnt || 0),
      wechat_add_cnt: Number(res?.wechat_add_cnt || 0),
      intention_cust_cnt: Number(res?.intention_cust_cnt || 0),
      visit_cnt: Number(res?.visit_cnt || 0),
      experience: res?.experience || '',
      tomorrow_plan: res?.tomorrow_plan || '',
      ai_auto_content: res?.ai_auto_content || '',
    });
  } finally {
    reportLoading.value = false;
  }
}

async function doAiGenerate() {
  aiLoading.value = true;
  try {
    const res: any = await crmApi.aiGenerateReport({ report_date: reportDate.value });
    Object.assign(form, {
      call_cnt: Number(res?.call_cnt ?? form.call_cnt),
      wechat_add_cnt: Number(res?.wechat_add_cnt ?? form.wechat_add_cnt),
      intention_cust_cnt: Number(res?.intention_cust_cnt ?? form.intention_cust_cnt),
      visit_cnt: Number(res?.visit_cnt ?? form.visit_cnt),
      ai_auto_content: res?.ai_auto_content || '',
    });
    aiGenerated.value = true;
    ElMessage.success('已生成日报草稿，请核对后保存');
  } finally {
    aiLoading.value = false;
  }
}

async function submit() {
  saving.value = true;
  try {
    await crmApi.saveReport({
      report_date: reportDate.value,
      call_cnt: form.call_cnt,
      wechat_add_cnt: form.wechat_add_cnt,
      intention_cust_cnt: form.intention_cust_cnt,
      visit_cnt: form.visit_cnt,
      experience: form.experience,
      tomorrow_plan: form.tomorrow_plan,
      ai_auto_content: form.ai_auto_content,
    });
    ElMessage.success('日报已保存');
    loadReport();
    load();
  } finally {
    saving.value = false;
  }
}

/* ---------- 历史日报 ---------- */
const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const query = reactive<any>({ page: 1, size: 10, report_date: '' });

async function load() {
  loading.value = true;
  try {
    const res: any = await crmApi.reportPage({
      page: query.page,
      size: query.size,
      report_date: query.report_date || undefined,
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } finally {
    loading.value = false;
  }
}

function reload() {
  query.page = 1;
  load();
}

/* ---------- 详情 ---------- */
const detailVisible = ref(false);
const detail = ref<any>(null);

function openDetail(row: any) {
  detail.value = row;
  detailVisible.value = true;
}

onMounted(() => {
  loadReport();
  load();
});

/* ---------- 工具 ---------- */
function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.auto-tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  background: #fafbfc;
  border-radius: 8px;
  padding: 8px 12px;
  line-height: 1.8;
}

.tiny {
  font-size: 11px;
}

.d-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.d-name {
  margin: 0 0 2px;
  font-size: 18px;
}

.sec-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

.text-block {
  background: #fafbfc;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
