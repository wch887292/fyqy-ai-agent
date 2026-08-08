/**
 * 飞虹智-企业AI一站式平台 前端入口
 * 晋江市飞虹智科技企业管理有限公司 · 飞扬企源研发中心
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';

import App from './App.vue';
import router from './router';
import './styles/index.scss';

const app = createApp(App);

// 图标全量注册，菜单 icon 字段可直接按名使用
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component as any);
}

app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn, size: 'default' });
app.mount('#app');
