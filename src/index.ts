import { runWorkflow, StateAnnotation } from "./workflow/graph";

export async function analyzeQuery(userQuery: string): Promise<string> {
    return await runWorkflow(userQuery);
}

export type { WorkflowState } from "./types";
export { StateAnnotation };

