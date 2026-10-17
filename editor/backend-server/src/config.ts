/**
 * P9.1 — 数据路径治理：区分开发目录、安装目录和用户数据目录。
 *
 * 产品承诺：安装包更新不会覆盖用户个人状态。因此：
 * 1. personal.sqlite 和 evidence 只允许写在「用户数据目录」（Windows:
 *    %APPDATA%/org-engine；其余: ~/.org-engine-editor；Electron 启动时
 *    用 ORG_ENGINE_HOME 覆盖为 app.getPath('userData')）。
 * 2. 安装目录（含 app.asar）永远只读——任何写入请求都被拒绝。
 * 3. 首次启动创建数据目录并写入权限说明，之后重启不再重复。
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { isAbsolute, join, dirname, sep } from 'node:path';

export interface DataPaths {
  /** 安装目录（只读；asar 内直接暴露） */
  installDir: string;
  /** 用户数据目录（唯一可写根） */
  userDataDir: string;
  /** 个人 SQLite 路径（始终在 userDataDir 内） */
  personalDbPath: string;
  /** 证据存储目录 */
  evidenceDir: string;
}

/** 判定路径是否在安装介质/asar 内——这类路径绝不允许写用户数据。 */
export function isInstallPath(p: string): boolean {
  const norm = p.replace(/\\/g, '/').toLowerCase();
  return norm.includes('app.asar') || norm.includes('/program files/') || norm.endsWith('/app.bundle');
}

/**
 * 解析三个目录。优先级：
 * ORG_ENGINE_HOME（Electron 传 app.getPath('userData')）>
 * %APPDATA%/org-engine（Windows）> ~/.org-engine-editor。
 */
export function resolveDataPaths(
  env: NodeJS.ProcessEnv = process.env,
  installHint = dirname(process.execPath ?? process.argv[1] ?? '.'),
): DataPaths {
  const installDir = installHint;
  let userDataDir = env.ORG_ENGINE_HOME ?? '';
  if (!userDataDir) {
    if (process.platform === 'win32' && env.APPDATA) {
      userDataDir = join(env.APPDATA, 'org-engine');
    } else {
      userDataDir = join(env.USERPROFILE ?? env.HOME ?? '.', '.org-engine-editor');
    }
  }
  const personalDbPath = join(userDataDir, 'personal', 'personal.sqlite');
  const evidenceDir = join(userDataDir, 'evidence');
  return { installDir, userDataDir, personalDbPath, evidenceDir };
}

/**
 * 数据目录安全检查：拒绝把个人数据写进安装目录/asar。
 * 验收核心：安装包更新不会覆盖用户个人状态。
 */
export function assertWritableDataDir(paths: DataPaths): void {
  if (isInstallPath(paths.userDataDir)) {
    throw new Error(
      `用户数据目录不能位于安装介质内：${paths.userDataDir}（个人数据只允许写在用户目录）`,
    );
  }
}

/**
 * 首次启动初始化：创建数据目录结构 + 权限说明文件。
 * 幂等——重启/升级后再调用不会覆盖任何已有内容。
 */
export function firstRunInit(
  paths: DataPaths,
  mkdir = mkdirSync,
  writeFile = writeFileSync,
  exists = existsSync,
): { created: boolean; permissionsFile: string } {
  assertWritableDataDir(paths);
  mkdir(paths.userDataDir, { recursive: true });
  mkdir(dirname(paths.personalDbPath), { recursive: true });
  mkdir(paths.evidenceDir, { recursive: true });
  const permissionsFile = join(paths.userDataDir, '权限说明.md');
  if (!exists(permissionsFile)) {
    writeFile(
      permissionsFile,
      [
        '# 你的数据在哪里',
        '',
        `- 个人数据库：${paths.personalDbPath}`,
        `- 证据文件：${paths.evidenceDir}`,
        '',
        '## 系统对你数据的三条承诺',
        '',
        '1. 原文件永不修改：整理结果一律保存为草稿。',
        '2. 高风险动作（发送、删除、付款、提交）默认禁止，需要你逐项确认。',
        '3. 升级软件不会动这个目录里的任何内容；卸载前会提示备份。',
        '',
      ].join('\n'),
    );
    return { created: true, permissionsFile };
  }
  return { created: false, permissionsFile };
}
