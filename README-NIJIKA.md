# CC Atelier · Nijika

在 Hexo / Redefine 上定制的虹夏 Live House 博客。入口封面与文章目录分开，所有文章使用真实静态 URL。开发分支为 `nijika`，基于 `main` 的 `b9c4357`；此实现没有部署到线上。

## 开发与验证

```sh
npm ci
npm run server -- -p 4318
npm test
npm run test:fixtures
```

访问 `http://localhost:4318/`。发布仍使用项目原有的 Hexo 构建产物 `public/`，无需额外服务端。`npm run build` 生成站点。

如果 Windows 的 `npm` 命令被系统目录中的同名空文件遮挡，可使用本机已安装的 Node/npm CLI；直接运行 Hexo 的等价命令为：

```sh
node node_modules/hexo/bin/hexo generate
node node_modules/hexo/bin/hexo server -p 4318
node --test tests/*.test.cjs
node tests/fixture-build.cjs
```

`test:fixtures` 只在被 Git 忽略的 `.nijika-qa/` 内生成验证文章。它检查十篇文章的分页、长标题、代码、表格、目录、标签页、Unicode 分类和 `/lab/` 子目录部署，不会增加正式文章。

## 从哪里维护

| 内容 | 位置 |
| --- | --- |
| 博客标题、域名、文章设置 | `_config.yml` |
| 主题、图像、GitHub 链接、动效默认值 | `_config.redefine.yml` |
| 模板覆盖的注册入口 | `scripts/nijika.js` |
| 封面、菜单、各栏目、阅读模板 | `custom/redefine/` |
| 全局构图 / 文章适配 / 特效 | `source/atelier/css/atelier.css` / `content.css` / `effects.css` |
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

人物素材均为现有官方图像，页面右下角有来源入口，没有使用 AI 生成人物。

| 本地文件 | 原始页面 |
| --- | --- |
| `ep05-3.jpg` | [TV 第 5 话官方剧照](https://bocchi.rocks/tv/story/?id=05) |
| `ep08-4.jpg` | [TV 第 8 话官方剧照](https://bocchi.rocks/tv/story/?id=08) |
| `nijika.png` | [官方虹夏角色立绘](https://bocchi.rocks/omnibus/character/nijika.html) |

图像版权归原权利人；来源标注不改变其权利。字体为本地 Barlow Condensed 和 DM Sans，OFL 许可文件随字体保存在 `source/atelier/fonts/`。图标、发饰形指针、唱片与光效由 SVG/CSS 实现。
