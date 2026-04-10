import { Router, Request, Response } from "express";
import { isAuthenticated } from "../auth/google";
import logger from "../logger";

const router = Router();

const GITHUB_REPO = "drmauij/Privatklinik-Kreuzlingen";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function getAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
  return key;
}

function getGithubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  return token;
}

async function githubApi(method: string, path: string, body?: unknown) {
  const resp = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getGithubToken()}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`GitHub ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function getFile(path: string) {
  try {
    const data = await githubApi("GET", `/repos/${GITHUB_REPO}/contents/${path}?ref=main`);
    return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
  } catch {
    return null;
  }
}

async function putFile(path: string, content: string, message: string, sha?: string) {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString("base64"),
    branch: "main",
  };
  if (sha) body.sha = sha;
  return githubApi("PUT", `/repos/${GITHUB_REPO}/contents/${path}`, body);
}

async function listFiles(path = "") {
  try {
    const data = await githubApi("GET", `/repos/${GITHUB_REPO}/contents/${path}?ref=main`);
    if (Array.isArray(data)) {
      return data.map((f: { name: string; type: string; path: string }) => `${f.type === "dir" ? "dir" : "file"} ${f.path}`);
    }
    return [];
  } catch {
    return [];
  }
}

// Tools
const tools = [
  {
    name: "read_file",
    description: "Read a file from the website repo.",
    input_schema: {
      type: "object" as const,
      properties: { path: { type: "string" as const, description: "File path relative to repo root" } },
      required: ["path"],
    },
  },
  {
    name: "replace_in_file",
    description: "Find-and-replace exact strings in a file. ALWAYS use this for edits instead of write_file. Each replacement finds one exact string and replaces it. All replacements are applied and committed atomically.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "File path relative to repo root" },
        replacements: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              old: { type: "string" as const, description: "Exact text to find" },
              new: { type: "string" as const, description: "Text to replace it with" },
            },
            required: ["old", "new"],
          },
        },
        commit_message: { type: "string" as const, description: "Git commit message" },
      },
      required: ["path", "replacements", "commit_message"],
    },
  },
  {
    name: "write_file",
    description: "Create a NEW file. For editing existing files, use replace_in_file instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string" as const, description: "File path relative to repo root" },
        content: { type: "string" as const, description: "Full file content" },
        commit_message: { type: "string" as const, description: "Git commit message" },
      },
      required: ["path", "content", "commit_message"],
    },
  },
  {
    name: "list_files",
    description: "List files in a directory.",
    input_schema: {
      type: "object" as const,
      properties: { path: { type: "string" as const, description: "Directory path (empty for root)" } },
      required: ["path"],
    },
  },
];

const SYSTEM_PROMPT = `You are a website editor for Privatklinik Kreuzlingen's clinic website (deployed on Vercel from GitHub).

CRITICAL RULES:
1. For ANY edit to an existing file, ALWAYS use replace_in_file — never write_file. replace_in_file does surgical find-and-replace without rewriting the whole file.
2. Only use write_file to create brand new files.
3. Be concise. After committing, say what you changed.
4. The site auto-deploys on Vercel ~30s after commit.`;

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  logger.info(`[website] executeTool: ${name}`, { path: input.path });
  try {
    switch (name) {
      case "read_file": {
        const file = await getFile(input.path as string);
        if (!file) return `File not found: ${input.path}`;
        return file.content;
      }
      case "replace_in_file": {
        const file = await getFile(input.path as string);
        if (!file) return `File not found: ${input.path}`;
        let content = file.content;
        const replacements = input.replacements as Array<{ old: string; new: string }>;
        const results: string[] = [];
        for (const r of replacements) {
          if (content.includes(r.old)) {
            content = content.split(r.old).join(r.new); // replace all occurrences
            results.push(`OK: "${r.old.slice(0, 40)}" → "${r.new.slice(0, 40)}"`);
          } else {
            results.push(`NOT FOUND: "${r.old.slice(0, 60)}"`);
          }
        }
        if (results.some((r) => r.startsWith("OK"))) {
          await putFile(input.path as string, content, input.commit_message as string, file.sha);
          logger.info(`[website] committed: ${input.path}`);
          return `Committed to main:\n${results.join("\n")}`;
        }
        return `No changes made:\n${results.join("\n")}`;
      }
      case "write_file": {
        const existing = await getFile(input.path as string);
        await putFile(input.path as string, input.content as string, input.commit_message as string, existing?.sha);
        logger.info(`[website] committed new file: ${input.path}`);
        return `File created/updated: ${input.path} — committed to main.`;
      }
      case "list_files": {
        const files = await listFiles(input.path as string);
        return files.length > 0 ? files.join("\n") : `Empty: ${input.path || "/"}`;
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[website] tool error: ${name}`, { error: msg });
    return `ERROR: ${msg}`;
  }
}

// Simple test endpoint to verify the full flow
router.get("/api/website/test", isAuthenticated, async (_req: Request, res: Response) => {
  const results: string[] = [];
  try {
    results.push("1. Testing GitHub list...");
    const files = await listFiles("client/src/pages/treatments");
    results.push(`   Found ${files.length} files`);

    results.push("2. Testing GitHub read...");
    const file = await getFile("client/src/pages/treatments/liposuction.tsx");
    results.push(`   Read ${file?.content.length || 0} chars`);

    results.push("3. Testing Anthropic API...");
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": getAnthropicKey(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 50, messages: [{ role: "user", content: "say ok" }] }),
    });
    const data = await resp.json();
    results.push(`   Status: ${resp.status}, response: ${JSON.stringify(data).slice(0, 100)}`);

    results.push("All tests passed!");
    res.json({ ok: true, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push(`FAILED: ${msg}`);
    res.json({ ok: false, results });
  }
});

const VERCEL_PREVIEW = "https://privatklinik-kreuzlingen.vercel.app/";

// Check Vercel deploy status by etag — client polls this after a commit
router.get("/api/website/deploy-status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const prevEtag = req.query.etag as string | undefined;
    const resp = await fetch(VERCEL_PREVIEW, { method: "HEAD" });
    const etag = resp.headers.get("etag") || "";
    const changed = prevEtag ? etag !== prevEtag : false;
    res.json({ etag, changed });
  } catch {
    res.json({ etag: "", changed: false });
  }
});

// Main chat endpoint
router.post("/api/website/chat", isAuthenticated, async (req: Request, res: Response) => {
  req.setTimeout(180000);
  res.setTimeout(180000);

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    let currentMessages = [...messages];
    const maxIterations = 10;
    const toolLog: string[] = [];

    for (let i = 0; i < maxIterations; i++) {
      logger.info(`[website] Claude API call #${i + 1}, messages: ${currentMessages.length}`);

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": getAnthropicKey(),
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          tools,
          messages: currentMessages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`[website] Anthropic ${response.status}:`, errText.slice(0, 300));
        return res.status(502).json({ error: `Claude API ${response.status}: ${errText.slice(0, 200)}` });
      }

      const data = await response.json() as {
        content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
        stop_reason: string;
      };

      logger.info(`[website] stop_reason=${data.stop_reason}, blocks=${data.content.length}`);

      if (data.stop_reason !== "tool_use") {
        // Final response
        const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        return res.json({
          text: text || "Done.",
          toolLog,
          didWrite: toolLog.some((l) => l.includes("committed") || l.includes("Committed")),
        });
      }

      // Execute tools
      const toolBlocks = data.content.filter((b) => b.type === "tool_use");
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const block of toolBlocks) {
        const toolName = block.name!;
        const toolInput = block.input as Record<string, unknown>;
        const shortPath = (toolInput.path as string) || "";
        toolLog.push(`${toolName}: ${shortPath} ...`);

        const result = await executeTool(toolName, toolInput);
        toolLog[toolLog.length - 1] = `${toolName}: ${shortPath} → ${result.slice(0, 100)}`;

        toolResults.push({ type: "tool_result", tool_use_id: block.id!, content: result });
      }

      currentMessages.push({ role: "assistant", content: data.content });
      currentMessages.push({ role: "user", content: toolResults });
    }

    return res.status(500).json({ error: "Too many iterations" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[website] chat error:", msg);
    return res.status(500).json({ error: msg });
  }
});

export default router;
