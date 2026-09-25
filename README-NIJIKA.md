# CC Atelier · Nijika

在 Hexo / Redefine 上定制的虹夏 Live House 博客。入口封面、创作室与阅读区分开，所有文章使用真实静态 URL。开发分支为 `nijika`，基于 `main` 的 `b9c4357`；此实现没有部署到线上。

## 开发与验证

本轮视觉精修：顶部「日光 / 夜场」拨片在所有页面可用，模式在刷新和页面间保持；日光模式使用暖纸色、深棕文字与独立封面。字号由阅读工作台统一管理，仅点字号按钮或滑杆时变化。新增水彩手账、套色演出海报和像素小舞台，分别用于笔记、节奏实验室及后台小屋；[图片与完整生成提示](docs/design/nijika-daylight-art.md)。

```sh
npm ci
npm run server -- -p 4318
npm test
npm run test:fixtures
```

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
| 博客标题、域名、文章设置 | `_config.yml` |
| 主题、图像、GitHub 链接、动效默认值 | `_config.redefine.yml` |
| 模板覆盖的注册入口 | `scripts/nijika.js` |
| 封面、菜单、各栏目、阅读模板 | `custom/redefine/` |
| 全局构图 / 文章适配 / 特效 | `source/atelier/css/stage.css`（新构图） / `atelier.css` / `content.css` / `effects.css` |
| 搜索、动效、阅读工具、节奏台 | `source/atelier/js/` |
| 正式文章 | `source/_posts/` |

文章继续用 Hexo Markdown 编写；frontmatter 的 `categories`、`tags`、可选 `cover` 会进入相应页面。保留了原有 `Hello-CC-Atelier.md` 及链接。Hexo 自带教程移到了 `_drafts/hello-world.md`，不会作为个人文章发布。

项目、研究、生活与关于页目前沿用已确认的内容和留白状态。增加真实项目或个人信息时，修改对应的 `custom/redefine/nijika/*.ejs`；这些栏目没有伪造的文章。设置 `nijika.cursor: false` 可恢复系统鼠标，`nijika.motion: false` 可关闭默认动效。

## 与 Redefine 的关系

固定使用 `hexo-theme-redefine@2.9.0`，不修改 `node_modules`。`before_generate` 通过 Hexo 的主题视图接口装载项目内 EJS；升级主题后应重新运行全部验证。

保留并使用 Redefine 的 Markdown 过滤器、代码容器与高亮样式、图片说明、写作标签（tabs / folding 等）、文章目录 partial、配置导出以及标签页脚本。样式通过 `redefine.styl` 引入；带正文的页面加载上游 Tailwind 工具类。分类、标签、归档、分页由 Hexo 原生成器提供；搜索索引由 `hexo-generator-searchdb` 提供。

集成脚本也修正了 SearchDB 与 Hexo 8 自定义 permalink 拼接时产生的重复斜线，避免搜索链接被误解析成外站地址。修改 `custom/` 模板或 `scripts/` 后重新启动开发服务；文章和 `source/` 样式改动由 Hexo 监听。

项目定制层负责独立封面、整套布局、文章展示、全屏目录、搜索弹窗、日夜模式、指针与点击反馈、阅读进度、图片查看、代码复制和可选节奏台。没有加载上游整站主脚本，以免两套导航、弹窗和主题控制互相覆盖。

音乐不会自动播放。节奏台由 Web Audio 合成鼓点，关闭弹窗、切换后台或离开页面即停止；不包含音乐录音。动效遵循系统“减少动态效果”，也可在页脚手动关闭并记住偏好。手机保留系统指针行为。无 JavaScript 时保留原生页面链接、底部导航和完整标签页正文。

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


## 舞台档案与文章迁移（2026-09-24）

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


## After Hours 后台小屋（2026-09-24）

- `/lounge/`：随机手记 / Hot100、阅读歌单与最近阅读、五枚栏目印章、可下载 SVG 票根、每日原创小签、鼓机、25/5 分钟专注计时、三种灯光和三角挂件。
- 文章页：收藏、掌声、分享链接、专注阅读、三档字号、阅读时长估计、页面访问数、断点续读、独立留言。
- `/guestbook/`：昵称与四种小印章，不需要邮箱或 GitHub 登录；留言审核后公开。
- `/about/`：CC 通行证、已确认研究方向、GitHub、真实文章/题目/标签数量及最近文章。
- `/admin/`：管理口令登录，审核、收起留言、回复；会话六小时有效。未加载 JavaScript 时表单禁用，口令不会经默认 GET 进入地址栏。
- `/atom.xml`：最近 20 篇普通手记的 Atom 订阅；`?` 查看操作小抄，Ctrl/⌘ + K 搜索。

收藏、最近阅读、阅读进度、票根、灯光、字号和计时仅保存在浏览器 localStorage。存储受限时给出不能持久化的提示，当前页面使用内存降级；不伪称跨页面保存。鼓机只在主动操作后发声，关闭、切到后台或离开页面即停止。倒计时按实际结束时间计算，刷新、休眠或后退恢复不会重置剩余时长，到时不自动播放声音。

### 完整本地预览

使用 Node 24、`npm ci` 后生成页面。先创建仅本机保存的 `.dev.vars`，放入随机、至少 24 字符的 `ADMIN_SECRET`；本轮开发已创建该文件，不要覆盖已有口令。它已被 Git 忽略，不能放进 EJS、Hexo 配置或 `public/`。

```sh
node node_modules/hexo/bin/hexo generate
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config wrangler.local.jsonc
node node_modules/wrangler/bin/wrangler.js dev --config wrangler.local.jsonc --port 4319 --ip 127.0.0.1 --show-interactive-dev-session=false
```

打开 `http://127.0.0.1:4319/`，后台在 `/admin/`，管理口令是本机 `.dev.vars` 的 `ADMIN_SECRET` 值。修改模板、脚本或素材后重新运行 Hexo generate。本地 SQLite 数据保存在被 Git 忽略的 `.wrangler/state/`，重启预览仍保留。本地页面明确标注“本地预览数据”；4318 是旧的纯静态预览，完整互动请使用 4319。

### 数据口径与实现

- 访客是随机 HttpOnly / SameSite Cookie 区分的浏览器，不是真实人数。数据库只保存其加盐哈希；清除 Cookie、换浏览器会再次计入。
- 同一浏览器同一页面在固定半小时窗口内只记一次到访；掌声每个浏览器每篇一次。数据库唯一约束和触发器处理重复提交。
- 留言为纯文本，服务端验证长度、同源写入、蜜罐和频率限制；公开接口只返回通过审核的数据。昵称上限 24 字，留言/回复上限 1200 字。不采集邮箱、定位或设备指纹。速率限制仅临时保留 IP 的加盐哈希，不存原始 IP。
- 评论每 10 分钟每 IP 最多 3 条；后台登录最多 5 次。修改管理口令会使现有管理会话失效，也会改变访客哈希口径。
- 共享统计、留言与掌声依赖同域 `/api/*`；主内容和本地阅读功能仍可独立使用。每日小签是本站原创，不冒充角色台词。

### 发布边界

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

## Live Archive 深度升级（2026-09-24）

- 全站：WebGL 追光、星尘与点击涟漪，真实音序与分析器驱动灯光；页脚调光台可选暖金、朱红、月蓝并调整强度。系统减少动态、后台停帧、阅读降噪均生效。
- `/notes/`：109 篇全文检索，组合筛选和可分享查询，唱片架/曲目表/真实文章主题星图，阅读队列与完成轨迹。
- 文章：三栏阅读排版、文内查找、章节深链、排版偏好、可定位的选区札记、代码工作台、朗读和主动离线保存。
- `/studio/`：六轨 16/32 步音序器、力度与混音、BPM/TAP/swing、预设/撤销、波形/频谱、项目本机保存与 JSON 备份、44.1kHz 立体声 WAV 导出。

完整入口、存储边界和维护说明见 [Live Archive 使用说明](docs/design/live-archive-guide.md)。本轮验证：37 项自动测试、含 `/lab/` 的 fixture 构建、1440/820/390 视口、真实停服离线阅读、音序演奏和 WAV 导出、批注及队列持久化。独立审查发现的六项问题已修复并增加回归测试。完整记录见 [验收台账](docs/design/live-archive-ledger.md)。
