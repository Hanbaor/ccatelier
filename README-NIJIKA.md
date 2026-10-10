# CC Atelier · Nijika

CC 的个人网站，基于 Hexo / Redefine，记录代码、研究与生活。首页直接呈现近期笔记、项目与个人入口；虹夏主题插画和声音实验作为兴趣内容保留，文章使用真实静态 URL。

当前开发分支为 `nijika-dot`，线上预览：[nijika-dot 预览站](https://nijika-dot-ccatelier.1242163592.workers.dev/)。生产域名仍由 `_config.yml` 的 `url` 指定为 `https://ccatelier.top`，不要为分支预览改动它。以下维护说明以当前源码为准；末尾记录为历史快照，不代表当前发布状态。

## 开发与验证

使用 Node 24（具体版本见 `package.json`）。修改后运行自动测试与 fixture 构建；界面改动还需检查桌面和手机布局、键盘操作及减少动态效果。自动测试不能替代真实浏览器的画面与音频检查。

```sh
npm ci
npm run server -- -p 4318
npm test
npm run test:fixtures
```

`npm test` 包含从原文原样提取 C++ 代码、以 C++11 和 UBSan 编译运行的验证，需要命令行可用的 `g++`，且支持 `-fsanitize=undefined` 和 `-fno-sanitize-recover=all`。Windows 开发建议在已有且满足这些条件的 WSL 环境中运行。缺少编译器时 Hot100 验证会明确失败，不会跳过或自动安装；网站构建和访客访问本身不需要 C++ 编译器。

访问 `http://localhost:4318/` 可预览静态页面。`npm run build` 生成 `public/`；昵称留言、掌声和访问统计由同域 Cloudflare Worker + D1 提供，完整本地预览使用下方 4319 配置。静态预览会明确提示共享服务未连接。

### WSL 清理报 EACCES 时

如果报错指向 `rmdir '/mnt/d/Projects/CCAtelier/public/'`，先停止使用该目录的 Windows Wrangler 预览（本项目完整预览端口为 4319），再执行 `npm run clean && npm run build`。Windows 预览会占用目录，WSL 即使显示目录可读写也可能无法删除；给目录加 `chmod 777` 或用 `sudo` 不能解除这类进程占用。

日常修改通常直接执行 `npm run build && npm run server` 即可。需要完整清理时，先在预览终端按 Ctrl+C；不要同时对同一个 `public/` 运行清理与 Windows 完整预览。

如果 Windows 的 `npm` 命令被系统目录中的同名空文件遮挡，可使用本机已安装的 Node/npm CLI；直接运行 Hexo 的等价命令为：

```sh
node node_modules/hexo/bin/hexo generate
node node_modules/hexo/bin/hexo server -p 4318
node --test tests/*.test.cjs
node tests/fixture-build.cjs
```

`test:fixtures` 只在被 Git 忽略的 `.nijika-qa/` 内生成验证文章。它用正式文章和九篇验证文章检查分页、长标题、代码、表格、目录、标签页、Unicode 分类和 `/lab/` 子目录部署，不会增加正式文章。

## 从哪里维护

| 内容 | 位置 |
| --- | --- |
| 标题、生产域名、文章设置 | `_config.yml`；主题素材与默认动效在 `_config.redefine.yml` |
| 视图覆盖与路由注册 | `scripts/nijika.js`；其余生成逻辑见 `scripts/` |
| 首页 / 创作室 | `custom/redefine/nijika/cover.ejs` / `stage.ejs`；样式 `source/atelier/css/personal-home.css` |
| 项目 / 研究 / 生活 / 关于 | `custom/redefine/nijika/` 下同名 EJS；页面 frontmatter 在 `source/` 下对应目录的 `index.md` |
| 公共导航与样式加载 | `custom/redefine/nijika/header.ejs`、`footer.ejs`、`head.ejs` |
| 阅读与栏目样式 | `source/atelier/css/reader.css`、`content.css`、`projects.css`、`personal-pages.css`；其余按页面查 `head.ejs` |
| 浏览器入口与按需交互 | `source/atelier/js/main.js`、`route-features.js`；具体功能在同目录模块中 |
| 音乐工作室 / 分享 / MIDI | `source/atelier/js/studio.js`、`studio-core.mjs`、`studio-share.mjs`、`studio-midi.mjs`；声音渲染在 `audio-engine.js` |
| Hot100 筛选与状态 | `custom/redefine/nijika/series.ejs`、`source/atelier/js/series-filter.js`、`tools/content-catalog.cjs` |
| SQL 教学实验 | `custom/redefine/nijika/research.ejs`、`source/atelier/js/research-sql.js` 及同目录 `research-sql-*` 模块 |
| 本地字体交付 | `source/atelier/css/fonts.css`、`source/atelier/fonts/`、`tools/local-font-woff2.py` |
| 现场演出工程 | `source/atelier/js/livehouse-director.js`、`performance-core.mjs`、`performance-transport.mjs`、`performance-store.mjs` |
| 正式文章与内容索引 | `source/_posts/`、`source/_data/hot100.json`、`tools/content-catalog.cjs` |
| 留言、掌声与统计 | `worker/index.mjs`、`worker/migrations/`；本地配置 `wrangler.local.jsonc` |
| 回归验证 | `tests/*.test.cjs`、`tests/fixture-build.cjs`；迁移检查 `tests/test_migration.py` |

首页与创作室的近期文章直接取正式文章数据，不要在模板中另写一份列表。项目页源码包含 CC Atelier、EduRAG 与 Transformer 课程实践；更新介绍时核对真实仓库与实现，源码变化不等同于已发布。研究、生活与关于页也只维护有依据的内容。

样式是分层加载的；修改前先检查 `head.ejs` 的顺序与路由条件。`backstage.css`、`live-art.css`、`rooms-v2.css` 保留给适用页面及未知模板回退，不应重新无条件加载。相关回归见 `tests/route-styles.test.cjs`、`tests/home-navigation.test.cjs`、`tests/personal-pages.test.cjs` 和 `tests/projects-coursework.test.cjs`。

现场导演把鼓点、灯光与 2.5D 景别放在同一工程中；定位播放、暂停续播和本机保存由 `performance-*` 模块配合现场模块实现。维护时同时检查 `tests/performance-core.test.cjs` 与 `tests/livehouse-interaction.test.cjs`，并手动验证播放、拖动定位、暂停和恢复。工程仅保存在当前浏览器，可导出 JSON 备份；录音与排练数据独立保留。

文章继续用 Hexo Markdown 编写；frontmatter 的 `categories`、`tags`、可选 `cover` 会进入相应页面。保留了原有 `Hello-CC-Atelier.md` 及链接。Hexo 自带教程移到了 `source/_drafts/hello-world.md`，不会作为个人文章发布。

设置 `nijika.cursor: false` 可恢复系统鼠标，`nijika.motion: false` 可关闭默认动效。

### 全站入口的生成期交付

`source/atelier/js/` 继续维护原生 ES 模块。`scripts/main-entry.js` 在 Hexo 的 `before_generate` 中使用已锁定的 esbuild 编译入口，再包装原生 page / asset generator，只替换 `atelier/js/main.js` 的 route 数据；不会写回源码，不新增浏览器运行时或 chunk URL。开发 server 的重新生成走同一流程，编译失败会中止本轮生成，不把不完整入口交给 route。

`tools/build-main-entry.cjs` 自动分析全部模块、动态消费者及 `source/` / `custom/` 内独立模板入口，只合并入口独占的静态依赖。共享状态、`import.meta` 所属模块和嵌套目录模块保留原路径，所有 lazy import 与 Worker URL 不变。无法安全界定的新依赖会明确报错，需要先补分析和回归，不能通过忽略警告继续交付。现有主题 tabs 的根前缀表达式仅在分析阶段识别，输出仍使用原表达式。

`tools/module-graph.cjs` 用编译器解析静态依赖，既能检查源码也能检查压缩产物；源码功能预算继续独立测试（少于 25 个模块、100000 B），生成后初始图另设至多 10 个模块、83000 B 的交付预算。离线清单仍保留原模块 URL，保存时缓存生成后的 main，因此不能把初始请求图缩小当作离线文件数减少。字节统计只表示构建体积，不是实测网络流量、LCP 或运行速度。针对性回归：`node --test tests/main-entry-build.test.cjs`。

## 当前功能的维护边界

### 音乐工作室：分享与导出

`/studio/` 的六轨音序器支持 16 / 32 步。分享链接把当前编排与曲名写入 URL 的 `#rhythm=v1.` 片段，不包含本机资料库中的其他项目，也不创建云端项目。接收方打开后只载入编排，需手动播放；可撤销回到载入前状态，不自动保存到本机资料库。打开分享弹窗不会写剪贴板，需点击“复制链接”；失败时选中链接供 Ctrl+C / ⌘C 手动复制。无效、损坏或不支持的版本不会替换当前编排。

- MIDI：导出标准 MIDI 文件（Format 0，单鼓轨、通道 10），支持当前 16 / 32 步及 1 / 2 / 4 轮，保留 BPM、swing 对应的音符时序和力度，遵循静音 / 独奏。用于 DAW 中继续编辑，接收端需配置 GM 鼓组音源；不包含本站合成音色、尾音、效果或混音参数，不能据此还原本站声音。
- WAV：将当前编排渲染成可直接播放的 44.1 kHz / 16 bit 立体声音频，使用所选轮数，适合试听与分享成品声音。
- JSON：保存当前项目的可编辑编排及合成、混音参数，供本站重新导入与备份；不是音频，也不是整个本机资料库的备份。

修改分享编码、鼓音映射或时间规则后，检查 `tests/studio-share.test.cjs`、`tests/studio-midi.test.cjs`、`tests/studio-core.test.cjs`，并手动验证接收不发声、复制失败回退及音频导出。

### Hot100：筛选与内容状态

`/series/hot100/` 支持标题 / 本站题单序号 / 专题搜索，与难度、“仅含代码”组合筛选；序号不是 LeetCode 题号。筛选条件保存在查询参数中，支持分享与前进 / 后退；无 JavaScript 时仍展示完整题单和原生链接。

题数、“已有代码”和“解析待补”由实际文章自动统计，勿在模板另写固定数字。“已有代码”只表示存在代码，不代表全部通过正确性验证。`tools/content-catalog.cjs` 的 `exerciseState` 排除已知占位文字，并对 `source/_posts/hot100/028.md` 的既有空 `addTwoNumbers` 实现按 Hexo 来源路径和代码区段哈希精确识别，不计入“已有代码”并保留原文；不因出现 `Solution` 类就认定实现完整。修改该代码或新增代码区段会退出此特例，之后仍按普通内容存在规则统计，不自动获得正确性保证。

维护时检查 `tests/series-filter.test.cjs`、`tests/content-catalog-source.test.cjs` 与 `tests/content-catalog.test.cjs`；不要为改变统计而补写原作者未完成的解答或改动迁移来源。

### SQL：教学比较与有限反例

`/research/` 使用浏览器内 SQLite（sql.js + Worker）运行内置小数据上的候选 / 参考查询。只读 SELECT / WITH，列按位置比较，值类型、重复次数与行顺序均参与判断；一次结果一致只对当前数据成立。支持草稿 JSON 导入 / 导出，导入不自动执行；查询不自动保存或上传。首次执行按需加载本地 SQLite 资源，需 WebAssembly / Worker，离线可用性不保证。

“缩小反例”只删除当前数据集中的行，按保留行数从少到多搜索，最多 64 个子集，整体限时 1.5 秒。接受的确定性查询子集要求顶层 ORDER BY 和白名单函数，拒绝随机数、时间、连接状态及数据库元数据。只有更少行的全部子集均已比较，才能对这些行的子集给出最小性结论；错误、截断、超时或重复执行不一致时不作此结论。未找到反例不代表对其他数据成立，也不是普适 SQL 等价性证明。只保留声明的 schema 约束，不补充业务外键；排序键并列时不保证跨环境顺序，两次输出一致也不能证明确定性。

查询还受字符数、行列数、单元格长度与内存上限约束，具体值以 `research-sql-core.mjs` 和页面说明为准。执行计划仅展示实际 SELECT 包装的 SQLite 访问路径，不证明正确或更快。反例重放 SQL 应在新的临时 SQLite 数据库中执行。维护入口与边界见 `research-sql-core.mjs`、`research-sql-worker.js`、`research-sql-deterministic.mjs`、`research-sql-minimize.mjs`、`research-sql-snapshot.mjs`；回归见 `tests/research-sql*.test.cjs`。

## 与 Redefine 的关系

固定使用 `hexo-theme-redefine@2.9.0`，不修改 `node_modules`。`before_generate` 通过 Hexo 的主题视图接口装载项目内 EJS；升级主题后应重新运行全部验证。

保留并使用 Redefine 的 Markdown 过滤器、代码容器与高亮样式、图片说明、写作标签（tabs / folding 等）、文章目录 partial、配置导出以及标签页脚本。样式通过 `redefine.styl` 引入；带正文的页面加载上游 Tailwind 工具类。分类、标签、归档、分页由 Hexo 原生成器提供；搜索索引由 `hexo-generator-searchdb` 提供。

集成脚本也修正了 SearchDB 与 Hexo 8 自定义 permalink 拼接时产生的重复斜线，避免搜索链接被误解析成外站地址。修改 `custom/` 模板或 `scripts/` 后重新启动开发服务；文章和 `source/` 样式改动由 Hexo 监听。

项目定制层负责个人首页、栏目布局、文章展示与浏览器交互。没有加载上游整站主脚本，以免两套导航、弹窗和主题控制互相覆盖。

音乐不会自动播放。节奏台由 Web Audio 合成鼓点，关闭弹窗、切换后台或离开页面即停止。动效遵循系统“减少动态效果”，也可在页脚手动关闭并记住偏好。手机保留系统指针行为。无 JavaScript 时保留原生页面链接、底部导航和完整标签页正文。

## 图像与字体来源

保留官方剧照与角色立绘，同时加入经过裁切检查的 AI 辅助主题插画。页面右下角来源入口区分官方素材和同人创作；生成说明见 `docs/design/after-hours-art.md` 与 `docs/design/live-archive-art.md`。

| 本地文件 | 原始页面 |
| --- | --- |
| `ep05-3.jpg` | [TV 第 5 话官方剧照](https://bocchi.rocks/tv/story/?id=05) |
| `ep08-4.jpg` | [TV 第 8 话官方剧照](https://bocchi.rocks/tv/story/?id=08) |
| `nijika.png` | [官方虹夏角色立绘](https://bocchi.rocks/omnibus/character/nijika.html) |
| `nijika-aftershow.png` | AI 辅助同人创作，用于拍立得、留言板及个人页 |
| `backstage-workbench.png` | AI 辅助环境插画，用于后台小屋横幅 |
| `nijika-live-archive.png` | AI 辅助同人插画，用于新版封面与后台宽屏主视觉 |

图像版权归原权利人；来源标注不改变其权利。字体为本地 Barlow Condensed 和 DM Sans，OFL 许可文件随字体保存在 `source/atelier/fonts/`。图标、发饰形指针、唱片与光效由 SVG/CSS 实现。

字体交付采用四个 WOFF2 字重文件：Barlow Condensed 600，以及 DM Sans 400 / 500 / 600；保留原始 TTF 回退和 OFL 文件，不做字形裁剪。`tools/local-font-woff2.py` 默认校验四个文件，附加 `--write` 时从 TTF 重新转换后校验；比较解压后的字体表、字形和度量，不以压缩文件哈希代替一致性验证。Python、fontTools 与 Brotli 仅在重新转换或运行这项字体校验时需要，不是网站运行时依赖，也不是普通 Hexo 构建的前置条件。交付路径、预加载与 `/lab/` 子目录兼容性由 `tests/local-font-delivery.test.cjs` 检查。


## 完整本地预览

使用 Node 24、`npm ci` 后生成页面。先创建仅本机保存的 `.dev.vars`，放入随机、至少 24 字符的 `ADMIN_SECRET`；如文件已存在，不要覆盖已有口令。它已被 Git 忽略，不能放进 EJS、Hexo 配置或 `public/`。

```sh
node node_modules/hexo/bin/hexo generate
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config wrangler.local.jsonc
node node_modules/wrangler/bin/wrangler.js dev --config wrangler.local.jsonc --port 4319 --ip 127.0.0.1 --show-interactive-dev-session=false
```

打开 `http://127.0.0.1:4319/`，后台在 `/admin/`，管理口令是本机 `.dev.vars` 的 `ADMIN_SECRET` 值。修改模板、脚本或素材后重新运行 Hexo generate。本地 SQLite 数据保存在被 Git 忽略的 `.wrangler/state/`，重启预览仍保留。本地页面明确标注“本地预览数据”；4318 是纯静态预览，完整互动请使用 4319。

## 历史演进记录

以下保留当时的设计、迁移与验收记录。栏目布局、功能入口和部署状态可能已改变；日常维护与本地预览以上文和当前源码为准。历史发布命令仅供追溯，不能当作现有站点的部署步骤直接执行。

## 历史：舞台档案与文章迁移（2026-09-24）

- `/`：独立入场封面；`/atelier/`：舞台构图与栏目入口；`/notes/`：全部文章的留声档案，支持筛选普通手记和 Hot100。
- `/series/hot100/`：17 个专题、100 道题；`/hot100/001/` 至 `/hot100/100/` 是独立文章。
- 100 道题不参与普通笔记的日期分页，仍进入搜索、分类、标签和归档。每题前后篇按题单顺序排列。
- 九篇 CSDN 原文迁移为 108 篇文章，加上原有 Hello 共 109 篇。代码与原来的空白题解均保留；没有代写原作者尚未完成的解析。
- 已将 54 处文章配图引用保存到 `source/atelier/images/posts/`，包含对原始 PyTorch 导出中一处损坏嵌套图片语法的修复。
- 六篇网页来源采用其原始发布元数据；三篇下载的 Markdown 采用作者主页的发布时间。来源记录同时保存主页时间与更新时间。
- `docs/content/csdn-migration.json` 保存九个来源与目标路径、素材 URL、内容哈希；原始缓存 `.nijika-import/` 不进入 Git。`source/_data/hot100.json` 保存原题单前言与阅读说明。

迁移工具只读取本地缓存和公开的原文配图，不登录或修改 CSDN。正式文章可继续直接编辑；重跑导入若发现人工修改会停止覆盖。

```sh
python -m pip install -r tools/migration-requirements.txt
python -m unittest discover -s tests -p test_migration.py
python tools/migrate_csdn.py --cache .nijika-import
node node_modules/hexo/bin/hexo generate
python tools/audit_migration.py --cache .nijika-import
```

批量导入时先停止旧的 Hexo 监听服务，生成后可用 `node node_modules/hexo/bin/hexo server -p 4318 --static` 检查构建结果，避免大量文件写入反复触发旧进程。


## 历史：After Hours 后台小屋（2026-09-24）

- `/lounge/`：随机手记 / Hot100、阅读歌单与最近阅读、五枚栏目印章、可下载 SVG 票根、每日原创小签、鼓机、25/5 分钟专注计时、三种灯光和三角挂件。
- 文章页：收藏、掌声、分享链接、专注阅读、三档字号、阅读时长估计、页面访问数、断点续读、独立留言。
- `/guestbook/`：昵称与四种小印章，不需要邮箱或 GitHub 登录；留言审核后公开。
- `/about/`：CC 通行证、已确认研究方向、GitHub、真实文章/题目/标签数量及最近文章。
- `/admin/`：管理口令登录，审核、收起留言、回复；会话六小时有效。未加载 JavaScript 时表单禁用，口令不会经默认 GET 进入地址栏。
- `/atom.xml`：最近 20 篇普通手记的 Atom 订阅；`?` 查看操作小抄，Ctrl/⌘ + K 搜索。

收藏、最近阅读、阅读进度、票根、灯光、字号和计时仅保存在浏览器 localStorage。存储受限时给出不能持久化的提示，当前页面使用内存降级；不伪称跨页面保存。鼓机只在主动操作后发声，关闭、切到后台或离开页面即停止。倒计时按实际结束时间计算，刷新、休眠或后退恢复不会重置剩余时长，到时不自动播放声音。

### 数据口径与实现

- 访客是随机 HttpOnly / SameSite Cookie 区分的浏览器，不是真实人数。数据库只保存其加盐哈希；清除 Cookie、换浏览器会再次计入。
- 同一浏览器同一页面在固定半小时窗口内只记一次到访；掌声每个浏览器每篇一次。数据库唯一约束和触发器处理重复提交。
- 留言为纯文本，服务端验证长度、同源写入、蜜罐和频率限制；公开接口只返回通过审核的数据。昵称上限 24 字，留言/回复上限 1200 字。不采集邮箱、定位或设备指纹。速率限制仅临时保留 IP 的加盐哈希，不存原始 IP。
- 评论每 10 分钟每 IP 最多 3 条；后台登录最多 5 次。修改管理口令会使现有管理会话失效，也会改变访客哈希口径。
- 共享统计、留言与掌声依赖同域 `/api/*`；主内容和本地阅读功能仍可独立使用。每日小签是本站原创，不冒充角色台词。

### 当时的发布边界（历史）

本轮没有部署、创建线上数据库或写入线上数据。`wrangler.jsonc` 已通过 `deploy --dry-run` 校验。正式发布前需在自己的 Cloudflare 账号创建 `ccatelier-community` D1，填入返回的真实 `database_id`，应用迁移并通过 Worker Secret 设置管理口令，再部署；不要将 `wrangler.local.jsonc` 的本地占位 ID 用于线上。

```sh
# 下列是未来正式发布的操作说明，本轮未执行。
node node_modules/wrangler/bin/wrangler.js d1 create ccatelier-community
# 将返回的 database_id 写入 wrangler.jsonc 后：
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote
node node_modules/wrangler/bin/wrangler.js secret put ADMIN_SECRET
node node_modules/wrangler/bin/wrangler.js deploy
```

数据库首次为空时真实计数从零开始，不复制本地测试数字。生产的每小时维护清除过期速率限制与七天前去重窗口，累计访问数保留。保留评论和管理口令备份时应使用 Cloudflare 提供的数据库备份和秘密管理机制。

### 验证

```sh
node node_modules/hexo/bin/hexo generate
node --test tests/*.test.cjs
node tests/fixture-build.cjs
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir .nijika-qa/worker-dry-run
```

`tests/local-community-smoke.mjs` 是显式运行的本地集成检查，只连接 127.0.0.1:4319，读本机口令但不输出。浏览器提交昵称“本地验收”、正文“仅用于本地功能验收：愿下一拍也有回声。”后运行它，可检查待审核→公开回复；最后运行 `node tests/local-community-smoke.mjs --hide` 将验收留言收回，避免混入正式展示。

功能参考：[Anzhiyu 的随机阅读、留言和音乐房](https://github.com/anzhiyu-c/hexo-theme-anzhiyu/blob/dev/_config.yml)、[Heo 的博客更新记录](https://blog.zhheo.com/update/)、[Reimu 的角色主题与发现交互](https://github.com/D-Sketon/hexo-theme-reimu)。只借鉴功能想法，界面与实现按 CC Atelier 的后台主题重新设计。

## 历史：Live Archive 深度升级（2026-09-24）

- 全站：WebGL 追光、星尘与点击涟漪，真实音序与分析器驱动灯光；页脚调光台可选暖金、朱红、月蓝并调整强度。系统减少动态、后台停帧、阅读降噪均生效。
- `/notes/`：109 篇全文检索，组合筛选和可分享查询，唱片架/曲目表/真实文章主题星图，阅读队列与完成轨迹。
- 文章：三栏阅读排版、文内查找、章节深链、排版偏好、可定位的选区札记、代码工作台、朗读和主动离线保存。
- `/studio/practice/`：原创鼓谱排练室。“练习说明与文件”默认收起，可导出当前整份练习的 JSON 或独立 SVG，均使用当前 BPM，不裁剪播放选区。SVG 是本站 16 格练习谱，非官方乐谱或标准专业打谱；导入与导出仅在本机处理，不上传，仅使用原创或已获授权的谱面。
- `/studio/`：六轨 16/32 步音序器、力度与混音、BPM/TAP/swing、预设/撤销、波形/频谱、项目本机保存与 JSON 备份、44.1kHz 立体声 WAV 导出。

完整入口、存储边界和维护说明见 [Live Archive 使用说明](docs/design/live-archive-guide.md)。本轮验证：37 项自动测试、含 `/lab/` 的 fixture 构建、1440/820/390 视口、真实停服离线阅读、音序演奏和 WAV 导出、批注及队列持久化。独立审查发现的六项问题已修复并增加回归测试。完整记录见 [验收台账](docs/design/live-archive-ledger.md)。
