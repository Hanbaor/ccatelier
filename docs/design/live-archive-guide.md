# Live Archive / 使用与维护

本轮修改在真实 Hexo 源码中；Redefine 和原始文章保留。未部署线上。

## 入口

- `/`：新的虹夏主视觉、追光与入场。
- `/atelier/`：后台入口；票根去笔记，唱片去节奏实验室。
- `/notes/`：109 篇全文检索；类型、主题、时长、排序组合；唱片架/曲目表/主题星图。筛选可通过地址栏分享。按 `/` 聚焦搜索。
- 文章页：左侧章节、正文、可折叠工作台；查找上下条、排版、选区札记、语音朗读、离线保存。代码框右上角进入代码工作台。
- `/studio/`：六轨 16/32 步音序、三档力度、音量/声像/音色/尾音、静音/独奏、BPM/TAP/swing、预设和撤销重做；保存/载入项目、导入导出 JSON、1/2/4 轮立体声 WAV。空格播放，A/S/D/F/G/H 即兴敲击。
- 页脚 `◒`：调光台。暖金/朱红/月蓝、亮度/星尘/速度。实际音符和实时分析器驱动光场。

## 数据与降级

队列/偏好在 localStorage，批注/音乐项目在 IndexedDB，均为本机数据。清理浏览器数据会清除；提供 JSON 备份。批注最多 2000 条，锚点上下文失配时明确拒绝错误定位。数据导入验证结构与本站路径，用户文字以纯文本显示。

离线保存是主动操作，在 HTTPS/localhost 可用。每篇保存文档及完整必要资源；不可变快照写完后才切换书架记录，失败不会破坏上次保存。最多 30 篇/每篇 35MB；可移除、更新或释放全部离线副本。在线使用新资源，断网读取对应文章的快照；API、评论、管理页不缓存。页面更新后点“更新”刷新离线版本。

音频不会自动启动；关闭、隐藏或离开时停止。Web Audio 离线渲染为 44.1kHz/16bit/立体声 WAV。浏览器缺少语音/Canvas/WebGL/Worker 时提供可理解的回退。系统减少动态优先于本站动效开关，阅读区自动降低灯光强度。

## 维护

`scripts/live-archive.js` 生成公开 rich index、离线资源清单、根目录 Service Worker。服务工作线程模板位于 `custom/live-sw.template`，不能放入 Hexo 的 `scripts/` 中。

脚本按 archive、reader、notebook/vault、offline、audio/studio、stage-engine 分离；核心数据处理是可测试的 `.mjs` 模块。

验证：`npm test`、`npm run test:fixtures`。使用 Windows 的 Wrangler 本地完整预览时，不要同时删除 public 目录；先停止预览，再运行 clean，以免触发 WSL EACCES 目录锁。

## 技术资料

- [Web Audio 离线渲染](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext)
- [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [View Transitions](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)

新插画及完整生成提示见 [live-archive-art.md](live-archive-art.md)；原有官方素材出处仍可在网页图像来源中查看。
