<template>
  <div class="login-page">
    <div class="brand">
      <div class="brand-inner">
        <div class="logo-row">
          <span class="logo-mark">飞</span>
          <span class="logo-name">飞虹智 · 企业AI一站式平台</span>
        </div>
        <h1 class="slogan">让管理落地，让销售增长</h1>
        <p class="sub">
          一套系统打通 组织 · 知识库 · 销售 · 进销存 · 合伙人，<br />
          AI 深度嵌入每个业务环节，不做花架子，只解决真问题。
        </p>
        <ul class="feature-list">
          <li v-for="f in features" :key="f.t">
            <span class="dot"></span>
            <div>
              <b>{{ f.t }}</b>
              <span>{{ f.d }}</span>
            </div>
          </li>
        </ul>
        <div class="vendor">
          晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心<br />
          V1.0.0
        </div>
      </div>
    </div>

    <div class="form-side">
      <div class="form-box">
        <h2 class="title">账号登录</h2>
        <p class="tip">请使用企业分配的账号登录系统</p>

        <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="submit">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" clearable />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              :prefix-icon="Lock"
              show-password
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" class="submit-btn" :loading="loading" @click="submit">
              登 录
            </el-button>
          </el-form-item>
        </el-form>

        <div class="demo-box">
          <div class="demo-title">演示账号（点击即可填入）</div>
          <div class="demo-list">
            <div v-for="d in demos" :key="d.u" class="demo-item" @click="fill(d)">
              <b>{{ d.u }}</b>
              <span>{{ d.n }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, FormInstance } from 'element-plus';
import { Lock, User } from '@element-plus/icons-vue';
import { useUserStore } from '../../store/user';

const router = useRouter();
const route = useRoute();
const store = useUserStore();

const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

const features = [
  { t: 'AI知识库', d: '制度、话术、产品资料统一沉淀，问答可溯源' },
  { t: 'AI销售管理', d: '客户意向自动打分，跟进建议与日报一键生成' },
  { t: 'AI-ERP基础', d: '库存预警自动给补货建议，订单异常主动研判' },
  { t: '合伙人管理', d: '分权配置 + 业绩台账 + 越权风险每日扫描' },
];

const demos = [
  { u: 'admin', p: '123456', n: '企业管理员（全权限）' },
  { u: 'sales01', p: '123456', n: '销售专员（仅本人数据）' },
  { u: 'partner01', p: '123456', n: '合伙人（本部门数据）' },
  { u: 'stock01', p: '123456', n: '仓管员（ERP权限）' },
  { u: 'superadmin', p: 'admin@2026', n: '平台超管（跨企业）' },
];

function fill(d: { u: string; p: string }) {
  form.username = d.u;
  form.password = d.p;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  loading.value = true;
  try {
    await store.login(form.username, form.password);
    ElMessage.success(`欢迎回来，${store.realName}`);
    const redirect = (route.query.redirect as string) || '/workbench/index';
    router.push(redirect);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.login-page {
  height: 100%;
  display: flex;
}

.brand {
  flex: 1;
  background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    width: 520px;
    height: 520px;
    right: -160px;
    bottom: -200px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
  }
}

.brand-inner {
  max-width: 480px;
  padding: 0 48px;
  position: relative;
  z-index: 1;
}

.logo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 40px;

  .logo-mark {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: #fff;
    color: var(--fae-primary);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo-name {
    font-size: 16px;
    font-weight: 600;
  }
}

.slogan {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 16px;
  letter-spacing: 1px;
}

.sub {
  font-size: 14px;
  line-height: 1.9;
  opacity: 0.88;
  margin: 0 0 32px;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0 0 48px;

  li {
    display: flex;
    gap: 10px;
    margin-bottom: 14px;
    align-items: flex-start;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
    margin-top: 8px;
    flex-shrink: 0;
    opacity: 0.9;
  }

  b {
    display: block;
    font-size: 14px;
    margin-bottom: 2px;
  }

  span {
    font-size: 13px;
    opacity: 0.8;
  }
}

.vendor {
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.8;
}

.form-side {
  width: 460px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.form-box {
  width: 340px;
}

.title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 6px;
}

.tip {
  font-size: 13px;
  color: var(--fae-text-sub);
  margin: 0 0 28px;
}

.submit-btn {
  width: 100%;
  letter-spacing: 4px;
}

.demo-box {
  margin-top: 24px;
  border-top: 1px dashed var(--fae-border);
  padding-top: 16px;
}

.demo-title {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-bottom: 10px;
}

.demo-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.demo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #f7f9fc;
  cursor: pointer;
  transition: all 0.15s;

  b {
    color: var(--fae-primary);
    min-width: 78px;
  }

  span {
    color: var(--fae-text-sub);
  }

  &:hover {
    background: var(--fae-primary-light);
  }
}

@media (max-width: 900px) {
  .brand {
    display: none;
  }
  .form-side {
    width: 100%;
  }
}
</style>
