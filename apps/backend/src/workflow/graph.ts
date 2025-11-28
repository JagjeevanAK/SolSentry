import { StateGraph, Annotation } from "@langchain/langgraph";
import {
    parseQueryNode,
    fetchDataNode,
    deepDiveSuspiciousAddressesNode,
    analyzeDataNode,
    formatResponseNode
} from "./nodes";

export const StateAnnotation = Annotation.Root({
    userQuery: Annotation<string>({
        reducer: (left, right) => right ?? left ?? "",
        default: () => ""
    }),
    extractedAddresses: Annotation<string[]>({
        reducer: (left, right) => right ?? left ?? [],
        default: () => []
    }),
    extractedTokens: Annotation<string[]>({
        reducer: (left, right) => right ?? left ?? [],
        default: () => []
    }),
    queryType: Annotation<"abnormality_detection" | "wallet_analysis" | "transaction_lookup" | "general" | null>({
        reducer: (left, right) => right ?? left ?? null,
        default: () => null
    }),
    transactions: Annotation<any[]>({
        reducer: (left, right) => right ?? left ?? [],
        default: () => []
    }),
    accountInfo: Annotation<any | null>({
        reducer: (left, right) => right ?? left ?? null,
        default: () => null
    }),
    analysis: Annotation<string>({
        reducer: (left, right) => right ?? left ?? "",
        default: () => ""
    }),
    error: Annotation<string | null>({
        reducer: (left, right) => right ?? left ?? null,
        default: () => null
    }),
    metadata: Annotation<Record<string, any>>({
        reducer: (left, right) => ({ ...(left ?? {}), ...(right ?? {}) }),
        default: () => ({})
    })
});

export function createWorkflowGraph() {
    const workflow = new StateGraph(StateAnnotation)

        .addNode("parse_query", parseQueryNode)
        .addNode("fetch_data", fetchDataNode)
        .addNode("deep_dive", deepDiveSuspiciousAddressesNode)
        .addNode("analyze_data", analyzeDataNode)
        .addNode("format_response", formatResponseNode)

        .addConditionalEdges(
            "parse_query",
            (state) => {
                if (state.error) {
                    return "format_response";
                }
                return "fetch_data";
            }
        )
        .addConditionalEdges(
            "fetch_data",
            (state) => {
                if (state.error) {
                    return "format_response";
                }
                return "deep_dive";
            }
        )
        .addConditionalEdges(
            "deep_dive",
            (state) => {
                if (state.error) {
                    return "format_response";
                }
                return "analyze_data";
            }
        )
        
        .addEdge("__start__", "parse_query")
        .addEdge("analyze_data", "format_response")
        .addEdge("format_response", "__end__")
        .compile();
    
    return workflow;
}

export async function runWorkflow(userQuery: string): Promise<string> {
    console.log("=".repeat(80));
    console.log("Starting Solana Transaction Analysis Workflow");
    console.log("=".repeat(80));
    console.log(`\nQuery: ${userQuery}\n`);

    const graph = createWorkflowGraph();

    const initialState = {
        userQuery
    };

    try {
        const result = await graph.invoke(initialState);
        
        console.log("\n" + "=".repeat(80));
        console.log("Workflow Complete");
        console.log("=".repeat(80));
        
        return result.analysis || "No analysis generated";
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Workflow error:", error);
        return `Workflow failed: ${errorMessage}`;
    }
}
