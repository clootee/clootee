# AGENTS 指南 · Python 工具

面向自动化编码代理的协作约定，与本目录 `CLAUDE.md` 一致，请同步维护。

## 开始前 / 结束后
- 任务前读根目录 `mem.md`；完成后把进展、方案取舍、坑写回 `mem.md`。

## 硬性约定
- Python 3.10+，虚拟环境隔离，依赖锁定；全量 type hints，`mypy`/`pyright` + `ruff`/`black` 检查通过。
- **启动与部署**：长驻服务一律 **pm2** 启动（`ecosystem.config.js` 解释器指向 venv 里的 python，配 `pm2 save`），禁止裸 `python xxx.py` 前台跑当正式服务。**端口先检测再用**（`socket.bind` 捕 `OSError`；Windows `netstat -ano | findstr :<port>`、Linux `lsof -i:<port>`），被占用则顺延到下一个可用端口或报错退出并说明是谁占的，**禁止杀别人的进程**；实际端口打印到日志并写入 `.runtime-port`。**每次启动先跑构建/校验（mypy、ruff、pytest）再切版本**，产物先进临时目录成功后原子替换，失败保留旧版本继续服务，**不影响上一个正在使用的版本**。完成后主动告知需重启的服务与命令。
- 分层松耦合：CLI 入口只编排；核心逻辑纯函数、可单测、不直接 IO；副作用集中在边界层。复用优先。
- 用标准 `logging`（带级别开关），不散落 `print`；异常统一在边界处理，信息可读。
- 入口校验非法输入，错误信息含函数名与非法值。
- 关键逻辑写 `pytest`；路径用 `pathlib`，跨平台差异 `sys.platform` 运行时判断。
- 含用户文案则 zh / en 双语走字典，不硬编码。

## 完成标准
- 关键命令本地运行无报错，mypy/ruff/pytest 通过；按项目约定提交。
