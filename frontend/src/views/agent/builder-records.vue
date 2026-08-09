<template>
  <div class="record-list">
    <el-card shadow="never">
      <template #header>
        <span>智能体执行记录</span>
      </template>

      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="智能体">
          <el-select v-model="searchForm.agentId" placeholder="全部" clearable filterable>
            <el-option v-for="a in agents" :key="a.id" :label="a.agent_name" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.agentType" placeholder="全部" clearable>
            <el-option label="简易智能体" value="simple" />
            <el-option label="高级智能体" value="advanced" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadList">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" v-loading="loading" border stripe>
        <el-table-column prop="agentType" label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.agent_type === 'simple' ? '' : 'success'" size="small">
              {{ row.agent_type === 'simple' ? '简易' : '高级' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="question" label="用户问题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="answer" label="AI回答" min-width="250" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tooltip :content="row.answer" placement="top">
              <span class="answer-text">{{ row.answer }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="costMs" label="耗时" width="80">
          <template #default="{ row }">
            {{ (row.cost_ms / 1000).toFixed(2) }}s
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="160">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page.page"
        v-model:page-size="page.size"
        :total="page.total"
        layout="total, sizes, prev, pager, next"
        @current-change="loadList"
        @size-change="loadList"
        class="pagination"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { agentBuilderApi } from '@/api'

const loading = ref(false)
const tableData = ref<any[]>([])
const agents = ref<any[]>([])
const searchForm = reactive({ agentId: null as number | null, agentType: '' })
const page = reactive({ page: 1, size: 10, total: 0 })

const loadList = async () => {
  loading.value = true
  try {
    const res: any = await agentBuilderApi.recordList({ ...searchForm, ...page })
    tableData.value = res.data?.list || []
    page.total = res.data?.total || 0
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadAgents = async () => {
  try {
    const [simpleRes, advancedRes]: any[] = await Promise.all([
      agentBuilderApi.simpleList({ page: 1, size: 100 }),
      agentBuilderApi.advancedList({ page: 1, size: 100 }),
    ])
    agents.value = [
      ...(simpleRes.data?.list || []).map((a: any) => ({ id: a.id, agent_name: a.agent_name, agent_type: 'simple' })),
      ...(advancedRes.data?.list || []).map((a: any) => ({ id: a.id, agent_name: a.agent_name, agent_type: 'advanced' })),
    ]
  } catch (e) {
    console.error('加载智能体列表失败', e)
  }
}

const resetSearch = () => {
  Object.assign(searchForm, { agentId: null, agentType: '' })
  page.page = 1
  loadList()
}

const formatTime = (t: string) => t ? new Date(t).toLocaleString('zh-CN') : ''

onMounted(() => {
  loadList()
  loadAgents()
})
</script>

<style scoped>
.search-form {
  margin-bottom: 20px;
}
.pagination {
  margin-top: 20px;
  justify-content: flex-end;
}
.answer-text {
  cursor: pointer;
  color: #409eff;
}
</style>
