<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">智能体执行日志</h3>
      <p class="page-desc">
        记录每次智能体执行的触发来源、输出摘要与异常信息，便于追溯与排障
      </p>

      <div class="filter-bar mt-12">
        <el-select v-model="query.task_id" placeholder="按任务筛选" clearable filterable style="width: 220px" @change="reload">
          <el-option v-for="t in taskOpts" :key="t.id" :label="t.agent_name" :value="t.id" />
        </el-select>
        <el-select v-model="query.execute_status" placeholder="执行状态" clearable style="width: 150px" @change="reload">
          <el-option label="成功" value="success" />
          <el-option label="失败" value="fail" />
          <el-option label="执行中" value="running" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="任务" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ taskName(row.task_id) }}</template>
        </el-table-column>
        <el-table-column label="执行状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.execute_status)" size="small" effect="dark">
              {{ statusText(row.execute_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="触发来源" width="110" align="center">
          <template #default="{ row }">{{ sourceText(row.trigger_source) }}</template>
        </el-table-column>
        <el-table-column label="输出摘要" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.agent_output">{{ row.agent_output }}</span>
            <span v-else class="text-sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="160">
          <template #default="{ row }">{{ fmt(row.start_time) }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.end_time">{{ duration(row) }}</span>
            <span v-else class="text-sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="view(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && !list.length" class="empty-tip mt-16">
        暂无执行日志，智能体任务执行后将自动记录
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="reload"
          @size-change="reload"
        />
      </div>
    </div>

    <!-- 执行日志详情 -->
    <el-dialog v-model="detailVisible" title="执行日志详情" width="680px">
      <template v-if="current">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="日志 ID">{{ current.id }}</el-descriptions-item>
          <el-descriptions-item label="任务">{{ taskName(current.task_id) }}</el-descriptions-item>
          <el-descriptions-item label="执行状态">
            <el-tag :type="statusTag(current.execute_status)" size="small" effect="dark">
              {{ statusText(current.execute_status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="触发来源">{{ sourceText(current.trigger_source) }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ fmt(current.start_time) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">
            <span v-if="current.end_time">{{ fmt(current.end_time) }}</span>
            <span v-else class="text-sub">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="耗时">
            <span v-if="current.end_time">{{ duration(current) }}</span>
            <span v-else class="text-sub">—</span>
          </el-descriptions-item>
          <el-descriptions-item label="企业 ID">{{ current.enterprise_id }}</el-descriptions-item>
          <el-descriptions-item label="输入参数" :span="2">
            <pre class="output-box">{{ prettyInput(current.input_param) }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="智能体输出" :span="2">
            <pre v-if="current.agent_output" class="output-box">{{ current.agent_output }}</pre>
            <span v-else class="text-sub">—</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="current.error_msg" label="异常信息" :span="2">
            <span class="error-text">{{ current.error_msg }}</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Search, View } from '@element-plus/icons-vue';
import { agentApi } from '../../api';

const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const taskOpts = ref<any[]>([]);

const query = reactive({ page: 1, size: 10, task_id: '', execute_status: '' });

const detailVisible = ref(false);
const current = ref<any>(null);

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 日志只存 task_id，任务名靠下拉列表本地映射，避免每行再请求一次
function taskName(id: any) {
  const t = taskOpts.value.find((x) => x.id === id);
  return t ? t.agent_name : `#${id}`;
}

function statusText(s: string) {
  return s === 'success' ? '成功' : s === 'fail' ? '失败' : '执行中';
}

function statusTag(s: string) {
  return s === 'success' ? 'success' : s === 'fail' ? 'danger' : 'warning';
}

function sourceText(s: string) {
  return s === 'cron' ? '定时' : s === 'manual' ? '手动' : '事件';
}

function duration(row: any) {
  const ms = new Date(row.end_time).getTime() - new Date(row.start_time).getTime();
  if (isNaN(ms) || ms < 0) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

// 入参是 JSON 字符串，能解析就美化，解析失败按原文兜底
function prettyInput(v: any) {
  if (!v) return '—';
  try {
    return JSON.stringify(JSON.parse(v), null, 2);
  } catch (e: any) {
    return v;
  }
}

async function loadTasks() {
  try {
    const res: any = await agentApi.taskPage({ page: 1, size: 100 });
    taskOpts.value = res.list || [];
  } catch (e: any) {
    // 全局拦截
  }
}

async function reload() {
  loading.value = true;
  try {
    const res: any = await agentApi.logPage({
      page: query.page,
      size: query.size,
      task_id: query.task_id === '' ? undefined : query.task_id,
      execute_status: query.execute_status || undefined,
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e: any) {
    // 全局拦截
  } finally {
    loading.value = false;
  }
}

function view(row: any) {
  current.value = row;
  detailVisible.value = true;
}

loadTasks();
reload();
</script>

<style scoped lang="scss">
.mt-16 {
  margin-top: 16px;
}
.error-text {
  color: #f56c6c;
}
.output-box {
  white-space: pre-wrap;
  word-break: break-all;
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
  max-height: 320px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}
</style>
