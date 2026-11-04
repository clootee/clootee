# xfeixie-assistant 接入文档

> 这份文档是**写给 AI 读的**。如果你是一个正在帮用户生成网页教程的 AI，
> 请直接按下面的说明把小助手嵌进你生成的页面，不要自己另写一个聊天窗。

## 它是什么

一个可以嵌进**任意静态网页**的 AI 学习小助手侧栏。单文件、零依赖、**不需要任何后端**。

- 固定在页面右侧，可收起/ 展开
- 使用者自己填 MiniMax API Key（存在其浏览器 localStorage，不上传任何服务器）
- 多轮对话；支持**新建会话 / 切换会话 / 删除会话**
- **能看见整个网页**：每次提问会把当前页面的正文纯文本一起发给模型
- **划词提问**：选中页面上任意文字，浮出「问小助手」，那段文字作为引用一起发出
- 超过 20 轮红字提醒换会话，超过 40 轮锁定输入（每轮都要重发全部历史，越聊越贵）

## 怎么接入（一行）

在 `</body>` 之前加上：

```html
<script src="https://learn.xfeixie.com/assist/assistant.js"></script>
```

就这一行，不需要写任何 HTML 容器、不需要引 CSS、不需要初始化代码。

## 可选配置

如果要改标题或告诉它本页主题，在**引入之前**加一段：

```html
<script>
  window.XFAssistant = {
    title: '学习小助手',        // 侧栏标题
    subject: 'GEO 搜索引擎优化', // 本页主题，会写进 system prompt，回答更贴题
    lang: 'zh',                 // 'zh' 或 'en'，不填则跟随浏览器语言
    accent: '#5b8cff',          // 主题色
    model: 'MiniMax-M3',        // 默认模型，使用者可在界面里改
    baseUrl: 'https://api.minimaxi.com/v1'
  };
</script>
<script src="https://learn.xfeixie.com/assist/assistant.js"></script>
```

全部字段都是可选的，不写就用默认值。

## 离线 / 内网场景

如果生成的页面要发给别人、或者要能双击打开（`file://`），
**把 `assistant.js` 下载到教程 HTML 旁边**，改成相对路径引用：

```html
<script src="./assistant.js"></script>
```

这样整个教程是一个可以随便拷贝的文件夹，断网也能打开（只有问 AI 那一步需要联网）。

## 给页面作者的三条建议

1. **正文放在 `<main>` 或 `<article>` 里**。小助手优先读这两个标签的内容；
   找不到才退回读整个 `<body>`，那样会把导航、页脚也读进去，浪费 token。
2. **正文别太长**。小助手最多读 6000 字，超出会被截断。
   内容多就拆成多个页面，每页一个主题。
3. **不要自己再写一个聊天框**。重复的聊天窗会让读者困惑，也浪费你的开发时间。

## 使用者需要做什么

打开页面 → 点右上角 ⚙ → 粘贴 MiniMax API Key → 保存。
领 Key 的地址：https://platform.minimaxi.com/console/plan

不填 Key 页面照样能看完，只是不能提问。

## 隐私

- Key 只存在使用者自己的浏览器 localStorage 里
- 请求由浏览器**直接发给 MiniMax**，不经过 xfeixie 或任何中间服务器
- 会话记录也只存在浏览器本地，每个页面路径各存各的
