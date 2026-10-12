# CC Atelier × Nijika — V1

## 放置位置
- `_config.redefine.yml` → Hexo 项目根目录
- `source/css/ccatelier.css` → 对应目录
- `source/js/ccatelier.js` → 对应目录

## 根 `_config.yml` 建议修改
```yaml
title: CC Atelier
subtitle: Code · Research · Life · Rhythm
description: 记录代码、研究、项目、生活，以及一些喜欢的东西。
keywords:
  - AI Agent
  - Database
  - Text-to-SQL
  - Projects
  - Notes
author: CC
language: zh-CN
url: https://ccatelier.top
theme: redefine
```

如果希望按北京时间显示，再设置：
```yaml
timezone: Asia/Shanghai
```

## 搜索依赖
V1 已开启 Redefine 本地搜索：
```bash
npm install hexo-generator-searchdb --save
```

如果暂时不装，就把 `_config.redefine.yml` 里的：
```yaml
navbar:
  search:
    enable: false
```

## 本地测试
```bash
npm run clean
npm run build
npm run server
```

然后访问：
```text
http://localhost:4000
```
