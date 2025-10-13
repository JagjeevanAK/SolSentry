import { StateGraph, END, START } from "@langchain/langgraph";
import type { WorkflowState } from "../types";
import {
    parseQueryNode,
    fetchDataNode,
    deepDiveSuspiciousAddressesNode,
    analyzeDataNode,
    formatResponseNode
} from "./nodes";

export function createWorkflowGraph() {
    const workflow = new StateGraph<WorkflowState>({
        channels: {
            userQuery: {
                value: (left?: string, right?: string) => right ?? left ?? "",
            },
            extractedAddresses: {
                value: (left?: string[], right?: string[]) => right ?? left ?? [],
            },
            extractedTokens: {
                value: (left?: string[], right?: string[]) => right ?? left ?? [],
            },
            queryType: {
                value: (left?: any, right?: any) => right ?? left ?? null,
            },
            transactions: {
                value: (left?: any[], right?: any[]) => right ?? left ?? [],
            },
            accountInfo: {
                value: (left?: any, right?: any) => right ?? left ?? null,
            },
            analysis: {
                value: (left?: string, right?: string) => right ?? left ?? "",
            },
            error: {
                value: (left?: string | null, right?: string | null) => right ?? left ?? null,
            },
            metadata: {
                value: (left?: any, right?: any) => ({
                    ...(left ?? {}),
                    ...(right ?? {})
                }),
            },
        }
    });

    workflow.addNode("parse_query", parseQueryNode as any);
    workflow.addNode("fetch_data", fetchDataNode as any);
    workflow.addNode("deep_dive", deepDiveSuspiciousAddressesNode as any);
    workflow.addNode("analyze_data", analyzeDataNode as any);
    workflow.addNode("format_response", formatResponseNode as any);

    // @ts-ignore - LangGraph type definitions issue
    workflow.addEdge(START, "parse_query");
    
    workflow.addConditionalEdges(
        // @ts-expect-error
        "parse_query",
        (state: WorkflowState) => {
            if (state.error) {
                return "format_response";
            }
            return "fetch_data";
        }
    );

    workflow.addConditionalEdges(
        // @ts-expect-error
        "fetch_data",
        (state: WorkflowState) => {
            if (state.error) {
                return "format_response";
            }
            return "deep_dive";
        }
    );

    workflow.addConditionalEdges(
        // @ts-expect-error
        "deep_dive",
        (state: WorkflowState) => {
            if (state.error) {
                return "format_response";
            }
            return "analyze_data";
        }
    );

    // @ts-ignore - LangGraph type definitions issue
    workflow.addEdge("analyze_data", "format_response");
    
    // @ts-ignore - LangGraph type definitions issue
    workflow.addEdge("format_response", END);

    return workflow.compile();
}

export async function runWorkflow(userQuery: string): Promise<string> {
    console.log("=".repeat(80));
    console.log("Starting Solana Transaction Analysis Workflow");
    console.log("=".repeat(80));
    console.log(`\nQuery: ${userQuery}\n`);

    const graph = createWorkflowGraph();

    const initialState: WorkflowState = {
        userQuery,
        extractedAddresses: [],
        extractedTokens: [],
        queryType: null,
        transactions: [],
        accountInfo: null,
        analysis: "",
        error: null,
        metadata: {}
    };

    try {
        // @ts-ignore - LangGraph type compatibility
        const result = await graph.invoke(initialState) as WorkflowState;
        
        console.log("\n" + "=".repeat(80));
        console.log("Workflow Complete");
        console.log("=".repeat(80));
        
        return result?.analysis || "No analysis generated";
    } catch (error: any) {
        console.error("Workflow error:", error);
        return `Workflow failed: ${error.message}`;
    }
}
