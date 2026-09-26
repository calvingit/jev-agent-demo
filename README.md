# Jev Feasibility Lab

一个可行性对照实验 Demo：在通用 reasoning model 之前增加 Jev（TypeSafe System One）作为快速语义判断层，是否改善客服场景的意图识别与路由判断，其 latency / token 成本是否值得。

对应设计文档：《Jev 客服 Agent Demo 设计文档》。界面为中文，内置用例的非中文对话附中文翻译（仅展示，不参与模型调用）。

## 界面预览

![单条测试](docs/screenshots/zh_single_results.png)
![批量汇总](docs/screenshots/zh_batch_summary.png)

## 运行

```bash
npm install
cp .env.example .env   # 填入真实 key
npm run dev            # http://localhost:3000
npm test               # 确定性逻辑单元测试（node:test）
npm run build          # 生产构建
```

`.env`（不入库，见 `.env.example`）：

```
JEV_BASE_URL=https://api.typesafe.ai/v1/systemone   # 或 API root，客户端会自动归一化
JEV_API_KEY=apikey_…
JEV_MODEL=jev-latest

OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_KEY=sk-…
OPENAI_MODEL=deepseek-flash
```

Key 只存在于服务端；模型设置里输入的 key 仅随单次请求发送，不落库、不进导出、不进日志。

## 两条实验路径

```
WITHOUT JEV:  Conversation ──────────────────► Reasoning Model ─► AgentDecision
WITH JEV:     Conversation ─► Jev /systemOne ─► Reasoning Model ─► AgentDecision
                              (Noul signals)
```

- **Jev**：官方 `@typesafe-ai/sdk`，一次 `systemOne()` 携带 10 个命名 Noul 问题（7 个意图 + needsHumanReview / frustrated / topicChanged），`retry.maxRetries = 0`（不污染 latency / 错误率）。
- **Reasoning**：OpenAI-compatible `/chat/completions`，两路径共用同一 system prompt、temperature 与输出 schema（`{intents, needsHumanReview, response}`）；With-Jev 仅额外注入一段 signals 提示。
- **共享路由策略** `deriveRoute(intents, needsHumanReview)`：needsHumanReview 或 refund/cancel 意图 → 转人工。Baseline 的 needsHumanReview 来自模型自评，With-Jev 来自 Jev Noul——机制相同，信号来源即实验变量。
- Noul 阈值固定 0.5，原始 probability 全程保留（导出可离线重算 threshold）。
- 错误显式进入结果（`network/timeout/http/invalid_response/schema_validation/unknown`），绝不生成伪造 signals 或默认成功。

## 功能

- **单条测试**：会话编辑（增/删/改消息），左右并排对比 不加 / 加 Jev（概率条、意图、路由、回复、Jev/推理/总延迟、Token、调用次数）。
- **批量测试**：数据集列表（内置 18 条 + 导入的数据集，可切换/查看/删除），JSON / CSV 导入、并发 1/2/4/8、进度、汇总（意图 F1 / 路由准确率 / 人工审核召回率 / 平均·P95 延迟 / Token / 错误数）、Jev 延迟分布（平均/P50/P95/最小/最大）、逐用例对比表（改善/变差/相同/不同/错误 过滤）、明细弹窗、导出 JSON（不含 API Key）。
- 内置用例覆盖：单意图、多意图、退款、取消、人工升级、受挫客户、话题切换、隐式意图、多语言（英/中/印尼/泰/越/葡）、混合语言，含 2 条无 ground truth（只能显示 相同/不同）。

## 结构

```
src/lib/            types / errors / prompts / routing / runners / comparison / metrics
  jev/              questions(Noul) · client(TypeSafe SDK) · evaluator(signals)
  reasoning/        client(OpenAI-compatible) · decision(schema 校验)
  cases.ts import.ts export.ts labels.ts server-config.ts defaults.ts
src/app/api/        evaluate（双路径并行）/ config-defaults（不含 key）
src/components/     SingleTest / BatchTest / DatasetList / ResultPanels / SettingsDialog / CaseDetail / ui
tests/unit.test.ts  阈值转换、schema 校验、路由策略、对比分类、F1、百分位、导出脱敏、错误映射、导入
docs/screenshots/   界面截图（含 GUI 测试证据）
```
