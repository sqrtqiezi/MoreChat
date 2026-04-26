# Embedding Model Preload Follow-up Constraints

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 记录后续语义功能（2D/2E）必须遵守的部署与运行时约束

**Architecture:** 后续所有依赖 embedding / 远程资源的能力必须优先使用本地模型目录，并在资源不可用时软失败降级。

**Tech Stack:** 文档约束，无代码改动

---

- [ ] 新增 logger 调用必须使用 `{ err: error }` 对象形式。
- [ ] 不允许隐式 any。
- [ ] 任何远程资源依赖必须软失败，不能阻塞主服务启动。
- [ ] 新增依赖前必须验证 CI/VPS 可安装；禁止把下载型 postinstall 依赖留到部署时暴露.
