/**
 * Tool Detection Service
 *
 * Handles detection, path resolution, and version verification for:
 * - ADB (Android Debug Bridge)
 * - scrcpy (Screen Copy)
 * - FFmpeg (Media processing engine)
 * - ffprobe (Multimedia stream analyzer)
 *
 * Features:
 * - Direct verification of configured executable paths via `-version`
 * - Standard path search ONLY when configured path is empty
 * - Version extraction and validation
 * - Prevention of false "Installed" statuses before execution check
 */

import { execFile, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type ToolType = 'adb' | 'scrcpy' | 'ffmpeg' | 'ffprobe';
export type ToolStatus = 'installed' | 'missing' | 'error';

export interface ToolInfo {
  name: string;
  toolType: ToolType;
  status: ToolStatus;
  path?: string;
  version?: string;
  error?: string;
}

export interface SystemToolsInfo {
  adb: ToolInfo;
  scrcpy: ToolInfo;
  ffmpeg: ToolInfo;
  ffprobe?: ToolInfo;
}

interface ToolDefinition {
  displayName: string;
  binaryName: string;
  defaultPaths: string[];
  versionArgs: string[];
  versionRegex: RegExp;
}

export class ToolDetectionService {
  private toolDefinitions: Record<ToolType, ToolDefinition>;

  constructor() {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    this.toolDefinitions = {
      adb: {
        displayName: 'ADB',
        binaryName: 'adb.exe',
        defaultPaths: [
          'C:\\Android\\platform-tools\\adb.exe',
          'C:\\platform-tools\\adb.exe',
          path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
          path.join(programFiles, 'Android', 'platform-tools', 'adb.exe'),
          path.join(programFilesX86, 'Android', 'platform-tools', 'adb.exe'),
        ],
        versionArgs: ['version'],
        versionRegex: /Android Debug Bridge version ([\d.]+)/i,
      },
      scrcpy: {
        displayName: 'scrcpy',
        binaryName: 'scrcpy.exe',
        defaultPaths: [
          'C:\\Android\\scrcpy\\scrcpy.exe',
          'C:\\scrcpy\\scrcpy.exe',
          path.join(programFiles, 'scrcpy', 'scrcpy.exe'),
          path.join(localAppData, 'Programs', 'scrcpy', 'scrcpy.exe'),
        ],
        versionArgs: ['--version'],
        versionRegex: /scrcpy ([\d.]+)/i,
      },
      ffmpeg: {
        displayName: 'FFmpeg',
        binaryName: 'ffmpeg.exe',
        defaultPaths: [
          'C:\\ffmpeg\\bin\\ffmpeg.exe',
          'C:\\ffmpeg\\ffmpeg.exe',
          path.join(programFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'),
          path.join(localAppData, 'Programs', 'ffmpeg', 'bin', 'ffmpeg.exe'),
        ],
        versionArgs: ['-version'],
        versionRegex: /ffmpeg version ([\S]+)/i,
      },
      ffprobe: {
        displayName: 'ffprobe',
        binaryName: 'ffprobe.exe',
        defaultPaths: [
          'C:\\ffmpeg\\bin\\ffprobe.exe',
          'C:\\ffmpeg\\ffprobe.exe',
          path.join(programFiles, 'ffmpeg', 'bin', 'ffprobe.exe'),
          path.join(localAppData, 'Programs', 'ffmpeg', 'bin', 'ffprobe.exe'),
        ],
        versionArgs: ['-version'],
        versionRegex: /ffprobe version ([\S]+)/i,
      },
    };
  }

  /**
   * Execute and verify a specific executable path.
   * Runs the tool with its version arguments.
   * Returns 'installed' ONLY if the binary executes successfully and output is verified.
   */
  public async verifyExecutable(tool: ToolType, exePath: string): Promise<ToolInfo> {
    const def = this.toolDefinitions[tool];

    // Check file existence
    if (!fs.existsSync(exePath)) {
      return {
        name: def.displayName,
        toolType: tool,
        status: 'missing',
        path: exePath,
        error: `Executable file not found: ${exePath}`,
      };
    }

    try {
      const stats = fs.statSync(exePath);
      if (!stats.isFile()) {
        return {
          name: def.displayName,
          toolType: tool,
          status: 'error',
          path: exePath,
          error: `Path is not a file: ${exePath}`,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        name: def.displayName,
        toolType: tool,
        status: 'error',
        path: exePath,
        error: `Cannot access executable: ${msg}`,
      };
    }

    // Execute with version argument to verify
    return new Promise((resolve) => {
      try {
        execFile(
          exePath,
          def.versionArgs,
          { timeout: 4000, windowsHide: true },
          (error, stdout, stderr) => {
            if (error) {
              const errMsg = error.message || `Process exited with code ${error.code}`;
              resolve({
                name: def.displayName,
                toolType: tool,
                status: 'error',
                path: exePath,
                error: `Validation failed: ${errMsg}`,
              });
              return;
            }

            const combinedOutput = (stdout || '') + ' ' + (stderr || '');
            const match = combinedOutput.match(def.versionRegex);

            if (match && match[1]) {
              resolve({
                name: def.displayName,
                toolType: tool,
                status: 'installed',
                path: exePath,
                version: match[1],
              });
            } else {
              // Program ran successfully with code 0
              const firstLine = combinedOutput.trim().split('\n')[0] || 'Validated';
              resolve({
                name: def.displayName,
                toolType: tool,
                status: 'installed',
                path: exePath,
                version: firstLine.substring(0, 35),
              });
            }
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({
          name: def.displayName,
          toolType: tool,
          status: 'error',
          path: exePath,
          error: `Execution error: ${msg}`,
        });
      }
    });
  }

  /**
   * Detect a tool.
   * If a configured path is provided, it validates ONLY that path and does NOT search standard paths.
   * Searches standard installation locations and PATH ONLY when configuredPath is empty.
   */
  public async detectTool(tool: ToolType, configuredPath?: string): Promise<ToolInfo> {
    const def = this.toolDefinitions[tool];

    // 1. Configured executable path provided:
    // Strictly validate the configured path without searching standard locations.
    if (configuredPath && configuredPath.trim()) {
      const customPath = path.resolve(configuredPath.trim());
      return this.verifyExecutable(tool, customPath);
    }

    // 2. Configured path is empty:
    // Search Windows PATH, Registry PATH, WinGet packages, and standard installation locations.
    const candidates: string[] = [];
    const checkedDirs = new Set<string>();

    // Helper to add search dir
    const addDir = (dir: string) => {
      const trimmed = dir.trim();
      if (trimmed && !checkedDirs.has(trimmed)) {
        checkedDirs.add(trimmed);
        candidates.push(path.join(trimmed, def.binaryName));
      }
    };

    // Check process.env.PATH
    const pathEnv = process.env.PATH || '';
    for (const dir of pathEnv.split(path.delimiter)) {
      addDir(dir);
    }

    // On Windows, also query fresh HKCU Environment Path from registry (picks up newly installed winget packages immediately)
    if (process.platform === 'win32') {
      try {
        const regOut = execSync('reg query "HKCU\\Environment" /v Path', {
          encoding: 'utf-8',
          windowsHide: true,
          timeout: 2000,
        });
        const match = regOut.match(/Path\s+REG_\S+\s+(.+)/i);
        if (match && match[1]) {
          for (let p of match[1].split(';')) {
            p = p.trim().replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
            if (p) addDir(p);
          }
        }
      } catch {
        // Ignore registry query error
      }
    }

    // Check WinGet Packages directory directly (e.g. Gyan.FFmpeg.Essentials)
    const localAppData = process.env.LOCALAPPDATA || '';
    const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPackages)) {
      try {
        const pkgs = fs.readdirSync(wingetPackages);
        for (const pkg of pkgs) {
          if (pkg.toLowerCase().includes(tool === 'scrcpy' ? 'scrcpy' : 'ffmpeg')) {
            const pkgDir = path.join(wingetPackages, pkg);
            const subs = fs.readdirSync(pkgDir);
            for (const s of subs) {
              const subBin = path.join(pkgDir, s, 'bin');
              if (fs.existsSync(subBin)) addDir(subBin);
              if (fs.existsSync(path.join(pkgDir, s))) addDir(path.join(pkgDir, s));
            }
          }
        }
      } catch {
        // Ignore WinGet read errors
      }
    }

    // Check standard default installation paths
    for (const defaultPath of def.defaultPaths) {
      if (!candidates.includes(defaultPath)) {
        candidates.push(defaultPath);
      }
    }

    let firstError: string | undefined;

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const result = await this.verifyExecutable(tool, candidate);
        if (result.status === 'installed') {
          return result;
        }
        if (!firstError && result.error) {
          firstError = result.error;
        }
      }
    }

    return {
      name: def.displayName,
      toolType: tool,
      status: firstError ? 'error' : 'missing',
      error:
        firstError ||
        `Not found in PATH or standard installation directories (e.g., ${def.defaultPaths[0]}). Please configure the path.`,
    };
  }

  /**
   * Detect all tools: ADB, scrcpy, FFmpeg, and ffprobe
   */
  public async detectAll(paths: {
    adbPath?: string;
    scrcpyPath?: string;
    ffmpegPath?: string;
    ffprobePath?: string;
  } = {}): Promise<SystemToolsInfo> {
    // If ffprobePath is empty but ffmpegPath is configured, check if ffprobe sits next to ffmpeg
    let effectiveFfprobePath = paths.ffprobePath;
    if (!effectiveFfprobePath && paths.ffmpegPath && paths.ffmpegPath.trim()) {
      const siblingFfprobe = path.join(path.dirname(paths.ffmpegPath.trim()), 'ffprobe.exe');
      if (fs.existsSync(siblingFfprobe)) {
        effectiveFfprobePath = siblingFfprobe;
      }
    }

    const [adb, scrcpy, ffmpeg, ffprobe] = await Promise.all([
      this.detectTool('adb', paths.adbPath),
      this.detectTool('scrcpy', paths.scrcpyPath),
      this.detectTool('ffmpeg', paths.ffmpegPath),
      this.detectTool('ffprobe', effectiveFfprobePath),
    ]);

    return { adb, scrcpy, ffmpeg, ffprobe };
  }
}
