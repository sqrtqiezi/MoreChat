# Production Embedding Model Preload Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生产环境 embedding 能力不再依赖运行时从 Hugging Face 在线下载模型，而是在部署阶段预置模型并在启动时优先使用本地模型路径。

**Architecture:** 在仓库中增加模型准备脚本，把 `onnx-community/bge-small-zh-v1.5-ONNX` 下载为部署产物的一部分；GitHub Actions 打包时将模型目录随部署包一起发送到 VPS；服务启动时通过环境变量指定本地模型目录，`EmbeddingService` 优先从本地目录加载模型，若模型缺失或加载失败则继续保持软失败降级，不阻塞主服务启动。

**Tech Stack:** GitHub Actions + 现有 deploy workflow + Node.js 脚本下载模型 + Transformers.js 本地模型路径加载 + 环境变量配置

---

## Subagent Hard Constraints

所有执行本计划的 subagent **必须**遵守以下硬约束：

1. **Logger 约束**：新增 logger 调用必须使用 `{ err: error }` 或结构化对象形式，禁止把 `unknown` 直接作为第二参数传给 logger。
2. **TypeScript 约束**：禁止引入隐式 `any`，所有 map/filter 回调参数、路由结果映射、catch 错误处理都必须显式收紧类型。
3. **远程依赖约束**：任何依赖远程资源（模型/API）的能力都必须软失败，不能阻塞主服务启动或部署成功。
4. **依赖安装约束**：新增依赖前必须确认 CI / VPS 可安装；禁止把会在部署时在线下载二进制/模型的 postinstall 依赖留到生产环境才暴露。
5. **最小改动约束**：只改 embedding 模型部署链路和启动加载策略，不顺手改 unrelated deploy 逻辑。

---

## File Structure

```
deploy/
  prepare-embedding-model.sh           - 预下载 embedding 模型到本地产物目录
apps/server/scripts/
  verify-embedding-model.ts            - 校验本地模型目录结构是否完整
apps/server/src/services/
  embeddingService.ts                  - 修改：优先本地模型路径，保留软失败降级
.github/workflows/
  deploy.yml                           - 修改：构建阶段准备模型并打包，部署时放到固定目录
apps/server/src/lib/
  env.ts                               - 修改：新增 EMBEDDING_ENABLED / EMBEDDING_MODEL_PATH 配置（如已有 env 约束）
apps/server/.env.example               - 修改：新增 embedding 相关环境变量示例（如果项目已有该文件）
apps/server/package.json               - 修改：新增模型校验脚本（如需要）
```

---

## Task 1: 增加模型准备脚本与完整性校验

**Files:**
- Create: `deploy/prepare-embedding-model.sh`
- Create: `apps/server/scripts/verify-embedding-model.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: 写失败测试，验证模型目录缺失时校验失败**

创建 `apps/server/scripts/verify-embedding-model.ts` 之前，先写测试脚本：

```ts
// apps/server/scripts/verify-embedding-model.ts (先按测试思路实现最小断言)
// 需要校验目录中至少存在：config.json, tokenizer.json, onnx/model.onnx
```

并准备一次性命令验证：

```bash
cd /Users/niujin/develop/MoreChat/apps/server && node -e "const fs=require('fs'); const p='models/bge-small-zh-v1.5'; const required=['config.json','tokenizer.json','onnx/model.onnx']; const missing=required.filter(x=>!fs.existsSync(require('path').join(p,x))); if(missing.length===0){process.exit(0)} console.error(missing.join(',')); process.exit(1)"
```

Expected: 在模型目录不存在时返回非 0 退出码。

- [ ] **Step 2: 实现模型完整性校验脚本**

```typescript
// apps/server/scripts/verify-embedding-model.ts
import fs from 'node:fs'
import path from 'node:path'

const modelDir = process.argv[2] || path.join(process.cwd(), 'models', 'bge-small-zh-v1.5')
const requiredFiles = [
  'config.json',
  'tokenizer.json',
  path.join('onnx', 'model.onnx'),
]

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(modelDir, file)))

if (missing.length > 0) {
  console.error(`Missing embedding model files in ${modelDir}: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(`Embedding model verified: ${modelDir}`)
```

- [ ] **Step 3: 实现模型准备脚本**

```bash
# deploy/prepare-embedding-model.sh
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="$ROOT_DIR/deploy-package/models/bge-small-zh-v1.5"
MODEL_ID="onnx-community/bge-small-zh-v1.5-ONNX"

mkdir -p "$MODEL_DIR"

python3 - <<'PY'
from huggingface_hub import snapshot_download
import os

model_id = os.environ['MODEL_ID']
local_dir = os.environ['MODEL_DIR']

snapshot_download(
    repo_id=model_id,
    local_dir=local_dir,
    local_dir_use_symlinks=False,
)
PY

node "$ROOT_DIR/apps/server/scripts/verify-embedding-model.ts" "$MODEL_DIR"
```

- [ ] **Step 4: 增加 package.json 脚本**

在 `apps/server/package.json` 中 scripts 增加：

```json
"verify:embedding-model": "tsx scripts/verify-embedding-model.ts"
```

- [ ] **Step 5: 运行校验脚本验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && pnpm verify:embedding-model ./models/bge-small-zh-v1.5
```

Expected: 模型完整时输出 `Embedding model verified: ...`

- [ ] **Step 6: Commit**

```bash
git add deploy/prepare-embedding-model.sh apps/server/scripts/verify-embedding-model.ts apps/server/package.json
git commit -m "feat(deploy): add embedding model preparation and verification scripts"
```

---

## Task 2: 修改 EmbeddingService 优先加载本地模型路径

**Files:**
- Modify: `apps/server/src/services/embeddingService.ts`
- Modify: `apps/server/src/lib/env.ts`
- Modify: `apps/server/.env.example`

- [ ] **Step 1: 写失败测试，验证本地路径优先选择**

在现有 `embeddingService.test.ts` 中新增一个选择路径的纯逻辑测试（不要触发真实模型加载）：

```ts
it('should prefer EMBEDDING_MODEL_PATH when provided', () => {
  process.env.EMBEDDING_MODEL_PATH = '/opt/morechat/models/bge-small-zh-v1.5'
  const service = new EmbeddingService()
  expect(service.getModelSource()).toBe('/opt/morechat/models/bge-small-zh-v1.5')
  delete process.env.EMBEDDING_MODEL_PATH
})
```

Expected: 当前不存在 `getModelSource()`，测试失败。

- [ ] **Step 2: 修改 env 配置，新增 embedding 开关与模型路径**

在 `apps/server/src/lib/env.ts` 添加：

```ts
embeddingEnabled: z.coerce.boolean().default(true),
embeddingModelPath: z.string().optional(),
```

并映射到导出配置：

```ts
embeddingEnabled: parsed.EMBEDDING_ENABLED,
embeddingModelPath: parsed.EMBEDDING_MODEL_PATH,
```

在 `.env.example` 添加：

```env
EMBEDDING_ENABLED=true
EMBEDDING_MODEL_PATH=/opt/morechat/models/bge-small-zh-v1.5
```

- [ ] **Step 3: 修改 EmbeddingService**

在 `apps/server/src/services/embeddingService.ts` 中：

```typescript
getModelSource(): string {
  return process.env.EMBEDDING_MODEL_PATH || this.modelId
}

async initialize(): Promise<void> {
  if (this.extractor) {
    return
  }

  if (process.env.EMBEDDING_ENABLED === 'false') {
    logger.warn('Embedding disabled by EMBEDDING_ENABLED=false')
    this.extractor = null
    return
  }

  try {
    const wasmBackend = env.backends.onnx?.wasm
    if (wasmBackend) {
      wasmBackend.proxy = false
      wasmBackend.numThreads = 1
    }
    env.allowLocalModels = true
    env.useBrowserCache = false

    if (env.backends.onnx) {
      ;(env.backends.onnx as any).executionProviders = ['wasm']
    }

    const modelSource = this.getModelSource()
    logger.info({ modelSource }, 'Loading embedding model')
    this.extractor = await pipeline('feature-extraction', modelSource, {
      device: 'wasm',
    })
    logger.info({ modelSource }, 'Embedding model loaded successfully')
  } catch (error) {
    logger.error({ err: error, modelSource: this.getModelSource() }, 'Failed to load embedding model')
    this.extractor = null
  }
}
```

- [ ] **Step 4: 运行相关测试验证通过**

```bash
cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/embeddingService.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/embeddingService.ts apps/server/src/lib/env.ts apps/server/.env.example apps/server/src/services/embeddingService.test.ts
git commit -m "feat(embedding): prefer local model path and add runtime switches"
```

---

## Task 3: 修改 deploy workflow，把模型作为部署产物下发

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `deploy/prepare-embedding-model.sh`

- [ ] **Step 1: 写失败检查，验证当前 deploy 包不包含模型目录**

用一次性命令验证当前打包逻辑：

```bash
cd /Users/niujin/develop/MoreChat && rm -rf deploy-package deploy.tar.gz && mkdir -p deploy-package && tar tzf deploy.tar.gz | grep 'models/bge-small-zh-v1.5' || true
```

Expected: 当前不存在模型目录。

- [ ] **Step 2: 在 CI 中安装准备模型所需依赖**

在 `.github/workflows/deploy.yml` 的 `Install dependencies` 后添加：

```yaml
      - name: Setup Python for model download
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install model download helper
        run: pip install huggingface_hub
```

- [ ] **Step 3: 在创建部署包前准备模型**

在 `Create deployment package` step 开头插入：

```yaml
      - name: Create deployment package
        run: |
          mkdir -p deploy-package
          MODEL_ID="onnx-community/bge-small-zh-v1.5-ONNX" MODEL_DIR="$PWD/deploy-package/models/bge-small-zh-v1.5" bash deploy/prepare-embedding-model.sh
          cp -r apps/server/dist deploy-package/
          cp -r apps/server/scripts deploy-package/server-scripts
          cp -r apps/web/dist deploy-package/web-dist
          cp -r apps/server/prisma deploy-package/
          cp package.json pnpm-lock.yaml pnpm-workspace.yaml deploy-package/
          cp -r apps/server/package.json deploy-package/server-package.json
          cp -r apps/web/package.json deploy-package/web-package.json
          cp ecosystem.config.cjs deploy-package/
          cp deploy/init-env.sh deploy-package/
          tar czf deploy.tar.gz -C deploy-package .
```

- [ ] **Step 4: 在 VPS 解包后把模型放到固定目录**

在 `Deploy to VPS` 脚本中，解压后增加：

```bash
mkdir -p /opt/morechat/models
rm -rf /opt/morechat/models/bge-small-zh-v1.5
mv models/bge-small-zh-v1.5 /opt/morechat/models/bge-small-zh-v1.5
```

同时在 `.env` 写入前设置：

```bash
export EMBEDDING_ENABLED="true"
export EMBEDDING_MODEL_PATH="/opt/morechat/models/bge-small-zh-v1.5"
```

并保证 `init-env.sh` 会写出这两个变量。

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml deploy/prepare-embedding-model.sh
git commit -m "feat(deploy): preload embedding model in deployment package"
```

---

## Task 4: 增加本地 / CI 验证与文档约束

**Files:**
- Modify: `docs/2026-04-26-deploy-handoff.md`
- Modify: `docs/superpowers/plans/2026-04-25-phase2d-summary-generation.md`（若存在则更新约束）
- Modify: `docs/superpowers/plans/2026-04-25-phase2e-topic-clustering.md`（若存在则更新约束）
- Create: `docs/superpowers/plans/2026-04-26-embedding-model-preload-followups.md`（若 2D/2E 计划尚不存在）

- [ ] **Step 1: 在交接文档中补充新的生产策略**

在 `docs/2026-04-26-deploy-handoff.md` 的“建议后续动作”后追加：

```md
6. 生产环境不再依赖 Hugging Face 在线下载 embedding 模型；部署阶段预置 `onnx-community/bge-small-zh-v1.5-ONNX` 到 `/opt/morechat/models/bge-small-zh-v1.5`。
7. 运行时必须优先使用 `EMBEDDING_MODEL_PATH`，并保留 `EMBEDDING_ENABLED=false` 的显式关闭能力。
8. 后续任何依赖远程模型/API 的功能都必须软失败，禁止阻塞主服务启动。
```

- [ ] **Step 2: 若后续 2D/2E 计划已存在，则把硬约束写入计划头部；若不存在，则创建 follow-up 约束文档**

创建 `docs/superpowers/plans/2026-04-26-embedding-model-preload-followups.md`：

```md
# Embedding Model Preload Follow-up Constraints

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 记录后续语义功能（2D/2E）必须遵守的部署与运行时约束

**Architecture:** 后续所有依赖 embedding / 远程资源的能力必须优先使用本地模型目录，并在资源不可用时软失败降级。

**Tech Stack:** 文档约束，无代码改动

---

- [ ] 新增 logger 调用必须使用 `{ err: error }` 对象形式。
- [ ] 不允许隐式 any。
- [ ] 任何远程资源依赖必须软失败，不能阻塞主服务启动。
- [ ] 新增依赖前必须验证 CI/VPS 可安装；禁止把下载型 postinstall 依赖留到部署时暴露。
```

- [ ] **Step 3: Commit**

```bash
git add docs/2026-04-26-deploy-handoff.md docs/superpowers/plans/2026-04-26-embedding-model-preload-followups.md
git commit -m "docs: record production embedding preload constraints"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** 覆盖了模型预下载、部署产物打包、服务器本地模型路径、运行时本地优先加载、软失败降级，以及后续 subagent 的硬约束落地。
- [x] **No placeholders:** 所有步骤给出具体脚本、命令和代码。
- [x] **Type consistency:** EmbeddingService 使用 `getModelSource()` + `EMBEDDING_MODEL_PATH` / `EMBEDDING_ENABLED`；与当前 deploy handoff 中的降级策略一致。
- [x] **File paths:** 全部路径明确。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-26-production-embedding-model-preload.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
