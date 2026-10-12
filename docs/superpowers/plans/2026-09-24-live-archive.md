# Live Archive Implementation Plan

> Inline execution with superpowers:executing-plans; final independent review per requesting-code-review.

**Goal:** 全面提升内容探索、阅读与音乐交互深度，实现 spec 全部12项。
**Architecture:** Hexo rich index + ES modules/Worker, Canvas graph, IndexedDB notebook, opt-in offline Service Worker, scheduled Web Audio studio.
**Spec:** docs/superpowers/specs/2026-09-24-live-archive.md

## Global constraints
109篇原文不改；Redefine保留；桌面1440/平板820/手机390；无自动音频；不缓存API/admin；无线上部署；本地存储失败必须可见。

## Work units
- [x] S / 整站舞台引擎：stage-engine.js + stage-engine.css +调光台。WebGL追光/粒子/涟漪，音频节奏事件驱动灯光，视差与页面过渡，能力探测、减少动态、隐藏页停帧和阅读抑制。与星图/音频数据联动，不伪造音乐响应。
- [x] A / 数据与发现：scripts/live-archive.js 构建索引和文章关联；archive-core.mjs 查询/过滤/排序/图谱；archive-worker.js 消息处理。先写纯逻辑测试，再实现，验证真实109条与/lab/路径。
- [x] B / notes视觉与星图：替换notes.ejs，archive.css、archive.js、constellation.js。查询URL往返、组合筛选、canvas拖放缩放/选择与列表回退，队列联动，手机实际检查。
- [x] C / 阅读布局：重写post.ejs，reader.css、reader.js。三栏章节轨道，去重渲染标题，章节深链、搜索、阅读偏好/相关内容/朗读，保留社区与Redefine写作模块。
- [x] D / 阅读资料：notebook-core.mjs、notebook.js、vault.js。IndexedDB批注/导出导入、quote上下文定位、队列顺序、阅读完成、轨迹。测试损坏/恶意导入与存储异常。
- [x] E / 代码与离线：code-studio.js、offline.js、service-worker模板。真实代码复制/换行/行定位/下载；opt-in缓存文章与静态依赖、禁止敏感路径，实际离线读取验证。
- [x] F / 音乐实验室：studio-core.mjs、audio-engine.js、studio.js、studio.ejs/css。测试swing时间、pattern校验、history、WAVheader；实现完整混音编排与离线渲染、保存导入导出，浏览器验证声音生命周期。
- [x] G / 新图像与封面：生成/选择新宽屏主视觉，保存本项目，替换cover与stage构图，更新credits及图像记录；保留截图实证。
- [x] H / 综合验收：构建、所有测试、fixture子目录、主流程/离线/键盘/手机/无后端；独立审查，修复后逐项审计spec，更新文档与操作入口。

## Review focus
Unicode/IME检索与恶意查询；存储配额/IndexedDB失败与损坏备份；文章修改后的批注锚点；音频异步开始/停止与后台切换；离线缓存URL范围、失败缓存与服务升级；无WebWorker/语音/Canvas的浏览器。

## Ledger
- Initial state inspected: previous After Hours is uncommitted on nijika; preserve it and evolve it. Goal is a new full upgrade, no prior partial feature counts as this goal complete.
- User's four screenshots show repeated art, oversized empty notes feature, duplicate article heading and detached controls. These are explicit visual defects for the new layout.
