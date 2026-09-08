# Contributing to Rhythm Forge

感谢你帮助改进 Rhythm Forge。提交改动前请确认：

1. 使用 Node.js 24 或更新的 LTS 版本。
2. 运行 `npm ci` 安装锁定依赖。
3. 运行 `npm run typecheck` 和 `npm run build`。
4. 音频调度必须以 `AudioContext.currentTime` 为时间源，不能用普通定时器作为节拍真值。
5. 新增第三方采样或素材时，必须同时提交清晰的来源和许可证。

建议从小而明确的 Issue 开始，通过功能分支提交 Pull Request。请不要在同一个 PR 中混入无关的大规模重构。
