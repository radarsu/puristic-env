import { type ChildProcess, fork } from "node:child_process";
import type { LeafDescriptorPublic, ValidationReport } from "@puristic/env/index.js";
import type { ConfigHostRequest, ConfigHostResponse } from "./protocol.js";

export interface ConfigHostOptions {
    // Path to the forked entry: dist/configHost.mjs in production, the src .ts in tests.
    entryPath: string;
    // Absolute path to the env.config.* file this client introspects.
    configPath: string;
    // Working directory for module resolution — the config's project root.
    projectRoot: string;
    // A Node 24+ binary (native TS type-stripping). MUST NOT be the extension host's Electron node.
    nodePath: string;
    timeoutMs: number;
}

interface Pending {
    resolve: (response: ConfigHostResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class ConfigHostClient {
    private child: ChildProcess | undefined;
    private nextId = 1;
    private readonly pending = new Map<number, Pending>();

    constructor(private readonly options: ConfigHostOptions) {}

    async introspect(): Promise<LeafDescriptorPublic[]> {
        const response = await this.request({ id: this.nextId++, op: "introspect" });
        if (!response.ok) {
            throw new Error(response.error.message);
        }
        if (response.op !== "introspect") {
            throw new Error(`config-host: unexpected response op ${response.op}`);
        }
        return response.descriptors;
    }

    async validate(values: Record<string, string>): Promise<ValidationReport> {
        const response = await this.request({ id: this.nextId++, op: "validate", values });
        if (!response.ok) {
            throw new Error(response.error.message);
        }
        if (response.op !== "validate") {
            throw new Error(`config-host: unexpected response op ${response.op}`);
        }
        return response.report;
    }

    restart(): void {
        this.dispose();
    }

    dispose(): void {
        this.child?.kill();
        this.child = undefined;
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error("config-host disposed"));
        }
        this.pending.clear();
    }

    private ensureChild(): ChildProcess {
        if (this.child?.connected) {
            return this.child;
        }
        const child = fork(this.options.entryPath, [this.options.configPath], {
            cwd: this.options.projectRoot,
            execPath: this.options.nodePath,
            stdio: ["ignore", "pipe", "pipe", "ipc"],
        });
        child.on("message", (message) => this.onMessage(message as ConfigHostResponse));
        child.on("exit", (code) => this.onExit(code));
        this.child = child;
        return child;
    }

    private onMessage(response: ConfigHostResponse): void {
        const pending = this.pending.get(response.id);
        if (pending === undefined) {
            return;
        }
        clearTimeout(pending.timer);
        this.pending.delete(response.id);
        pending.resolve(response);
    }

    private onExit(code: number | null): void {
        this.child = undefined;
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error(`config-host exited (code ${code ?? "unknown"})`));
        }
        this.pending.clear();
    }

    private request(request: ConfigHostRequest): Promise<ConfigHostResponse> {
        const child = this.ensureChild();
        return new Promise<ConfigHostResponse>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(request.id);
                reject(new Error(`config-host timed out after ${this.options.timeoutMs}ms`));
            }, this.options.timeoutMs);
            this.pending.set(request.id, { resolve, reject, timer });
            child.send(request);
        });
    }
}
