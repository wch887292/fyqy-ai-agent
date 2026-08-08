<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">消息中心</h3>
      <p class="page-desc">
        智能体执行结果、订单工单联动、风险预警与分利结算的站内通知统一收件箱
      </p>

      <div class="filter-bar mt-12">
        <el-tabs v-model="tab" class="notice-tabs" @tab-change="onTab">
          <el-tab-pane name="all" label="全部" />
          <el-tab-pane name="unread">
            <template #label>
              <el-badge :value="unread" :max="99" :hidden="!unread" class="tab-badge">未读</el-badge>
            </template>
          </el-tab-pane>
          <el-tab-pane name="read" label="已读" />
        </el-tabs>
        <div class="flex-1"></div>
        <el-button type="primary" :icon="Select" :loading="reading" @click="readAll">全部已读</el-button>
      </div>

      <div v-loading="loading" class="notice-list">
        <div
          v-for="row in list"
          :key="row.id"
          class="notice-item"
          :class="{ unread: !row.is_read }"
          @click="onClick(row)"
        >
          <span v-if="!row.is_read" class="notice-dot"></span>
          <div class="notice-main">
            <div class="notice-title" :class="{ bold: !row.is_read }">{{ row.title }}</div>
            <div v-show="expandedId !== row.id" class="notice-content">{{ row.content }}</div>
            <el-collapse-transition>
              <div v-show="expandedId === row.id" class="notice-full">{{ row.content }}</div>
            </el-collapse-transition>
            <div class="notice-meta">
              <el-tag size="small" effect="plain">{{ bizText(row.biz_type) }}</el-tag>
              <span>{{ fmt(row.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && !list.length" class="empty-tip mt-16">
        {{ tab === 'unread' ? '没有未读消息，所有通知都已处理完毕' : '暂无消息通知' }}
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
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Select } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { noticeApi } from '../../api';

const router = useRouter();

const list = ref<any[]>([]);
const total = ref(0);
const unread = ref(0);
const loading = ref(false);
const reading = ref(false);

const tab = ref('all');
const expandedId = ref<any>(0);

const query = reactive<any>({ page: 1, size: 10 });

// 后端 biz_type 为英文枚举，这里只做展示层映射，未命中则原样透出，避免新增业务类型时漏显示
const BIZ_TEXT: Record<string, string> = {
  agent: '智能体',
  order: '销售订单',
  workorder: '生产工单',
  risk: '风险预警',
  profit: '分利结算',
  stock: '库存预警',
  customer: '客户跟进',
  system: '系统通知',
};

function bizText(t: string) {
  return BIZ_TEXT[t] || t || '系统通知';
}

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 全部页签不传 is_read，让后端返回全量
function readFilter() {
  if (tab.value === 'unread') return 0;
  if (tab.value === 'read') return 1;
  return undefined;
}

async function reload() {
  loading.value = true;
  try {
    const res: any = await noticeApi.page({
      page: query.page,
      size: query.size,
      is_read: readFilter(),
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e: any) {
    // 全局拦截
  } finally {
    loading.value = false;
  }
  loadUnread();
}

async function loadUnread() {
  try {
    // 该接口直接返回数字，不是对象
    const res: any = await noticeApi.unreadCount();
    unread.value = Number(res) || 0;
  } catch (e: any) {
    // 全局拦截
  }
}

function onTab() {
  query.page = 1;
  expandedId.value = 0;
  reload();
}

async function onClick(row: any) {
  expandedId.value = expandedId.value === row.id ? 0 : row.id;
  if (row.is_read) return;
  try {
    await noticeApi.read(row.id);
    row.is_read = 1;
    if (unread.value > 0) unread.value -= 1;
  } catch (e: any) {
    // 全局拦截
  }
  // 点击已读后，若携带 biz_type + biz_id，跳转到对应业务页（如订单详情、工单详情）
  if (row.biz_type && row.biz_id) {
    const BIZ_ROUTE: Record<string, string> = {
      order: '/erp/order',
      workorder: '/prod/workorder',
      customer: '/crm/customer',
      agent: '/agent/task',
      partner: '/partner/settle',
      risk: '/partner/risk',
      stock: '/prod/workorder',
    };
    const route = BIZ_ROUTE[row.biz_type];
    if (route) router.push({ path: route, query: { id: row.biz_id } });
  }
}

async function readAll() {
  const ok = await ElMessageBox.confirm('确认将全部未读消息标记为已读？', '全部已读', {
    type: 'warning',
  }).catch(() => false);
  if (!ok) return;
  reading.value = true;
  try {
    await noticeApi.readAll();
    ElMessage.success('已全部标记为已读');
    query.page = 1;
    expandedId.value = 0;
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    reading.value = false;
  }
}

reload();
</script>

<style scoped lang="scss">
.mt-16 {
  margin-top: 16px;
}

// 页签嵌在 filter-bar 内，去掉默认下边框与外边距才能和右侧按钮对齐
.notice-tabs {
  :deep(.el-tabs__header) {
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }
}

.tab-badge {
  :deep(.el-badge__content) {
    top: 6px;
    right: -4px;
  }
}

.notice-list {
  min-height: 60px;
  border-top: 1px solid #ebeef5;
}

.notice-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #ebeef5;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: #f5f7fa;
  }

  &.unread {
    border-left: 3px solid #409eff;
    padding-left: 13px;
  }
}

.notice-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  flex-shrink: 0;
  margin-top: 6px;
}

.notice-main {
  flex: 1;
  min-width: 0;
}

.notice-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;

  &.bold {
    font-weight: 700;
  }
}

.notice-content {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.notice-full {
  font-size: 13px;
  color: #606266;
  line-height: 1.7;
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.notice-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}
</style>
