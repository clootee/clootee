// 内置项目模板元数据（数据配置，无逻辑）。
// 每个模板对应 templates/<id>.CLAUDE.md 与 templates/<id>.AGENTS.md 两份文本，
// 选用后写入新项目根目录，帮小白一开始就带上合理的开发规范（双语/双主题/记忆/松耦合等）。
import * as path from 'path';

export interface BuiltinTemplate {
  id: string;
  label: { zh: string; en: string }; // 双语显示名
  desc: { zh: string; en: string }; // 一句话说明
}

export const TemplatesConfig = {
  // 模板文本所在目录（随源码下发）
  DIR: path.join(__dirname, 'templates'),

  // 内置模板清单（顺序即展示顺序）
  builtin: [
    {
      id: 'daily-office',
      label: { zh: '日常办公模板', en: 'Daily Office' },
      desc: {
        zh: '写材料/整理表格/做报告，文件命名与目录约定 + 记忆',
        en: 'Docs, spreadsheets & reports — naming/folder conventions + memory',
      },
    },
    {
      id: 'web-tool',
      label: { zh: '网页工具模板 (TS)', en: 'Web Tool (TS)' },
      desc: { zh: 'TypeScript + HTML 网页工具，含 UI 规范、双语、双主题', en: 'TypeScript + HTML web tool with UI norms, i18n & theming' },
    },
    {
      id: 'app-fullstack',
      label: { zh: '开发应用 (前后端 TS)', en: 'App (Full-stack TS)' },
      desc: {
        zh: 'TS 前后端 + SQLite，模块化分层、默认双语、双主题',
        en: 'TS front & back end + SQLite, modular layering, bilingual by default, dual themes',
      },
    },
    {
      id: 'web-game-2d',
      label: { zh: '网页游戏·平面 (TS)', en: 'Web Game · 2D (TS)' },
      desc: {
        zh: 'TS + Canvas 平面小游戏，手机触屏/电脑键鼠双端 + 双语',
        en: 'TS + Canvas 2D game, touch & mouse-keyboard on both platforms + i18n',
      },
    },
    {
      id: 'web-game-3d',
      label: { zh: '网页游戏·3D (TS)', en: 'Web Game · 3D (TS)' },
      desc: {
        zh: 'TS + WebGL 3D 小游戏，手机触屏/电脑键鼠双端 + 双语',
        en: 'TS + WebGL 3D game, touch & mouse-keyboard on both platforms + i18n',
      },
    },
    {
      id: 'python-tool',
      label: { zh: 'Python 工具模板', en: 'Python Tool' },
      desc: { zh: 'Python 命令行/脚本工具，含工程规范 + 记忆', en: 'Python CLI/script tool with engineering norms + memory' },
    },
  ] as BuiltinTemplate[],
};
