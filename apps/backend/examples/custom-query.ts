import { analyzeQuery } from "../src/index";

async function main() {
    const query = process.argv.slice(2).join(" ");
    
    if (!query) {
        console.error("Please provide a query as an argument");
        console.log("\nUsage:");
        console.log('  bun run examples/custom-query.ts "your query here"');
        console.log("\nExample:");
        console.log('  bun run examples/custom-query.ts "analyze wallet ABC123 for suspicious activity"');
        process.exit(1);
    }

    console.log("Analyzing Query:\n");
    console.log(`  "${query}"\n`);
    console.log("=".repeat(80));

    try {
        const result = await analyzeQuery(query);
        
        console.log("\nAnalysis Complete!\n");
        console.log("=".repeat(80));
        console.log(result);
        console.log("=".repeat(80));
        
    } catch (error: any) {
        console.error("\nError:", error.message);
        process.exit(1);
    }
}

main();

