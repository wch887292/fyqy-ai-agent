<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">智能体任务</h3>
      <p class="page-desc">
        OpenClaw 智能体自动化引擎，支持 cron 定时与业务事件触发，可从模板库一键导入
      </p>

      <div class="filter-bar mt-12">
        <el-select v-model="query.enable" placeholder="状态" clearable style="width: 150px" @change="reload">
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
        <el-input
          v-model="query.agent_name"
          placeholder="智能体名称"
          clearable
          style="width: 200px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Files" @click="openTemplate">从模板库导入</el-button>
        <el-button type="primary" :icon="Plus" @click="openForm()">新建任务</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="agent_name" label="智能体名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="触发方式" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.trigger_type === 'cron' ? 'primary' : 'warning'" size="small" effect="plain">
              {{ row.trigger_type === 'cron' ? '定时触发' : '事件触发' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="cron 表达式" width="170">
          <template #default="{ row }">
            <span v-if="row.trigger_type === 'cron'">{{ row.cron_expr }}</span>
            <span v-else class="text-sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enable ? 'success' : 'info'" size="small" effect="dark">
              {{ row.enable ? '启用' : '停用' }}
            </el-tag>
            <el-switch
              class="ml-8"
              :model-value="!!row.enable"
              @change="(v) => toggleEnable(row, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="上次执行时间" width="160">
          <template #default="{ row }">
            <span v-if="row.last_execute_time">{{ fmt(row.last_execute_time) }}</span>
            <span v-else class="text-sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <el-button
              link
              type="success"
              :icon="VideoPlay"
              :loading="runningId === row.id"
              @click="manualRun(row)"
            >立即执行</el-button>
            <el-button link type="primary" :icon="Edit" @click="openForm(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && !list.length" class="empty-tip mt-16">
        暂无智能体任务，可点击「从模板库导入」快速创建
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

    <!-- 模板库抽屉 -->
    <el-drawer v-model="tplVisible" title="模板库" size="460px">
      <div v-loading="tplLoading">
        <div v-for="t in templates" :key="t.template_key" class="tpl-card">
          <div class="tpl-head">
            <span class="tpl-name">{{ t.agent_name }}</span>
            <el-tag :type="t.trigger_type === 'cron' ? 'primary' : 'warning'" size="small" effect="plain">
              {{ t.trigger_type === 'cron' ? '定时触发' : '事件触发' }}
            </el-tag>
          </div>
          <p class="tpl-desc">{{ t.desc }}</p>
          <div class="tpl-foot">
            <span class="text-sub">{{ t.trigger_type === 'cron' ? t.cron_expr : '—' }}</span>
            <el-button
              type="primary"
              size="small"
              :loading="importingKey === t.template_key"
              @click="importTpl(t)"
            >导入</el-button>
          </div>
        </div>
        <div v-if="!tplLoading && !templates.length" class="empty-tip mt-16">暂无可用模板</div>
      </div>
    </el-drawer>

    <!-- 新建 / 编辑任务 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑任务' : '新建任务'" width="600px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="智能体名称" prop="agent_name">
          <el-input v-model="form.agent_name" placeholder="请输入智能体名称" />
        </el-form-item>
        <el-form-item label="触发方式" prop="trigger_type">
          <el-radio-group v-model="form.trigger_type">
            <el-radio value="cron">定时 cron</el-radio>
            <el-radio value="event">事件 event</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.trigger_type === 'cron'" label="cron 表达式" prop="cron_expr">
          <el-input v-model="form.cron_expr" placeholder="0 0 8,18 * * ?" />
          <div class="form-tip">6 位 Quartz 格式：秒 分 时 日 月 周</div>
        </el-form-item>
        <el-form-item label="业务指令" prop="biz_prompt">
          <el-input
            v-model="form.biz_prompt"
            type="textarea"
            :rows="4"
            placeholder="描述该智能体每次执行需要完成的业务动作"
          />
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enable" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Edit, Files, Plus, Search, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { agentApi } from '../../api';

const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
// 记录正在执行的任务 id，保证多行只有当前行转圈
const runningId = ref<any>(null);

const query = reactive({ page: 1, size: 10, enable: '', agent_name: '' });

const tplVisible = ref(false);
const tplLoading = ref(false);
const templates = ref<any[]>([]);
const importingKey = ref('');

const formVisible = ref(false);
const formRef = ref<any>(null);
const form = reactive<any>({
  id: null,
  agent_name: '',
  template_key: '',
  trigger_type: 'cron',
  cron_expr: '',
  biz_prompt: '',
  enable: true,
});

const rules = {
  agent_name: [{ required: true, message: '请输入智能体名称', trigger: 'blur' }],
  trigger_type: [{ required: true, message: '请选择触发方式', trigger: 'change' }],
  // 事件触发不需要 cron，用 validator 做条件必填
  cron_expr: [
    {
      validator: (_r: any, v: any, cb: any) => {
        if (form.trigger_type === 'cron' && !v) return cb(new Error('请输入 cron 表达式'));
        cb();
      },
      trigger: 'blur',
    },
  ],
  biz_prompt: [{ required: true, message: '请输入业务指令', trigger: 'blur' }],
};

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function reload() {
  loading.value = true;
  try {
    const res: any = await agentApi.taskPage({
      page: query.page,
      size: query.size,
      enable: query.enable === '' ? undefined : Number(query.enable),
      agent_name: query.agent_name || undefined,
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e: any) {
    // 全局拦截
  } finally {
    loading.value = false;
  }
}

async function toggleEnable(row: any, v: any) {
  try {
    await agentApi.enableTask({ id: row.id, enable: v ? 1 : 0 });
    ElMessage.success(v ? '已启用' : '已停用');
    await reload();
  } catch (e: any) {
    // 全局拦截，失败时靠 reload 把开关拨回真实状态
    await reload();
  }
}

async function manualRun(row: any) {
  runningId.value = row.id;
  try {
    const res: any = await agentApi.manualRun(row.id);
    await ElMessageBox.alert(res?.output || '执行完成，无输出内容', '执行结果', {
      confirmButtonText: '知道了',
    });
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    runningId.value = null;
  }
}

async function openTemplate() {
  tplVisible.value = true;
  tplLoading.value = true;
  try {
    const res: any = await agentApi.templates();
    templates.value = res || [];
  } catch (e: any) {
    // 全局拦截
  } finally {
    tplLoading.value = false;
  }
}

async function importTpl(t: any) {
  importingKey.value = t.template_key;
  try {
    await agentApi.saveTask({
      id: null,
      agent_name: t.agent_name,
      template_key: t.template_key,
      trigger_type: t.trigger_type,
      cron_expr: t.trigger_type === 'cron' ? t.cron_expr : '',
      biz_prompt: t.biz_prompt,
      enable: 1,
    });
    ElMessage.success('导入成功');
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    importingKey.value = '';
  }
}

function openForm(row?: any) {
  formRef.value?.clearValidate();
  if (row) {
    Object.assign(form, {
      id: row.id,
      agent_name: row.agent_name,
      template_key: row.template_key || '',
      trigger_type: row.trigger_type || 'cron',
      cron_expr: row.cron_expr || '',
      biz_prompt: row.biz_prompt || '',
      enable: !!row.enable,
    });
  } else {
    Object.assign(form, {
      id: null,
      agent_name: '',
      template_key: '',
      trigger_type: 'cron',
      cron_expr: '',
      biz_prompt: '',
      enable: true,
    });
  }
  formVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    await agentApi.saveTask({
      id: form.id,
      agent_name: form.agent_name,
      template_key: form.template_key,
      trigger_type: form.trigger_type,
      // 事件触发不落 cron，避免脏数据被调度器误读
      cron_expr: form.trigger_type === 'cron' ? form.cron_expr : '',
      biz_prompt: form.biz_prompt,
      enable: form.enable ? 1 : 0,
    });
    ElMessage.success('保存成功');
    formVisible.value = false;
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    saving.value = false;
  }
}

reload();
</script>

<style scoped lang="scss">
.mt-16 {
  margin-top: 16px;
}
.ml-8 {
  margin-left: 8px;
}
.form-tip {
  width: 100%;
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}
.tpl-card {
  padding: 14px 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  margin-bottom: 12px;

  .tpl-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tpl-name {
    font-size: 15px;
    font-weight: 600;
  }

  .tpl-desc {
    margin: 8px 0 12px;
    font-size: 13px;
    line-height: 1.6;
    color: #606266;
  }

  .tpl-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
  }
}
</style>
