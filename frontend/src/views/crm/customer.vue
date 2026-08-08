<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">客户管理</h3>
      <p class="page-desc">
        客户列表固定每页 10 条；意向等级由 AI 依据跟进频次、间隔与沟通内容自动打分
      </p>

      <div class="filter-bar">
        <el-input
          v-model="query.keyword"
          placeholder="客户姓名 / 公司 / 电话"
          clearable
          style="width: 240px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-select v-model="query.grade" placeholder="意向等级" clearable style="width: 140px" @change="reload">
          <el-option v-for="g in grades" :key="g.v" :label="g.l" :value="g.v" />
        </el-select>
        <el-select
          v-model="query.owner_user_id"
          placeholder="负责人"
          clearable
          filterable
          style="width: 150px"
          @change="reload"
        >
          <el-option v-for="u in users" :key="u.id" :label="u.real_name || u.username" :value="u.id" />
        </el-select>
        <el-checkbox v-model="onlyOverdue" @change="reload">仅看逾期未跟进</el-checkbox>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Download" @click="doExport">导出</el-button>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新增客户</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="客户" min-width="180">
          <template #default="{ row }">
            <div class="cust-cell">
              <b>{{ row.customer_name }}</b>
              <span class="text-sub">{{ row.company_name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="联系电话" width="130" />
        <el-table-column label="意向" width="150" align="center">
          <template #default="{ row }">
            <el-tag :type="gradeType(row.grade)" effect="dark" size="small">
              {{ row.grade }}级 · {{ row.grade_text }}
            </el-tag>
            <div class="score-bar">
              <div class="bar"><i :style="{ width: row.intention_score + '%' }"></i></div>
              <span>{{ row.intention_score }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="t in row.tags" :key="t" size="small" effect="plain" class="mr-4">{{ t }}</el-tag>
            <span v-if="!row.tags?.length" class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="owner_name" label="负责人" width="90" />
        <el-table-column label="最近跟进" width="160">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.overdue }">{{ fmt(row.last_follow_time) || '从未跟进' }}</span>
            <div v-if="row.overdue" class="text-danger tiny">已逾期</div>
          </template>
        </el-table-column>
        <el-table-column label="下次跟进" width="120">
          <template #default="{ row }">{{ fmtDate(row.next_follow_time) || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" size="small" @click="openFollow(row)">跟进</el-button>
            <el-button link type="warning" size="small" :loading="scoring === row.id" @click="doScore(row)">
              AI评分
            </el-button>
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="info" size="small" @click="toPublic(row)">移入公海</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          :page-size="10"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 新增/编辑客户 -->
    <el-dialog v-model="editVisible" :title="form.id ? '编辑客户' : '新增客户'" width="620px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="客户姓名" prop="customer_name">
          <el-input v-model="form.customer_name" placeholder="联系人姓名" />
        </el-form-item>
        <el-form-item label="公司名称">
          <el-input v-model="form.company_name" placeholder="客户所属公司" />
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="form.phone" placeholder="11 位手机号" maxlength="20" />
        </el-form-item>
        <el-form-item label="联系时间">
          <el-date-picker
            v-model="form.contact_time"
            type="datetime"
            placeholder="首次联系时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="客户标签">
          <el-select
            v-model="form.tag_list"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="可自定义输入后回车"
            style="width: 100%"
          >
            <el-option v-for="t in tagPreset" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="form.owner_user_id" filterable clearable placeholder="默认为当前登录人" style="width: 100%">
            <el-option v-for="u in users" :key="u.id" :label="u.real_name || u.username" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="客户背景、采购偏好、关注点等，内容会参与 AI 意向打分"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 客户详情 -->
    <el-drawer v-model="detailVisible" title="客户详情" size="620px">
      <div v-if="detail" v-loading="detailLoading">
        <div class="d-head">
          <div>
            <h3 class="d-name">{{ detail.customer_name }}</h3>
            <p class="text-sub">{{ detail.company_name }}</p>
          </div>
          <el-tag :type="gradeType(detail.grade)" effect="dark">
            {{ detail.grade }}级 · {{ detail.intention_score }}分
          </el-tag>
        </div>

        <el-descriptions :column="2" border size="small" class="mt-12">
          <el-descriptions-item label="联系电话">{{ detail.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ detail.owner_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="首次联系">{{ fmt(detail.contact_time) || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最近跟进">{{ fmt(detail.last_follow_time) || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下次跟进">{{ fmtDate(detail.next_follow_time) || '-' }}</el-descriptions-item>
          <el-descriptions-item label="客户状态">
            {{ detail.is_public ? '公海客户' : '私有客户' }}
          </el-descriptions-item>
          <el-descriptions-item label="标签" :span="2">
            <el-tag v-for="t in detail.tags" :key="t" size="small" effect="plain" class="mr-4">{{ t }}</el-tag>
            <span v-if="!detail.tags?.length" class="text-sub">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="detail.ai_analysis" class="mt-12">
          <h4 class="sec-title">AI 意向研判</h4>
          <div class="ai-box">{{ detail.ai_analysis }}</div>
        </div>

        <h4 class="sec-title mt-16">
          跟进记录
          <span class="text-sub tiny">共 {{ detail.follows?.length || 0 }} 条</span>
        </h4>
        <el-timeline v-if="detail.follows?.length">
          <el-timeline-item
            v-for="f in detail.follows"
            :key="f.id"
            :timestamp="fmt(f.created_at)"
            placement="top"
          >
            <div class="follow-card">
              <div class="fc-head">
                <el-tag size="small" effect="plain">{{ f.follow_type }}</el-tag>
                <span class="text-sub">{{ f.user_name }}</span>
              </div>
              <div class="fc-content">{{ f.content }}</div>
              <div v-if="f.ai_suggest" class="fc-ai">AI 建议：{{ f.ai_suggest }}</div>
            </div>
          </el-timeline-item>
        </el-timeline>
        <div v-else class="empty-tip">暂无跟进记录</div>
      </div>
    </el-drawer>

    <!-- 新增跟进 -->
    <el-dialog v-model="followVisible" title="新增跟进记录" width="600px">
      <el-form :model="followForm" label-width="100px">
        <el-form-item label="客户">
          <el-input :model-value="followForm.customer_label" disabled />
        </el-form-item>
        <el-form-item label="跟进方式">
          <el-radio-group v-model="followForm.follow_type">
            <el-radio-button v-for="t in followTypes" :key="t" :value="t">{{ t }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="跟进内容">
          <el-input
            v-model="followForm.content"
            type="textarea"
            :rows="5"
            placeholder="记录客户原话、关注点、异议与承诺事项，越具体 AI 建议越准"
          />
        </el-form-item>
        <el-form-item label="下次跟进">
          <el-date-picker
            v-model="followForm.next_follow_time"
            type="datetime"
            placeholder="约定的下次联系时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>

      <div v-if="followResult" class="ai-box mt-8">
        <b>AI 跟进建议</b><br />{{ followResult }}
      </div>

      <template #footer>
        <el-button @click="followVisible = false">关闭</el-button>
        <el-button type="primary" :loading="followSaving" @click="submitFollow">保存并生成建议</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';
import { Download, Plus, Search } from '@element-plus/icons-vue';
import { crmApi, userApi } from '../../api';

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const users = ref<any[]>([]);
const onlyOverdue = ref(false);
const scoring = ref<number | null>(null);

const query = reactive<any>({ page: 1, keyword: '', grade: '', owner_user_id: '' });

const grades = [
  { v: 'A', l: 'A级 · 高意向' },
  { v: 'B', l: 'B级 · 潜在客户' },
  { v: 'C', l: 'C级 · 普通' },
  { v: 'D', l: 'D级 · 沉睡' },
];
const tagPreset = ['大客户', '品牌方', '贸易商', '月结60天', '价格敏感', '待培育', '老客户', '沉睡'];
const followTypes = ['电话', '微信', '拜访', '邮件', '其他'];

/* ---------- 列表 ---------- */
async function load() {
  loading.value = true;
  try {
    const params: any = { ...query };
    if (onlyOverdue.value) params.overdue = 1;
    const res: any = await crmApi.customerPage(params);
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

onMounted(async () => {
  load();
  try {
    users.value = (await userApi.options()) as any;
  } catch {
    users.value = [];
  }
});

/* ---------- 新增/编辑 ---------- */
const editVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({
  id: 0,
  customer_name: '',
  company_name: '',
  phone: '',
  contact_time: '',
  tag_list: [] as string[],
  owner_user_id: '',
  remark: '',
});

const rules = {
  customer_name: [{ required: true, message: '请输入客户姓名', trigger: 'blur' }],
  phone: [
    { required: true, message: '请输入联系电话', trigger: 'blur' },
    { pattern: /^[\d\-+() ]{6,20}$/, message: '电话格式不正确', trigger: 'blur' },
  ],
};

function openEdit(row?: any) {
  Object.assign(form, {
    id: row?.id || 0,
    customer_name: row?.customer_name || '',
    company_name: row?.company_name || '',
    phone: row?.phone || '',
    contact_time: row?.contact_time ? fmt(row.contact_time) : '',
    // 列表接口返回数组，兼容后端可能直接给逗号串的情况
    tag_list: Array.isArray(row?.tags)
      ? [...row.tags]
      : String(row?.tags || '').split(',').filter(Boolean),
    owner_user_id: row?.owner_user_id || '',
    remark: row?.remark || '',
  });
  editVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    // 后端 saveCustomer 读取的是 tags 字段（数组或逗号串），此处做一次映射
    const { tag_list, contact_time, ...rest } = form;
    await crmApi.saveCustomer({ ...rest, tags: Array.isArray(tag_list) ? tag_list : [] });
    ElMessage.success('保存成功');
    editVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

/* ---------- 详情 ---------- */
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<any>(null);

async function openDetail(row: any) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await crmApi.customerDetail(row.id);
  } finally {
    detailLoading.value = false;
  }
}

/* ---------- 跟进 ---------- */
const followVisible = ref(false);
const followSaving = ref(false);
const followResult = ref('');
const followForm = reactive<any>({
  customer_id: 0,
  customer_label: '',
  follow_type: '电话',
  content: '',
  next_follow_time: '',
});

function openFollow(row: any) {
  Object.assign(followForm, {
    customer_id: row.id,
    customer_label: `${row.customer_name}（${row.company_name || '-'}）`,
    follow_type: '电话',
    content: '',
    next_follow_time: '',
  });
  followResult.value = '';
  followVisible.value = true;
}

async function submitFollow() {
  if (!followForm.content.trim()) return ElMessage.warning('请填写跟进内容');
  followSaving.value = true;
  try {
    const res: any = await crmApi.saveFollow({
      customer_id: followForm.customer_id,
      follow_type: followForm.follow_type,
      content: followForm.content,
      next_follow_time: followForm.next_follow_time || undefined,
    });
    followResult.value = res.ai_suggest || '已保存';
    ElMessage.success('跟进记录已保存');
    load();
  } finally {
    followSaving.value = false;
  }
}

/* ---------- AI 评分 / 公海 / 导出 ---------- */
async function doScore(row: any) {
  scoring.value = row.id;
  try {
    const res: any = await crmApi.score({ customer_id: row.id });
    ElMessage.success(`评分完成：${res.score} 分 / ${res.grade} 级`);
    load();
  } finally {
    scoring.value = null;
  }
}

function toPublic(row: any) {
  ElMessageBox.confirm(
    `确定将「${row.customer_name}」移入公海吗？移入后其他同事可认领。`,
    '移入公海',
    { type: 'warning' },
  )
    .then(async () => {
      await crmApi.moveToPublic({ ids: [row.id] });
      ElMessage.success('已移入公海');
      load();
    })
    .catch(() => void 0);
}

async function doExport() {
  const rows: any = await crmApi.exportRows({ ...query });
  const data: any[] = rows.list || rows || [];
  if (!data.length) return ElMessage.warning('无可导出数据');

  const headers = ['客户姓名', '公司名称', '联系电话', '意向等级', '意向分', '标签', '负责人', '最近跟进'];
  const lines = [headers.join(',')];
  for (const r of data) {
    lines.push(
      [
        r.customer_name,
        r.company_name,
        r.phone,
        r.grade,
        r.intention_score,
        (r.tags || []).join('|'),
        r.owner_name,
        fmt(r.last_follow_time),
      ]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(','),
    );
  }
  // \ufeff 防止 Excel 打开中文乱码
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `客户列表_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  ElMessage.success(`已导出 ${data.length} 条`);
}

/* ---------- 工具 ---------- */
function gradeType(g: string) {
  return g === 'A' ? 'danger' : g === 'B' ? 'warning' : g === 'C' ? 'primary' : 'info';
}

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDate(v: any) {
  return v ? fmt(v).slice(0, 10) : '';
}
</script>

<style scoped lang="scss">
.cust-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.6;

  span {
    font-size: 12px;
  }
}

.score-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;

  .bar {
    flex: 1;
    height: 4px;
    background: #eef1f6;
    border-radius: 2px;
    overflow: hidden;

    i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #60a5fa, #2563eb);
    }
  }

  span {
    font-size: 11px;
    color: var(--fae-text-sub);
  }
}

.mr-4 {
  margin-right: 4px;
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.follow-card {
  background: #fafbfc;
  border-radius: 8px;
  padding: 10px 12px;
}

.fc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}

.fc-content {
  font-size: 13px;
  line-height: 1.8;
}

.fc-ai {
  margin-top: 8px;
  font-size: 12px;
  color: #1d4ed8;
  background: #eff6ff;
  padding: 8px 10px;
  border-radius: 6px;
  line-height: 1.8;
}
</style>
