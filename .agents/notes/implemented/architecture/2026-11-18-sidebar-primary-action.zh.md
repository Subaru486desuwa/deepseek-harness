# Agent Note: 侧边栏主操作注册

Status: implemented

[English](2026-11-18-sidebar-primary-action.md) | 中文

## 问题

插件新增带有自身新建项的顶层主面板后，无法把这个新建操作放到用户寻找它的位置。侧边栏的 New Session 按钮、macOS 窗口标题栏控件、展开态品牌与 `session.new` 快捷键都会启动 Session。插件的新建按钮只能放在面板列表下方，而四个显眼的入口创建的是另一种东西。

## 决策

ui-sidebar 拥有[主操作](../../../../docs/glossary.zh.md#primary-action)，并提供 `ctx.sidebarPrimaryAction.register(action)`。注册项包含 `id`、`label`、`icon`、`run`、可选的 `priority` 与可选的 `blocked` 原因来源。存活注册项中优先级最低的一项生效，同一优先级的重复注册会抛错，与 single slot 的遮蔽规则一致。没有注册项时 New Session 生效，其行为、埋点与 `session/create` 限制都不变。

四个入口都通过同一个函数分派。`session.new` 快捷键也改由 ui-sidebar 而非 ui-workspace 注册。命令 id 与默认绑定不变，因此已保存的快捷键覆盖仍然生效。目录中的标签跟随生效的操作；操作被阻止时，快捷键报告原因而不运行。插件只提供标签与图标组件；按钮、tooltip、快捷键提示与无障碍名称仍由侧边栏负责。

## 考虑过的替代方案

**`sidebar.primary.action` 之类的组件 slot。** slot 可以替换可见按钮，但快捷键与窗口标题栏控件需要可调用的操作和阻止状态。只提供组件时，它们仍会启动 Session，否则每个入口都需要自己的 slot。

**并排的两个新建按钮。** 用户始终能看到两个操作，但狭窄栏顶部要容纳两个控件。快捷键也需要第二个绑定，或者需要规则从两者中选择一个。

**每个面板列表行上的内联新建控件。** 它很紧凑，但悬停才出现的控件难以发现，在触控设备上也不可用。面板行是单个按钮，嵌套第二个交互控件会改变其无障碍语义。

**用于初始主面板的 Harness 设置。** 想成为启动面板的插件可以在其面板注册后自行选中一次。Harness 设置会指向可能永不注册的面板，而客户端没有“所有插件都已加载”的时间点来报告这一问题。

## 后果

插件只能在其上下文生效期间把自己的新建操作设为显眼操作，清理注册后 New Session 立即恢复。移动快捷键后，ui-sidebar 拥有原本由 ui-workspace 注册的命令；ui-workspace 保留 `startSession` 作为回退操作的实现。快捷键服务只在注册与切换语言时重新读取标签，因此生效操作变化时重新注册快捷键是刷新目录标签的唯一方式。插件操作不是官方埋点入口，因此只上报 New Session 点击。
