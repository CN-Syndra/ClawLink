/**
 * Skill Config Utilities
 * Direct read/write access to skill configuration in ~/.openclaw/openclaw.json
 * This bypasses the Gateway RPC for faster and more reliable config updates.
 *
 * All file I/O uses async fs/promises to avoid blocking the main thread.
 */
import { readFile, writeFile, access, cp, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { constants } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getOpenClawDir } from './paths';
import { logger } from './logger';

const OPENCLAW_CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json');

interface SkillEntry {
    enabled?: boolean;
    apiKey?: string;
    env?: Record<string, string>;
}

interface OpenClawConfig {
    skills?: {
        entries?: Record<string, SkillEntry>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

async function fileExists(p: string): Promise<boolean> {
    try { await access(p, constants.F_OK); return true; } catch { return false; }
}

/**
 * Read the current OpenClaw config
 */
async function readConfig(): Promise<OpenClawConfig> {
    if (!(await fileExists(OPENCLAW_CONFIG_PATH))) {
        return {};
    }
    try {
        const raw = await readFile(OPENCLAW_CONFIG_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Failed to read openclaw config:', err);
        return {};
    }
}

/**
 * Write the OpenClaw config
 */
async function writeConfig(config: OpenClawConfig): Promise<void> {
    const json = JSON.stringify(config, null, 2);
    await writeFile(OPENCLAW_CONFIG_PATH, json, 'utf-8');
}

/**
 * Get skill config
 */
export async function getSkillConfig(skillKey: string): Promise<SkillEntry | undefined> {
    const config = await readConfig();
    return config.skills?.entries?.[skillKey];
}

/**
 * Update skill config (apiKey and env)
 */
export async function updateSkillConfig(
    skillKey: string,
    updates: { apiKey?: string; env?: Record<string, string> }
): Promise<{ success: boolean; error?: string }> {
    try {
        const config = await readConfig();

        // Ensure skills.entries exists
        if (!config.skills) {
            config.skills = {};
        }
        if (!config.skills.entries) {
            config.skills.entries = {};
        }

        // Get or create skill entry
        const entry = config.skills.entries[skillKey] || {};

        // Update apiKey
        if (updates.apiKey !== undefined) {
            const trimmed = updates.apiKey.trim();
            if (trimmed) {
                entry.apiKey = trimmed;
            } else {
                delete entry.apiKey;
            }
        }

        // Update env
        if (updates.env !== undefined) {
            const newEnv: Record<string, string> = {};

            for (const [key, value] of Object.entries(updates.env)) {
                const trimmedKey = key.trim();
                if (!trimmedKey) continue;

                const trimmedVal = value.trim();
                if (trimmedVal) {
                    newEnv[trimmedKey] = trimmedVal;
                }
            }

            if (Object.keys(newEnv).length > 0) {
                entry.env = newEnv;
            } else {
                delete entry.env;
            }
        }

        // Save entry back
        config.skills.entries[skillKey] = entry;

        await writeConfig(config);
        return { success: true };
    } catch (err) {
        console.error('Failed to update skill config:', err);
        return { success: false, error: String(err) };
    }
}

/**
 * Get all skill configs (for syncing to frontend)
 */
export async function getAllSkillConfigs(): Promise<Record<string, SkillEntry>> {
    const config = await readConfig();
    return config.skills?.entries || {};
}

/**
 * Force deploy all resources (skills + prompts) to ~/.openclaw/.
 * Overwrites existing files. Used by Setup wizard and Settings "Deploy Resources" button.
 */
export async function forceDeployResources(): Promise<{ skills: number; prompts: number }> {
    const { app } = await import('electron');
    const { cpSync, mkdirSync, readdirSync } = await import('node:fs');
    const resourcesPath = process.resourcesPath || app.getPath('resourcesPath');
    const existsSyncFs = existsSync; // use the module-level import
    let skillCount = 0;
    let promptCount = 0;

    // 1. Deploy skills (force overwrite)
    const skillsRoot = join(homedir(), '.openclaw', 'skills');
    for (const skill of BUILTIN_SKILLS) {
        const { slug } = skill;
        let sourceDir: string;
        if ('resources' in skill && skill.resources) {
            sourceDir = join(resourcesPath, 'resources', 'skills', slug);
        } else {
            const { sourceExtension } = skill;
            const openclawDir = getOpenClawDir();
            sourceDir = join(openclawDir, 'extensions', sourceExtension, 'skills', slug);
        }
        if (!existsSyncFs(join(sourceDir, 'SKILL.md'))) {
            // Dev fallback
            const devSource = join(process.cwd(), 'resources', 'skills', slug);
            if (existsSyncFs(join(devSource, 'SKILL.md'))) {
                sourceDir = devSource;
            } else { continue; }
        }
        try {
            const targetDir = join(skillsRoot, slug);
            if (!existsSyncFs(targetDir)) mkdirSync(targetDir, { recursive: true });
            cpSync(sourceDir, targetDir, { recursive: true, force: true });
            skillCount++;
            logger.info(`Deployed skill: ${slug}`);
        } catch (error) {
            logger.warn(`Failed to deploy skill ${slug}:`, error);
        }
    }

    // 2. Deploy prompts (force overwrite)
    const promptsDir = join(homedir(), '.openclaw', 'clawlink-prompts');
    if (!existsSyncFs(promptsDir)) mkdirSync(promptsDir, { recursive: true });

    const bundledPaths = app.isPackaged
        ? [join(resourcesPath, 'resources', 'clawlink-prompts'), join(resourcesPath, 'app.asar.unpacked', 'resources', 'clawlink-prompts')]
        : [join(app.getAppPath(), 'resources', 'clawlink-prompts'), join(process.cwd(), 'resources', 'clawlink-prompts')];

    for (const bundledPath of bundledPaths) {
        if (existsSyncFs(bundledPath)) {
            try {
                const files = readdirSync(bundledPath).filter(f => f.endsWith('.txt'));
                for (const file of files) {
                    cpSync(join(bundledPath, file), join(promptsDir, file));
                    promptCount++;
                }
            } catch { /* ignore */ }
            break;
        }
    }

    logger.info(`Resources deployed: ${skillCount} skills, ${promptCount} prompts`);
    return { skills: skillCount, prompts: promptCount };
}

/**
 * Built-in skills bundled with ClawLink that should be pre-deployed to
 * ~/.openclaw/skills/ on first launch.  These come from the openclaw package's
 * extensions directory or app resources, and are available in both dev and packaged builds.
 *
 * sourceExtension: copy from openclawDir/extensions/{sourceExtension}/skills/{slug}
 * resources:       copy from app resources/skills/{slug}
 */
const BUILTIN_SKILLS = [
    // From openclaw extensions
    { slug: 'feishu-doc',   sourceExtension: 'feishu' },
    { slug: 'feishu-drive', sourceExtension: 'feishu' },
    { slug: 'feishu-perm',  sourceExtension: 'feishu' },
    { slug: 'feishu-wiki',  sourceExtension: 'feishu' },
    // From app resources (ClawLink bundled)
    { slug: 'clawlink-notify', resources: true },
    { slug: 'clawlink-send-file', resources: true },
] as const;

/**
 * Ensure built-in skills are deployed to ~/.openclaw/skills/<slug>/.
 * Skips any skill that already has a SKILL.md present (idempotent).
 * Runs at app startup; all errors are logged and swallowed so they never
 * block the normal startup flow.
 */
export async function ensureBuiltinSkillsInstalled(): Promise<void> {
    const skillsRoot = join(homedir(), '.openclaw', 'skills');

    // Import app module dynamically to get the resources path
    const { app } = await import('electron');
    const resourcesPath = process.resourcesPath || app.getPath('resourcesPath');

    for (const skill of BUILTIN_SKILLS) {
        const { slug } = skill;
        const targetDir = join(skillsRoot, slug);
        const targetManifest = join(targetDir, 'SKILL.md');

        if (existsSync(targetManifest)) {
            continue; // already installed
        }

        let sourceDir: string;

        // Determine source directory based on skill type
        if ('resources' in skill && skill.resources) {
            // Copy from app resources/skills/
            sourceDir = join(resourcesPath, 'resources', 'skills', slug);
        } else {
            // Copy from openclaw extensions
            const { sourceExtension } = skill;
            const openclawDir = getOpenClawDir();
            sourceDir = join(openclawDir, 'extensions', sourceExtension, 'skills', slug);
        }

        if (!existsSync(join(sourceDir, 'SKILL.md'))) {
            logger.warn(`Built-in skill source not found, skipping: ${sourceDir}`);
            continue;
        }

        try {
            await mkdir(targetDir, { recursive: true });
            await cp(sourceDir, targetDir, { recursive: true });
            logger.info(`Installed built-in skill: ${slug} -> ${targetDir}`);
        } catch (error) {
            logger.warn(`Failed to install built-in skill ${slug}:`, error);
        }
    }
}
