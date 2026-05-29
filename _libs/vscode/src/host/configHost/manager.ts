import * as vscode from "vscode";
import { ConfigHostClient } from "./client.js";

// One config-host subprocess per env.config file (keyed by its absolute path).
export class ConfigHostManager {
    private readonly clients = new Map<string, ConfigHostClient>();

    constructor(private readonly entryPath: string) {}

    get(configPath: string, projectRoot: string): ConfigHostClient {
        const existing = this.clients.get(configPath);
        if (existing !== undefined) {
            return existing;
        }
        const client = new ConfigHostClient({
            entryPath: this.entryPath,
            configPath,
            projectRoot,
            nodePath: this.nodePath(),
            timeoutMs: this.timeoutMs(),
        });
        this.clients.set(configPath, client);
        return client;
    }

    restart(configPath: string): void {
        this.clients.get(configPath)?.dispose();
        this.clients.delete(configPath);
    }

    disposeAll(): void {
        for (const client of this.clients.values()) {
            client.dispose();
        }
        this.clients.clear();
    }

    private nodePath(): string {
        const configured = vscode.workspace.getConfiguration("puristic").get<string>("nodePath") ?? "";
        return configured !== "" ? configured : "node";
    }

    private timeoutMs(): number {
        return vscode.workspace.getConfiguration("puristic").get<number>("configHostTimeoutMs") ?? 10000;
    }
}
