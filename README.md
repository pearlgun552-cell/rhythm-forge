# Rhythm Forge Desktop MVP

[![Windows Build](https://github.com/pearlgun552-cell/rhythm-forge/actions/workflows/windows-build.yml/badge.svg)](https://github.com/pearlgun552-cell/rhythm-forge/actions/workflows/windows-build.yml)

面向音游曲创作的本地桌面音乐制作软件骨架。当前版本覆盖项目数据、基础复音合成器、采样钢琴、电脑键盘演奏与录入、Piano Roll、音频时钟调度和多音轨编辑。

## 技术栈

- Electron：桌面应用外壳
- React + TypeScript：界面与类型系统
- Vite：开发与构建
- Web Audio API：PolySynth、ADSR 和音频调度
- Salamander Grand Piano：本地多采样 Yamaha C5 钢琴音色（CC BY 3.0）
- `localStorage`：本地项目保存

没有使用 Tone.js；当前音频需求很小，直接基于 Web Audio API 能减少依赖，并让调度与 Hanging Notes 处理更明确。

## Windows 用户直接使用

每次推送到 `main` 后，GitHub Actions 都会生成 Windows x64 便携版：

1. 打开仓库的 **Actions → Windows Build**。
2. 进入最新一次成功的构建。
3. 在 **Artifacts** 下载 `Rhythm-Forge-Windows-x64`。
4. 解压后双击 `Rhythm Forge.exe`。

当前 Windows 构建尚未购买商业代码签名证书，因此系统可能显示 SmartScreen 提示。源码和构建流程全部公开，可以在仓库中核对。

## 本地开发

需要 Node.js 24 和 Git。Windows PowerShell、macOS Terminal 均可运行：

```bash
git clone https://github.com/pearlgun552-cell/rhythm-forge.git
cd rhythm-forge
npm ci
npm run dev
```

仓库内的 `.npmrc` 使用项目本地缓存，因此不会依赖或修改机器上的全局 npm 缓存。

`npm run dev` 会同时启动 Vite 和 Electron。只调试网页界面时可运行：

```bash
npm run dev:web
```

生产构建与启动：

```bash
npm run build
npm start
```

生成 Windows x64 便携版：

```bash
npm run package:win
```

Windows 产物位于 `release/Rhythm Forge-win32-x64/`。

生成可直接打开的 Apple Silicon macOS 应用：

```bash
npm run package:mac
```

产物位于 `release/Rhythm Forge-darwin-arm64/Rhythm Forge.app`。

## 操作

- `A W S E D F T G Y H U J K`：演奏当前音轨的 Synth
- `R` 或顶部红色 `●`：开始 / 结束电脑键盘录音；录音会自动播放 Transport，并把按键时值按 1/16 拍写入当前音轨
- `Z / X`：降低 / 升高八度
- `Space`：播放 / 暂停
- 右侧 `Sound Engine`：每条音轨可在 Poly Synth 与 Grand Piano 之间切换
- 点击 Piano Roll 网格：按 1/16 拍创建音符
- 点击音符后按 `Delete` 或 `Backspace`：删除音符
- 左侧 `+ Add Instrument Track`：添加独立音轨
- 直接编辑音轨名称输入框：重命名

## 目录

```text
electron/             Electron 主进程
src/audio/            AudioEngine 与 PolySynth
src/sequencer/        AudioContext 时钟调度与 Transport 状态
src/piano-roll/       Piano Roll 编辑视图
src/instruments/      电脑键盘映射与演奏逻辑
src/project/          默认项目与工厂函数
src/store/            统一 Project Store
src/components/       Transport、Track、Arrangement、Instrument UI
src/types/            核心音乐数据类型
src/utils/            通用工具
```

## 调度说明

音符开始和结束由 `AudioConext.currentTime` 排程。25 ms 的定时器只唤醒 120 ms 前瞻调度窗口，不作为音乐时间源；UI 播放头通过动画帧读取 Transport 位置。Pause / Stop 会取消所有活动和预排程 Voice，防止 Hanging Notes。

## 当前边界

固定 16 小节循环；Piano Roll 支持创建、选择、删除和电脑键盘录入，但尚无拖动、缩放、多选、复制粘贴与手动量化。本轮没有混音台、音频轨、麦克风录音、导出、VST、AI 或云功能。

钢琴采样署名和许可证见 `public/samples/piano/LICENSE.md`。

## 开源许可

应用源代码使用 [MIT License](LICENSE)。Salamander Grand Piano 采样使用 CC BY 3.0，具体署名见 [采样许可证](public/samples/piano/LICENSE.md)。参与开发请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
