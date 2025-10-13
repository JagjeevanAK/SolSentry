import { runWorkflow } from "./workflow/graph";

export { runWorkflow };

export * from "./utils/helius-api";
export * from "./utils/solscan-api";
export * from "./tools/transaction-tools";
export * from "./types";
export * from "./jobs";

export async function analyzeQuery(userQuery: string): Promise<string> {
    return await runWorkflow(userQuery);
}

