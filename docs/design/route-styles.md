# 路由 CSS 精简（2026-10-10）

## 范围与审计

只改变 `custom/redefine/nijika/head.ejs` 中现有 stylesheet 的加载条件，不改 CSS 声明、不更换加载顺序、不动态注入样式。

- `studio.css`：组件来自 `nijika/studio.ejs` 及 `studio.js` 生成的六轨编排控件。`on`、`soft`、`playing` 等状态选择器都由 studio 组件限定；`eyebrow` 规则也限定在 `.studio-mast` 内。仅 `page.nijika === 'studio'` 加载。
- `reader.css`：阅读主布局属于 `nijika/post.ejs`；普通 Hexo page 的回退布局也使用它，包括空内容 page。保持与 `page.ejs` 的六个专用栏目分派一致。`series.ejs` 的原题单介绍使用 `.article-body`，会启用 notebook/code 模块，因此 `page.introHtml` 存在时也加载。文章一律保留。
- `archive.css`：不能只放到笔记页。它同时定义全局 `.live-dialog`、`.live-dialog-tools`、`.live-status`、`.queue-row` 等，阅读队列、灯光台、离线管理、录音带和札记对话框会使用，继续在所有页面加载。
- 菜单、搜索、节拍弹窗、调光台以及日夜/动效规则跨路由共享。其余现有全局样式保守保留，包括 `stage-engine.css`、`navigation-scenes.css`。原有 livehouse/practice/projects/content-catalog 条件不变。
- 审计覆盖全部定制 EJS、`page.ejs` 分派、Hexo 生成器和前端 JS 中相关类名。未发现项目内 `.agents/skills`。

## 源字节减少

按本轮 `source/atelier/css` 的文件长度计算，不代表压缩后的网络传输，也没有测速结论：

| 页面 | 少加载的源样式 | 源字节减少 |
| --- | --- | ---: |
| 封面、创作室、笔记、分页、归档、项目/研究/生活/关于、留言、小屋、排练室等 | reader.css + studio.css | 20,791 |
| 文章、普通 page 阅读回退、含原题单介绍的 Hot100 专题 | studio.css | 9,713 |
| 节奏实验室 | reader.css | 11,078 |

CSS 文件仍可直接访问，公共对话框依赖保持全局。未知 page 继续走阅读回退，不根据 URL 路径推断，因此 `/lab/` 子目录部署不受影响。

## 验证

`node --test tests/route-styles.test.cjs`：4/4 通过。直接使用当前 EJS 渲染器覆盖 root 和 `/lab/` 两种 URL 前缀，检查 23 类路由/页面状态、共享依赖、原加载顺序、无重复 stylesheet、空文章/空普通 page、专题介绍、现有条件样式、内容工具类，以及 `page.ejs` 分派一致性。

本次未运行 Hexo、未写 `public/`，以避免与其他任务并发生成；完整构建及已生成页面集成验证由主任务统一调度。浏览器被其他任务使用，真实桌面/移动、日光/夜场视觉验收仍待进行。没有据模板测试宣称视觉或网络性能通过。
