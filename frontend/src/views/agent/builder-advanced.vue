<template>
  <div class="advanced-builder">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>高级智能体管理</span>
          <el-button type="primary" @click="handleCreate">新建智能体</el-button>
        </div>
      </template>

      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="名称">
          <el-input v-model="searchForm.agentName" placeholder="请输入智能体名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadList">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="tableData" v-loading="loading" border stripe>
        <el-table-column prop="agentName" label="智能体名称" min-width="150" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="enableQOptimize" label="问题优化" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enable_q_optimize === 1 ? 'success' : 'info'" size="small">
              {{ row.enable_q_optimize === 1 ? '开启' : '关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="enableSafety" label="安全过滤" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enable_safety === 1 ? 'success' : 'info'" size="small">
              {{ row.enable_safety === 1 ? '开启' : '关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="enable" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.enable === 1 ? 'success' : 'danger'" size="small">
              {{ row.enable === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link :type="row.enable === 1 ? 'warning' : 'success'" @click="handleToggle(row)">
              {{ row.enable === 1 ? '禁用' : '启用' }}
            </el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
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

    <!-- 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="800px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="智能体名称" prop="agentName">
          <el-input v-model="form.agentName" placeholder="请输入智能体名称" />
        </el-form-item>
        <el-form-item label="工作流描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="描述智能体的工作流逻辑" />
        </el-form-item>
        <el-form-item label="入口问题预设">
          <el-input v-model="form.inputQuestions" type="textarea" :rows="2" placeholder="预设用户可能提问的问题（每行一个）" />
        </el-form-item>
        <el-form-item label="问题优化">
          <el-switch v-model="form.enableQOptimize" :active-value="1" :inactive-value="0" />
          <span class="form-tip">开启后自动识别用户意图并优化问题</span>
        </el-form-item>
        <el-form-item label="敏感词过滤">
          <el-switch v-model="form.enableSafety" :active-value="1" :inactive-value="0" />
          <span class="form-tip">开启后拦截包含敏感词的问题</span>
        </el-form-item>
        <el-form-item label="敏感词列表" v-if="form.enableSafety">
          <el-input v-model="form.sensitiveWords" placeholder="多个敏感词用逗号分隔" />
        </el-form-item>
        <el-form-item label="关联知识库">
          <el-select v-model="form.kbDocIds" multiple placeholder="选择知识库文档" style="width: 100%">
            <el-option v-for="doc in kbDocs" :key="doc.id" :label="doc.title" :value="String(doc.id)" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { agentBuilderApi } from '@/api'

const loading = ref(false)
const tableData = ref<any[]>([])
const kbDocs = ref<any[]>([])
const dialogVisible = ref(false)
const formRef = ref()
const submitting = ref(false)

const searchForm = reactive({ agentName: '' })
const page = reactive({ page: 1, size: 10, total: 0 })

const form = reactive({
  id: 0,
  agentName: '',
  description: '',
  inputQuestions: '',
  enableQOptimize: 1,
  enableSafety: 1,
  sensitiveWords: '',
  kbDocIds: [] as string[],
})

const rules = {
  agentName: [{ required: true, message: '请输入智能体名称', trigger: 'blur' }],
}

const dialogTitle = ref('新建高级智能体')

const loadList = async () => {
  loading.value = true
  try {
    const res: any = await agentBuilderApi.advancedList({ ...searchForm, ...page })
    tableData.value = res.data?.list || []
    page.total = res.data?.total || 0
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadKbDocs = async () => {
  const res: any = await agentBuilderApi.kbDocs()
  kbDocs.value = res.data || []
}

const handleCreate = () => {
  dialogTitle.value = '新建高级智能体'
  Object.assign(form, { id: 0, agentName: '', description: '', inputQuestions: '', enableQOptimize: 1, enableSafety: 1, sensitiveWords: '', kbDocIds: [] })
  dialogVisible.value = true
}

const handleEdit = (row: any) => {
  dialogTitle.value = '编辑高级智能体'
  Object.assign(form, {
    id: row.id,
    agentName: row.agent_name,
    description: row.description || '',
    inputQuestions: row.input_questions || '',
    enableQOptimize: row.enable_q_optimize ?? 1,
    enableSafety: row.enable_safety ?? 1,
    sensitiveWords: row.sensitive_words || '',
    kbDocIds: (row.kb_doc_ids || '').split(',').filter(Boolean),
  })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  await formRef.value.validate()
  submitting.value = true
  try {
    const data = {
      ...form,
      kbDocIds: form.kbDocIds.join(','),
    }
    await agentBuilderApi.advancedSave(data)
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadList()
  } catch (e: any) {
    ElMessage.error(e.msg || '保存失败')
  } finally {
    submitting.value = false
  }
}

const handleToggle = async (row: any) => {
  const enable = row.enable === 1 ? 0 : 1
  await agentBuilderApi.advancedEnable({ id: row.id, enable })
  ElMessage.success(enable === 1 ? '已启用' : '已禁用')
  loadList()
}

const handleDelete = async (row: any) => {
  await ElMessageBox.confirm('确定要删除该智能体吗？', '提示', { type: 'warning' })
  await agentBuilderApi.advancedDelete(row.id)
  ElMessage.success('删除成功')
  loadList()
}

const resetSearch = () => {
  Object.assign(searchForm, { agentName: '' })
  page.page = 1
  loadList()
}

const formatTime = (t: string) => t ? new Date(t).toLocaleString('zh-CN') : ''

onMounted(() => {
  loadList()
  loadKbDocs()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.search-form {
  margin-bottom: 20px;
}
.pagination {
  margin-top: 20px;
  justify-content: flex-end;
}
.form-tip {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}
</style>
