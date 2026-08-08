<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">大模型参数配置</h3>
      <p class="page-desc">
        配置企业私有化 OpenClaw 大模型接入参数；未配置或调用失败时，客户评分、经营简报、知识库问答等 AI 能力会自动降级为内置规则引擎，业务流程不中断
      </p>

      <el-alert
        :type="cfg.llm_ready ? 'success' : 'warning'"
        :closable="false"
        show-icon
        class="mb-12"
      >
        <template #title>
          {{ cfg.llm_ready ? '大模型已接入，AI 能力由 OpenClaw 私有化模型提供' : '当前运行于内置规则引擎兜底模式，所有 AI 功能可正常演示' }}
        </template>
        <template #default>
          <div class="alert-body">{{ cfg.fallback_tip || '' }}</div>
        </template>
      </el-alert>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" style="max-width: 680px">
        <el-form-item label="接口地址" prop="api_endpoint">
          <el-input v-model="form.api_endpoint" placeholder="https://your-openclaw-host/v1" />
          <div class="tip">
            OpenAI 兼容格式的接口根地址，系统会自动拼接 /chat/completions。必须以 http:// 或 https:// 开头，末尾不带斜杠
          </div>
        </el-form-item>
        <el-form-item label="接口密钥">
          <el-input
            v-model="form.api_key"
            type="password"
            show-password
            :placeholder="cfg.api_key_set ? '已配置，留空表示不修改' : '请输入 API Key，未启用鉴权可留空'"
          />
          <div class="tip">密钥保存后一律以掩码形式回显，服务端不会明文返回，操作日志中亦已脱敏</div>
        </el-form-item>
        <el-form-item label="模型名称" prop="model_name">
          <el-input v-model="form.model_name" placeholder="如：qwen2.5-14b-instruct" />
          <div class="tip">需与 OpenClaw 服务实际部署的模型标识一致，填错会导致调用返回模型不存在</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Check" :loading="saving" @click="submit">保存配置</el-button>
          <el-button :icon="Connection" :loading="testing" @click="doTest">连通性测试</el-button>
          <el-button :icon="RefreshLeft" @click="load">还原</el-button>
        </el-form-item>
      </el-form>

      <div v-if="testResult" class="test-box" :class="testResult.success ? 'ok' : 'fail'">
        <div class="tb-head">
          <el-tag :type="testResult.success ? 'success' : 'danger'" size="small" effect="dark">
            {{ testResult.success ? '连接正常' : '连接失败' }}
          </el-tag>
          <span class="text-sub">来源：{{ testResult.provider === 'openclaw' ? 'OpenClaw' : '规则引擎' }}</span>
          <span v-if="testResult.cost_ms !== undefined" class="text-sub">
            耗时 {{ testResult.cost_ms }} ms
          </span>
        </div>
        <div class="tb-msg">{{ testResult.message }}</div>
        <div v-if="testResult.reply" class="tb-reply">模型回复：{{ testResult.reply }}</div>
      </div>
    </div>

    <div class="page-card">
      <h3 class="page-title">当前生效参数</h3>
      <p class="page-desc">企业未单独配置时，系统会回落到部署环境变量中的默认值，此处展示的是最终实际生效的参数</p>

      <el-descriptions :column="2" border size="small" v-loading="loading">
        <el-descriptions-item label="生效接口地址">
          <span :class="{ 'text-sub': !cfg.effective_endpoint }">
            {{ cfg.effective_endpoint || '未配置（走内置规则引擎）' }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="生效模型">
          <span :class="{ 'text-sub': !cfg.effective_model }">{{ cfg.effective_model || '-' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="向量化模型">{{ cfg.embedding_model || '-' }}</el-descriptions-item>
        <el-descriptions-item label="密钥状态">
          <el-tag :type="cfg.api_key_set ? 'success' : 'info'" size="small" effect="plain">
            {{ cfg.api_key_set ? `已配置（${cfg.api_key}）` : '未配置' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="降级策略" :span="2">
          {{ cfg.fallback_tip || '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, FormInstance } from 'element-plus';
import { Check, Connection, RefreshLeft } from '@element-plus/icons-vue';
import { systemApi } from '../../api';

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const cfg = ref<any>({});
const testResult = ref<any>(null);

const formRef = ref<FormInstance>();
const form = reactive<any>({ api_endpoint: '', api_key: '', model_name: '' });

const rules = {
  api_endpoint: [
    {
      validator: (_r: any, v: string, cb: any) => {
        if (v && !/^https?:\/\//i.test(v)) return cb(new Error('接口地址必须以 http:// 或 https:// 开头'));
        cb();
      },
      trigger: 'blur',
    },
  ],
  model_name: [
    {
      validator: (_r: any, v: string, cb: any) => {
        if (form.api_endpoint && !v) return cb(new Error('填写接口地址后，模型名称不能为空'));
        cb();
      },
      trigger: 'blur',
    },
  ],
};

async function load() {
  loading.value = true;
  try {
    const res: any = await systemApi.getAiConfig();
    cfg.value = res || {};
    // 密钥留空提交表示保持原值，因此不回填掩码串
    Object.assign(form, {
      api_endpoint: res?.api_endpoint || '',
      api_key: '',
      model_name: res?.model_name || '',
    });
  } finally {
    loading.value = false;
  }
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    const res: any = await systemApi.saveAiConfig({
      api_endpoint: form.api_endpoint,
      api_key: form.api_key,
      model_name: form.model_name,
    });
    ElMessage.success(res?.tip || '配置已保存');
    load();
  } finally {
    saving.value = false;
  }
}

async function doTest() {
  testing.value = true;
  testResult.value = null;
  try {
    testResult.value = await systemApi.testAiConfig({
      api_endpoint: form.api_endpoint,
      api_key: form.api_key,
      model_name: form.model_name,
    });
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>

<style scoped lang="scss">
.tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  line-height: 1.7;
  margin-top: 2px;
}

.alert-body {
  font-size: 12px;
  line-height: 1.7;
}

.test-box {
  margin-top: 4px;
  max-width: 680px;
  border-radius: var(--fae-radius);
  padding: 12px 14px;
  border: 1px solid var(--fae-border);

  &.ok {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  &.fail {
    background: #fef2f2;
    border-color: #fecaca;
  }
}

.tb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  margin-bottom: 6px;
}

.tb-msg {
  font-size: 13px;
  line-height: 1.8;
}

.tb-reply {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-top: 4px;
  line-height: 1.7;
}
</style>
