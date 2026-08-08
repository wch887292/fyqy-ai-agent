# 一次性脚本：把 V2.0 新增服务的出参统一为项目约定的 snake_case
import io

edits = [
    ('src/modules/agent/agent.service.ts',
     "import { pageResult } from '../../common/result';",
     "import { snakePage, toSnake } from '../../common/result';"),
    ('src/modules/agent/agent.service.ts',
     "      return this.taskRepo.save(task);\n    }\n    // 新增场景必须校验",
     "      return toSnake(await this.taskRepo.save(task));\n    }\n    // 新增场景必须校验"),
    ('src/modules/agent/agent.service.ts',
     "      createdBy: user.userId,\n    });\n    return this.taskRepo.save(task);",
     "      createdBy: user.userId,\n    });\n    return toSnake(await this.taskRepo.save(task));"),
    ('src/modules/agent/agent.service.ts',
     "    qb.orderBy('t.createdAt', 'DESC');\n    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();\n    return pageResult(list, total, page, size);",
     "    qb.orderBy('t.createdAt', 'DESC');\n    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();\n    return snakePage(list, total, page, size);"),
    ('src/modules/agent/agent.service.ts',
     "    qb.orderBy('l.startTime', 'DESC');\n    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();\n    return pageResult(list, total, page, size);",
     "    qb.orderBy('l.startTime', 'DESC');\n    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();\n    return snakePage(list, total, page, size);"),
    ('src/modules/agent/agent.service.ts',
     "    task.enable = dto.enable ?? (task.enable ? 0 : 1);\n    return this.taskRepo.save(task);",
     "    task.enable = dto.enable ?? (task.enable ? 0 : 1);\n    return toSnake(await this.taskRepo.save(task));"),
    ('src/modules/agent/agent.service.ts',
     "    const result = await this.runTask(entId, task, 'manual', user.userId);\n    return { log: result.log, output: result.output };",
     "    const result = await this.runTask(entId, task, 'manual', user.userId);\n    return { log: toSnake(result.log), output: result.output };"),
    ('src/modules/notice/notice.service.ts',
     "import { pageResult } from '../../common/result';",
     "import { snakePage } from '../../common/result';"),
    ('src/modules/notice/notice.service.ts',
     "    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();\n    return pageResult(list, total, page, size);",
     "    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();\n    return snakePage(list, total, page, size);"),
]

for path, old, new in edits:
    s = io.open(path, encoding='utf-8').read()
    if old not in s:
        print('MISS', path, '|', old[:60].replace('\n', '\\n'))
        continue
    io.open(path, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('OK  ', path.split('/')[-1], '|', old[:45].replace('\n', '\\n'))
