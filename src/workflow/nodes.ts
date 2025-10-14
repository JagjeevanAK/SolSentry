import { ChatOpenAI } from "@langchain/openai";
import type { WorkflowState } from "../types";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { 
    fetchTransactionsByAddressTool, 
    fetchTokenTransactionsTool,
    fetchAccountInfoTool, 
    searchAddressTool 
} from "../tools/transaction-tools";
import { getTransactionsBySignature } from "../utils/helius-api";

const llm = new ChatOpenAI({
    modelName: "openai/gpt-5",  //use correct model when not using OpenRouter look for model provider website ro model ID
    openAIApiKey: process.env.OPENAI_API_KEY
});

export async function parseQueryNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log("\n[Node: Parse Query] Analyzing user query...");
    
    const prompt = ChatPromptTemplate.fromMessages([
        ["system", `You are an expert at analyzing Solana blockchain queries. Extract key information from the user's query.
        
Your task:
1. Identify all Solana identifiers:
   - Wallet/Pool addresses: 32-44 character base58 strings (e.g., 3Vj8miZuT...)
   - Transaction signatures: 87-88 character base64 strings (e.g., containing +, /, =)
   - Token mint addresses: 32-44 character base58 strings (often shown in parentheses after token symbol)
2. Determine the query type:
   - "abnormality_detection": Looking for unusual patterns, suspicious activity, abnormalities in transactions
   - "wallet_analysis": Analyzing wallet behavior, transaction history, specific token transactions, tabular analysis
   - "transaction_lookup": Looking up a specific transaction by signature
   - "general": General information requests
3. Extract any time parameters:
   - Specific times: "last 6 hours", "past day" → hoursBack: 6, 24
   - "all", "all time", "complete history", "from the start", "entire history" → hoursBack: 8760 (1 year)
   - For token-specific queries with "all", default to 8760 hours (1 year) to get complete token history
   - If no time specified and token is mentioned, use 8760 hours
   - If no time specified and no token, use 10 hours
4. Extract any specific token mentions:
   - Look for token symbols like $icm, $SOL, etc.
   - Look for token mint addresses (32-44 character base58 strings)
   - Token addresses are often in parentheses after the symbol, e.g., "$icm (G5bStq...)"

IMPORTANT: 
- If a specific token is mentioned (either by symbol or mint address), extract the mint address
- If token is mentioned with "all" or similar language, set hoursBack to 8760 (1 year of history)

Respond with ONLY a valid JSON object (no markdown, no code blocks, no extra text):
{{
    "addresses": ["address1", "address2"],
    "transactionSignatures": ["sig1", "sig2"],
    "queryType": "abnormality_detection" | "wallet_analysis" | "transaction_lookup" | "general",
    "timeParameters": {{ "hoursBack": 10 }},
    "tokenMint": "token_mint_address_if_mentioned_or_null",
    "intent": "brief description of what user wants"
}}`],
        ["user", "{query}"]
    ]);
    
    const chain = prompt.pipe(llm);
    const response = await chain.invoke({ query: state.userQuery });
    
    try {
        let content = response.content as string;
        content = content.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(content);
        console.log("Parsed query:", parsed);
        
        return {
            extractedAddresses: parsed.addresses || [],
            extractedTokens: parsed.tokenMint ? [parsed.tokenMint] : [],
            queryType: parsed.queryType || "general",
            metadata: {
                ...state.metadata,
                hoursBack: parsed.timeParameters?.hoursBack,
                specificToken: parsed.tokenMint,
                intent: parsed.intent,
                transactionSignatures: parsed.transactionSignatures || []
            }
        };
    } catch (error) {
        console.error("Error parsing query:", error);
        return {
            error: "Failed to parse query",
            queryType: "general"
        };
    }
}

export async function fetchDataNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log("\n[Node: Fetch Data] Gathering data...");
    
    try {
        if (state.metadata.transactionSignatures && state.metadata.transactionSignatures.length > 0) {
            const signature = state.metadata.transactionSignatures[0];
            if (!signature) {
                return { error: "Invalid transaction signature" };
            }
            console.log(`Looking up transaction by signature: ${signature.substring(0, 20)}...`);
            
            const transactions = await getTransactionsBySignature([signature]);
            
            return {
                transactions,
                metadata: {
                    ...state.metadata,
                    dataFetchResult: JSON.stringify({
                        type: "transaction_lookup",
                        signature: signature,
                        transaction: transactions[0]
                    }, null, 2)
                }
            };
        }
        
        if (state.extractedAddresses.length === 0) {
            return {
                error: "No addresses or transaction signatures found in query"
            };
        }
        
        const address = state.extractedAddresses[0];
        if (!address) {
            return { error: "Invalid address" };
        }
        
        const specificToken = state.metadata.specificToken || (state.extractedTokens && state.extractedTokens[0]);
        const defaultHours = specificToken ? 8760 : 10;
        const hoursBack = state.metadata.hoursBack || defaultHours;
        
        if (specificToken && hoursBack >= 720) {
            console.log(`Token-specific query detected: Fetching COMPLETE history (${Math.floor(hoursBack/24)} days)`);
        }
        
        console.log(`Identifying address type: ${address.substring(0, 8)}...`);
        
        const searchResultStr = await searchAddressTool.invoke({ address: address });
        const searchResultParsed = JSON.parse(searchResultStr);
        
        if (!searchResultParsed.success) {
            return { error: `Failed to search address: ${searchResultParsed.error}` };
        }
        
        const accountInfoValidationStr = await fetchAccountInfoTool.invoke({ address: address });
        const accountInfoValidation = JSON.parse(accountInfoValidationStr);
        
        if (!accountInfoValidation.success) {
            return { error: `Failed to fetch account info: ${accountInfoValidation.error}` };
        }
        
        const searchResult = searchResultParsed.results;
        const accountData = accountInfoValidation.accountInfo?.data || accountInfoValidation.accountInfo;
        
        let entityType = "unknown";
        let entityName = null;
        let entityTags: string[] = [];
        let entityCategory = "regular_wallet";
        let isOnCurve: boolean | null = null;
        let isPDA = false;
        
        const searchData = searchResult?.data?.[0] || searchResult?.data;
        if (searchData && typeof searchData.isOnCurve === "boolean") {
            isOnCurve = searchData.isOnCurve;
            isPDA = !isOnCurve;
        } else if (accountData && typeof accountData.isOnCurve === "boolean") {
            isOnCurve = accountData.isOnCurve;
            isPDA = !isOnCurve;
        }
        
        const accounts = searchResult?.metadata?.accounts || searchResult?.data?.metadata?.accounts || searchResult?.accounts;
        
        if (accounts && accounts[address]) {
            const accountInfo = accounts[address];
            entityName = accountInfo.account_label || null;
            entityTags = accountInfo.account_tags || [];
            entityType = accountInfo.account_type || "unknown";
            
            if (entityTags.includes("dex") || entityTags.includes("market") || 
                entityTags.includes("meteora") || entityTags.includes("raydium") || 
                entityTags.includes("orca") || entityTags.includes("jupiter")) {
                entityCategory = "dex_pool";
            } else if (entityTags.includes("protocol") || entityTags.includes("defi")) {
                entityCategory = "protocol";
            } else if (entityTags.includes("program")) {
                entityCategory = "program";
            } else if (entityName) {
                entityCategory = "known_entity";
            }
        } else if (searchResult?.data) {
            entityType = searchResult.data.type || "unknown";
            entityName = searchResult.data.name || searchResult.data.tag || null;
        }
        
        const solscanType = accountData?.type;
        const accountType = accountData?.account_type;
        const accountLabel = accountData?.account_label;
        const accountTagsFromInfo = accountData?.account_tags || [];
        
        if (solscanType && solscanType !== "unknown") {
            entityType = solscanType;
        }
        
        if (isPDA) {
            entityCategory = "pda";
        } else if (solscanType === "SYSTEM" || solscanType === "system_account" || accountType === "system_account") {
            entityCategory = "system_account";
        }
        
        if (accountLabel && !entityName) {
            entityName = accountLabel;
        }
        
        if (accountTagsFromInfo.length > 0 && entityTags.length === 0) {
            entityTags = accountTagsFromInfo;
        }
        
        if (accountType === "program" && entityCategory !== "system_account") {
            entityCategory = "program";
        }
        
        if (entityCategory === "regular_wallet" && accountTagsFromInfo.length > 0) {
            if (accountTagsFromInfo.includes("dex") || accountTagsFromInfo.includes("market")) {
                entityCategory = "dex_pool";
            } else if (accountTagsFromInfo.includes("protocol") || accountTagsFromInfo.includes("defi")) {
                entityCategory = "protocol";
            } else if (accountTagsFromInfo.includes("program")) {
                entityCategory = "program";
            } else if (accountLabel) {
                entityCategory = "known_entity";
            }
        }
        
        console.log(`Entity: ${entityName || 'Unknown'}`);
        console.log(`Type: ${entityType} | Category: ${entityCategory}`);
        if (entityTags.length > 0) {
            console.log(`Tags: ${entityTags.join(", ")}`);
        }
        
        let transactions: any[] = [];
        let transactionsResult: any;
        
        if (specificToken) {
            console.log(`Fetching ${address.substring(0, 8)}... transactions for token ${specificToken.substring(0, 8)}... (${hoursBack} hours = ${Math.floor(hoursBack/24)} days)...`);
            
            const transactionsResultStr = await fetchTokenTransactionsTool.invoke({ 
                walletAddress: address,
                tokenMint: specificToken,
                hoursBack: hoursBack 
            });
            transactionsResult = JSON.parse(transactionsResultStr);
            
            if (!transactionsResult.success) {
                return { error: `Failed to fetch token transactions: ${transactionsResult.error}` };
            }
            
            transactions = transactionsResult.transactions;
            console.log(`Found ${transactionsResult.totalTransactions} transactions for token ${specificToken.substring(0, 8)}...`);
        } else {
            console.log(`Fetching transactions for ${address.substring(0, 8)}... (last ${hoursBack} hours)...`);
            
            const transactionsResultStr = await fetchTransactionsByAddressTool.invoke({ 
                address: address, 
                hoursBack: hoursBack 
            });
            transactionsResult = JSON.parse(transactionsResultStr);
            
            if (!transactionsResult.success) {
                return { error: `Failed to fetch transactions: ${transactionsResult.error}` };
            }
            
            transactions = transactionsResult.transactions;
            console.log(`Found ${transactionsResult.totalTransactions} transactions`);
        }
        
        console.log("Fetching account metadata...");
        const accountInfoResultStr = await fetchAccountInfoTool.invoke({ address: address });
        const accountInfoResult = JSON.parse(accountInfoResultStr);
        
        if (!accountInfoResult.success) {
            return { error: `Failed to fetch account info: ${accountInfoResult.error}` };
        }
        
        const accountInfo = accountInfoResult.accountInfo;
        
        const addressFrequency = new Map<string, number>();
        const volumeByAddress = new Map<string, number>();
        const transactionTypeCount = new Map<string, number>();
        
        transactions.forEach((tx: any) => {
            if (tx.type && tx.type !== "UNKNOWN") {
                transactionTypeCount.set(tx.type, (transactionTypeCount.get(tx.type) || 0) + 1);
            }
            
            if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
                tx.tokenTransfers.forEach((transfer: any) => {
                    const from = transfer.fromUserAccount;
                    const to = transfer.toUserAccount;
                    const amount = transfer.tokenAmount;
                    
                    if (from) {
                        addressFrequency.set(from, (addressFrequency.get(from) || 0) + 1);
                        if (amount !== undefined && amount !== null) {
                            volumeByAddress.set(from, (volumeByAddress.get(from) || 0) + amount);
                        }
                    }
                    if (to) {
                        addressFrequency.set(to, (addressFrequency.get(to) || 0) + 1);
                        if (amount !== undefined && amount !== null) {
                            volumeByAddress.set(to, (volumeByAddress.get(to) || 0) + amount);
                        }
                    }
                });
            }
        });
        
        const topAddresses = Array.from(addressFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        const suspiciousPatternAnalysis = analyzeSuspiciousPatterns(transactions, address);
        console.log(`Initial pattern detection: ${suspiciousPatternAnalysis.totalSuspicious} suspicious addresses found out of ${suspiciousPatternAnalysis.totalUniqueAddresses} unique counterparties`);
        if (suspiciousPatternAnalysis.totalSuspicious > 0) {
            console.log(`Top suspicious: ${suspiciousPatternAnalysis.suspiciousAddresses.slice(0, 3).map((s: any) => `${s.address.substring(0, 8)}... (${s.reason})`).join(", ")}`);
        }
        
        const dataReport = {
            entityInfo: {
                address: address,
                type: entityType,
                category: entityCategory,
                name: entityName,
                tags: entityTags,
                accountInfoType: accountData?.type || null,
                accountInfoAccountType: accountData?.account_type || null,
                isOnCurve: isOnCurve,
                isPDA: isPDA,
                isSystemAccount: entityCategory === "system_account",
                isKnownEntity: entityName !== null || entityCategory !== "regular_wallet",
                specificToken: specificToken || null,
                description: isPDA ? 
                    "PDA (Program Derived Address) - program-controlled account, should NOT be flagged for illegal activity" :
                    entityCategory === "system_account" ? 
                    "SYSTEM ACCOUNT (infrastructure - should be filtered out from suspicious address detection)" :
                    entityName ? 
                        `${entityName}${entityTags.length > 0 ? ` (${entityTags.join(", ")})` : ''}` : 
                        entityType !== "unknown" ? 
                            `${entityType} account` : 
                            "Regular wallet"
            },
            totalTransactions: transactions.length,
            timeRange: specificToken ? 
                (hoursBack >= 720 ? `Complete history (${Math.floor(hoursBack/24)} days) - filtered for token: ${specificToken}` : `Last ${hoursBack} hours (${Math.floor(hoursBack/24)} days) - filtered for token: ${specificToken}`) : 
                `Last ${hoursBack} hours (${Math.floor(hoursBack/24)} days)`,
            uniqueAddresses: addressFrequency.size,
            knownTransactionTypes: Object.fromEntries(transactionTypeCount),
            topAddressesByFrequency: topAddresses.map(([addr, count]) => ({
                address: addr,
                transactionCount: count
            })),
            accountType: accountInfo?.data?.type || null,
            sampleTransactions: transactions.slice(0, 10)
                .filter((tx: any) => tx.type && tx.type !== "UNKNOWN")
                .map((tx: any) => ({
                    signature: tx.signature,
                    type: tx.type,
                    timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null,
                    tokenTransfers: tx.tokenTransfers?.length || 0
                })),
            suspiciousPatternDetection: {
                totalUniqueCounterparties: suspiciousPatternAnalysis.totalUniqueAddresses,
                suspiciousCount: suspiciousPatternAnalysis.totalSuspicious,
                topSuspicious: suspiciousPatternAnalysis.suspiciousAddresses.slice(0, 5).map((s: any) => ({
                    address: s.address,
                    reason: s.reason,
                    txCount: s.transactionCount
                }))
            }
        };
        
        console.log("Data gathering complete!");
        
        return {
            transactions,
            accountInfo,
            metadata: {
                ...state.metadata,
                dataFetchResult: JSON.stringify(dataReport, null, 2),
                suspiciousAddresses: suspiciousPatternAnalysis.suspiciousAddresses,
                suspiciousPatternSummary: {
                    totalUniqueAddresses: suspiciousPatternAnalysis.totalUniqueAddresses,
                    totalSuspicious: suspiciousPatternAnalysis.totalSuspicious
                }
            }
        };
    } catch (error: any) {
        console.error("Error fetching data:", error);
        return {
            error: `Data fetch failed: ${error.message}`
        };
    }
}

export async function analyzeDataNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log("\n[Node: Analyze Data] Performing deep analysis...");
    
    const transactions = state.transactions || [];
    const suspiciousPatterns = JSON.parse(state.metadata.dataFetchResult || "{}");
    
    const analysisPrompt = ChatPromptTemplate.fromMessages([
        ["system", `You are an expert Solana blockchain forensic analyst specializing in detecting abnormal trading patterns and suspicious addresses.

## DATA STRUCTURE YOU'RE RECEIVING

You receive Helius Enhanced Transactions with this structure:
- signature: Transaction ID
- type: Transaction type ("SWAP", "TRANSFER", "NFT_SALE", "UNKNOWN")
- timestamp: Unix timestamp for timing analysis
- tokenTransfers[]: Array of token movements with:
  * fromUserAccount: Sender address
  * toUserAccount: Receiver address
  * mint: Token being traded
  * tokenAmount: Amount transferred
- nativeTransfers[]: SOL movements
- accountData[]: Balance changes for all involved accounts

Entity information from Solscan provides:
- isOnCurve: boolean - CRITICAL field for identifying PDAs
  * isOnCurve: false = PDA (Program Derived Address) - MUST NOT BE FLAGGED for illegal activity
  * isOnCurve: true = Regular account with private key - CAN be flagged if suspicious
- type: Solscan's account type ("SYSTEM", "UNKNOWN", etc.)
  * "SYSTEM" = System account (filter out, infrastructure)
  * "UNKNOWN" = NOT a system account, likely regular wallet/trader (investigate!)
- account_label: Entity name (e.g., "Jupiter Aggregator", "Raydium Pool")
- account_tags: Tags like ["dex", "protocol", "jupiter"]
- account_type: Metadata type like "token_account", "system_account", "program"
- classification: Our classification ("infrastructure", "known_bot", "protocol", "likely_trader")
- isBenign: Whether to filter out (true for infrastructure/PDAs)
- isPDA: Derived from isOnCurve field (isPDA = !isOnCurve)
- if isOnCurve is true then it and normal account addres is not pda and if isOnCurve is false then it and normal account addres is pda

## ANOMALY DETECTION FRAMEWORK

### 1. SUSPICIOUS ADDRESS PATTERNS

**Wash Trading:**
- Same address appears in BOTH fromUserAccount AND toUserAccount frequently
- Equal number of buys and sells (buyCount === sellCount)
- Trading with themselves through intermediaries
- Evidence: Show buy/sell ratio, transaction count, volume

**Bot-Like Behavior:**
- Transactions at regular intervals (e.g., every 30 seconds)
- High frequency trading (>20 transactions in short timeframe)
- Automated timing patterns with low variance
- Evidence: Show timestamp intervals, frequency, regularity score

**Coordinated Networks:**
- Multiple addresses that only trade with each other (closed loop)
- Addresses created around the same time trading together
- Similar transaction patterns across multiple addresses
- Evidence: Show address relationships, timing correlation

**Unusual Volume:**
- Single address responsible for >20% of pool volume
- Disproportionate activity compared to others
- Sudden spikes in volume from new addresses
- Evidence: Show volume %, transaction count, comparison to average

**Unusual Volume Spikes:**
- Sudden large transactions that deviate significantly from average volume
- Volume spikes >3x the average transaction size
- Concentrated high-volume activity in short time windows
- Evidence: Show transaction amounts, average volume, spike timestamps

**Repeated Transactions from Same Wallet:**
- Same wallet executing identical or near-identical transactions
- Multiple transactions with same amounts at regular intervals
- Repeated failed transactions followed by successful ones (testing/probing)
- Evidence: Show transaction patterns, amounts, frequency, success rates

**Drastic Liquidity Changes:**
- Large liquidity additions followed by immediate removals
- Sudden liquidity drains (>30% of pool liquidity)
- Coordinated liquidity manipulation across multiple addresses
- Evidence: Show liquidity changes, timing, involved addresses

**Rapid Back-and-Forth Swaps (Arbitrage Loops):**
- Same address swapping Token A → Token B → Token A in quick succession
- Circular trading patterns within seconds/minutes
- Multiple swap cycles with minimal time gaps
- Evidence: Show swap sequences, timing between swaps, profit/loss patterns

**Abnormal Slippage Patterns:**
- Transactions with unusually high slippage tolerance (>10%)
- Consistent slippage exploitation (buy low slippage, sell high slippage)
- Slippage patterns indicating front-running or sandwich attacks
- Evidence: Show slippage percentages, price impact, transaction ordering

### 2. MARKET MANIPULATION INDICATORS

**Price Manipulation:**
- Large buys followed by immediate sells (pump and dump)
- Coordinated buying/selling across multiple addresses
- Volume spikes without corresponding price movement
- Evidence: Show sequence of trades, volumes, timing

**Liquidity Extraction:**
- Addresses systematically removing liquidity
- Repeated pattern of adding/removing LP tokens
- Front-running liquidity pool transactions
- Evidence: Show LP token movements, timing relative to swaps

**MEV/Sandwich Attacks:**
- Address transactions immediately before/after large swaps
- Same address on both sides of target transaction
- Pattern of buy → victim trade → sell
- Evidence: Show transaction ordering, timing gaps

### 3. ENTITY CLASSIFICATION & MONITORING

**Understanding the Data Sources:**

We validate addresses using TWO APIs:
1. **Search API** (searchSolscan): May return empty for some addresses
2. **Account Info API** (getAccountInfo): Always returns data, critical for system account detection

**Example: Search API returns NO DATA**
When search returns empty data array and empty accounts object, we MUST rely on Account Info API.
Example: data: [], metadata: {{ accounts: {{}}, tags: {{}}, programs: {{}} }}

**Example: Account Info API reveals SYSTEM ACCOUNT**
When accountInfoType = "system_account" OR accountInfoAccountType = "system_account", this is infrastructure.
Example: data: {{ type: "system_account", account_type: "system_account", ownerProgram: "11111111111111111111111111111111" }}
This is a SYSTEM ACCOUNT (filter out - it's infrastructure, not a trader).

**Example: Account Info API shows REGULAR WALLET**
When type = "UNKNOWN" with no labels/tags and NOT system_account, this is a regular wallet.
Example: data: {{ type: "UNKNOWN", account_type: null, account_label: null, account_tags: [] }}
This is a REGULAR WALLET (investigate if suspicious).

**Use Solscan Data to Identify:**

CRITICAL - PRIMARY FILTER: isOnCurve Field
- isOnCurve: false = PDA (Program Derived Address)
  * NEVER flag as illegal activity
  * PDAs are program-controlled, no private key exists
  * Examples: escrow accounts, vaults, liquidity pools, program authorities
- isOnCurve: true = Regular account with private key
  * Can be flagged for suspicious activity
  * User-controlled accounts that can engage in illegal activity

FILTER OUT (isBenign = true):
- isPDA = true (isOnCurve: false): PDAs - program-controlled accounts
- Solscan type = "SYSTEM" or "system_account": System accounts (infrastructure)
- account_type = "system_account" or "token_account": Infrastructure accounts
- account_type = "program": Smart contract programs
- Known Protocols: Labels like "Jupiter Aggregator", "Raydium Authority"
- DEX Pools: Tags ["dex", "market"] WITH labels (e.g., "Meteora GOLD-USDC Market")

MONITOR CLOSELY (isBenign = false AND isOnCurve = true):
- Solscan type = "UNKNOWN" with NO labels/tags AND isOnCurve: true: Regular wallets with high activity (INVESTIGATE!)
- likely_trader: Unknown addresses with suspicious patterns AND isOnCurve: true
- known_bot: Jupiter wallets, aggregators (provide context but still monitor) IF isOnCurve: true
- Addresses with unusual patterns despite being "known" BUT ONLY IF isOnCurve: true

CRITICAL RULES: 
- ALWAYS check isOnCurve field FIRST - if false, DO NOT flag for illegal activity
- If isOnCurve is false (PDA), skip all suspicious pattern detection for that address
- Only flag addresses where isOnCurve: true (regular accounts with private keys)
- PDAs cannot commit "illegal activity" as they have no private keys and are program-controlled

**High-Transaction Party Analysis:**
If an address has >50 transactions:
1. Check Solscan classification - Is it infrastructure or trader?
2. Analyze their trading partners - Who do they interact with?
3. Track tokens traded - Are they manipulating specific tokens?
4. Monitor across pools - Are they active in multiple pools?
5. Assess manipulation risk - Can they influence market prices?

**DEX vs CEX vs Regular Wallet:**
- DEX/Pools (tags: dex, raydium, orca): High volume is normal, monitor for unusual patterns
- CEX Deposit/Withdrawal (tags: exchange, binance): High volume is normal
- Regular Wallets (no tags): High volume is SUSPICIOUS, investigate deeply

### 4. ANALYSIS METHODOLOGY

**Step 1: Filter Data**
- Remove BENIGN infrastructure addresses
- Focus on actual traders and unknown entities
- Keep high-volume addresses even if known (for context)

**Step 2: Pattern Detection**
For each address, calculate:
- Transaction frequency: Count / time period
- Buy/Sell ratio: buyCount / sellCount
- Volume concentration: Their volume / total volume
- Timing regularity: Variance in transaction intervals
- Network connections: Unique counterparties

**Step 3: Risk Assessment**
Flag as SUSPICIOUS if:
- Buy/Sell ratio between 0.8-1.2 AND frequency >10 (wash trading)
- Timing variance <10% of average interval (bot)
- Volume >15% of total AND frequency >20 (manipulation)
- Only trades with 2-3 other addresses (coordinated)
- New address with immediate high volume (possible manipulator)

**Step 4: Evidence Gathering**
For each suspicious address, provide:
- Specific transaction signatures as proof (full signatures)
- Calculated metrics (ratios, frequencies, volumes)
- Timestamps showing patterns
- Connected addresses in their network (FULL addresses, no truncation)
- Risk level: LOW, MEDIUM, HIGH, CRITICAL

CRITICAL WARNING - PDA FALSE POSITIVES:
- You may encounter addresses with suspicious patterns that are actually PDAs (Program Derived Addresses)
- PDAs are program-controlled and CANNOT engage in illegal activity
- If an address shows high volume but interacts with known protocols/programs, it's likely a PDA
- When in doubt, mark as "MONITOR" rather than "SUSPICIOUS" - better to be conservative
- The deep dive analysis will filter out confirmed PDAs automatically

NOTE: Always display COMPLETE Solana addresses (32-44 characters). Never use shortened formats like "ABC...XYZ".

{deepDiveSection}

## OUTPUT REQUIREMENTS

Analyze ALL transaction data and provide:

### Suspicious Addresses Found
For EACH suspicious address:
- Address (FULL wallet address, do NOT truncate or shorten it)
- Classification (from Solscan if available)
- Suspicion Reason (wash trading, bot, manipulation, etc.)
- Evidence (specific numbers, ratios, timestamps)
- Risk Level (LOW/MEDIUM/HIGH/CRITICAL)
- Recommendation (Monitor, Investigate, Flag for Review)

### Market Manipulation Indicators
- Describe coordinated patterns across addresses
- Identify potential pump/dump schemes
- Flag MEV/sandwich attack patterns
- Show evidence with transaction data

### Network Analysis
- Show relationships between suspicious addresses (use FULL addresses)
- Identify coordinated groups
- Map token flow patterns (show complete addresses for all parties)
- Highlight closed-loop trading (list full addresses involved)

### High-Impact Traders
- List FULL addresses with >5% of total volume (no truncation)
- Assess their market impact capability
- Determine if they're infrastructure or manipulators
- Monitor recommendations

CRITICAL: 
- Use actual data (timestamps, volumes, addresses) as evidence. Don't make generic statements.
- ALWAYS show COMPLETE wallet addresses. NEVER truncate or shorten addresses (no "ABC...XYZ" format).
- Display full 32-44 character Solana addresses in all outputs.`],
        ["user", `Entity Info: {entityInfo}

Total Transactions: {totalTransactions}
Time Range: {timeRange}

## TRANSACTION DATA FOR ANALYSIS

Summary:
{transactionSummary}

Initial Pattern Detection:
{suspiciousData}

{deepDiveData}

## FULL TRANSACTION DETAILS

Here are ALL transactions with complete tokenTransfers data for your analysis:
{fullTransactions}

## ANALYSIS INSTRUCTIONS

Using the data structure knowledge from your system prompt:

1. Examine tokenTransfers[] in each transaction to track:
   - fromUserAccount and toUserAccount patterns
   - Token mints being traded
   - Volume patterns and concentrations

2. Use Entity Info to classify addresses:
   - Filter out infrastructure (isBenign: true)
   - Focus on likely_trader and unknown addresses
   - Monitor high-volume parties even if "known"

3. Calculate metrics for suspicious detection:
   - Buy/Sell ratios per address
   - Transaction frequency and timing patterns
   - Volume concentration percentages
   - Network connections between addresses

4. Provide specific evidence:
   - Transaction signatures
   - Exact timestamps and intervals
   - Calculated ratios and percentages
   - Risk levels (LOW/MEDIUM/HIGH/CRITICAL)

5. TOKEN-SPECIFIC ANALYSIS:
   - If entityInfo.specificToken is present, this is a TOKEN-SPECIFIC query
   - Focus ONLY on transactions involving that specific token
   - Analyze wallet's complete buying/selling patterns for this token
   - Calculate:
     * Total bought (with amounts and average price if calculable)
     * Total sold (with amounts and average price if calculable)
     * Net position (current holdings)
     * First transaction date and last transaction date
     * Trading frequency (transactions per day/week)
   - Identify trading patterns: accumulation, distribution, swing trading, hold strategy
   - If timeRange indicates "Complete history" or >30 days, provide comprehensive historical analysis
   - If user requests "tabular" or "table" format, provide results in markdown table format with columns:
     * Date/Time | Type (Buy/Sell) | Amount | Price (if available) | Running Balance

User Query: {userQuery}`]
    ]);
    
    const chain = analysisPrompt.pipe(llm);
    
    try {
        const entityInfo = JSON.parse(state.metadata.dataFetchResult || "{}").entityInfo || {};
        
        const transactionSummary = {
            total: transactions.length,
            byType: transactions.reduce((acc: any, tx) => {
                const type = tx.type || 'UNKNOWN';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {}),
            timeRange: {
                earliest: transactions[transactions.length - 1]?.timestamp,
                latest: transactions[0]?.timestamp
            }
        };
        
        let deepDiveSection = "";
        let deepDiveData = "";
        
        if (state.metadata.suspiciousAddressProfiles && state.metadata.suspiciousAddressProfiles.length > 0) {
            deepDiveSection = `
4. DEEP DIVE ANALYSIS - We've recursively analyzed the top suspicious addresses:
   - isOnCurve status (CRITICAL: PDAs with isOnCurve: false have been filtered out)
   - Account TYPE from Solscan (system_account, token_account, etc.)
   - Account LABEL and TAGS (Jupiter Aggregator, DEX wallet, etc.)
   - Classification (infrastructure/benign vs actual traders/bots)
   - Their full transaction history (last 24 hours)
   - Other pools/tokens they interact with
   - Network of counterparties (FULL addresses for all parties)
   - Bot likelihood assessment
   
   IMPORTANT: 
   - ALL PDAs (isOnCurve: false) have already been FILTERED OUT before this analysis
   - Only addresses with isOnCurve: true (regular accounts with private keys) are included
   - Filter out remaining BENIGN addresses (infrastructure, system accounts) and focus only on actual suspicious traders/bots
   - Display ALL addresses in FULL format (32-44 characters). Never truncate or shorten addresses.
   Use this data to provide deeper insights into coordinated networks and broader manipulation patterns.`;
            
            deepDiveData = `

RECURSIVE ANALYSIS OF SUSPICIOUS ADDRESSES (PDAs already filtered out):
${JSON.stringify(state.metadata.suspiciousAddressProfiles, null, 2)}

This shows the FULL activity of each suspicious address across ALL pools and tokens.
NOTE: All addresses shown here have isOnCurve: true (regular accounts) or were unable to determine isOnCurve status.`;
        }
        
        const fullTransactionsData = transactions.slice(0, 200).map((tx: any) => ({
            signature: tx.signature,
            type: tx.type,
            timestamp: tx.timestamp,
            tokenTransfers: tx.tokenTransfers?.map((t: any) => ({
                from: t.fromUserAccount,
                to: t.toUserAccount,
                mint: t.mint,
                amount: t.tokenAmount
            })) || [],
            nativeTransfers: tx.nativeTransfers?.length || 0
        }));
        
        const response = await chain.invoke({
            entityInfo: JSON.stringify(entityInfo, null, 2),
            totalTransactions: transactions.length,
            timeRange: state.metadata.hoursBack ? `Last ${state.metadata.hoursBack} hours` : "Last 10 hours",
            suspiciousData: state.metadata.dataFetchResult || "{}",
            transactionSummary: JSON.stringify(transactionSummary, null, 2),
            fullTransactions: JSON.stringify(fullTransactionsData, null, 2),
            deepDiveSection: deepDiveSection,
            deepDiveData: deepDiveData,
            userQuery: state.userQuery
        });
        
        const analysis = response.content as string;
        console.log("\nDeep analysis complete!");
        
        return {
            analysis: analysis
        };
    } catch (error: any) {
        console.error("Error in analysis:", error);
        return {
            error: `Analysis failed: ${error.message}`,
            analysis: "Unable to complete analysis"
        };
    }
}

function analyzeSuspiciousPatterns(transactions: any[], targetAddress: string) {
    const addressActivity = new Map<string, any>();
    const timingPatterns = new Map<string, number[]>();
    
    transactions.forEach(tx => {
        if (!tx.tokenTransfers) return;
        
        tx.tokenTransfers.forEach((transfer: any) => {
            const from = transfer.fromUserAccount;
            const to = transfer.toUserAccount;
            const amount = transfer.tokenAmount;
            
            [from, to].filter(Boolean).forEach(addr => {
                if (addr === targetAddress) return;
                
                if (!addressActivity.has(addr)) {
                    addressActivity.set(addr, {
                        address: addr,
                        transactions: [],
                        totalVolume: 0,
                        buyCount: 0,
                        sellCount: 0,
                        timestamps: []
                    });
                }
                
                const activity = addressActivity.get(addr);
                activity.transactions.push(tx.signature);
                activity.totalVolume += amount || 0;
                activity.timestamps.push(tx.timestamp);
                
                if (addr === to) activity.buyCount++;
                if (addr === from) activity.sellCount++;
            });
        });
    });
    
    const suspicious = [];
    for (const [addr, activity] of addressActivity.entries()) {
        const isSuspicious = 
            (activity.buyCount > 0 && activity.sellCount > 0 && activity.buyCount === activity.sellCount) || // Wash trading
            (activity.transactions.length > 20) || // High frequency
            (activity.timestamps.length > 10 && hasRegularIntervals(activity.timestamps)); // Bot-like timing
        
        if (isSuspicious) {
            suspicious.push({
                address: addr,
                transactionCount: activity.transactions.length,
                buyCount: activity.buyCount,
                sellCount: activity.sellCount,
                totalVolume: activity.totalVolume,
                reason: detectSuspiciousReason(activity)
            });
        }
    }
    
    return {
        totalUniqueAddresses: addressActivity.size,
        suspiciousAddresses: suspicious.slice(0, 20),
        totalSuspicious: suspicious.length
    };
}

function hasRegularIntervals(timestamps: number[]): boolean {
    if (timestamps.length < 5) return false;
    
    const sorted = [...timestamps].sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (prev !== undefined && curr !== undefined) {
            intervals.push(curr - prev);
        }
    }
    
    if (intervals.length === 0) return false;
    
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length;
    
    return variance < avg * 0.1;
}

function detectSuspiciousReason(activity: any): string {
    const reasons = [];
    
    if (activity.buyCount === activity.sellCount && activity.buyCount > 2) {
        reasons.push("Wash trading pattern (equal buys/sells)");
    }
    if (activity.transactions.length > 30) {
        reasons.push("Extremely high frequency");
    }
    if (hasRegularIntervals(activity.timestamps)) {
        reasons.push("Bot-like regular intervals");
    }
    
    return reasons.join(", ") || "High activity";
}

export async function deepDiveSuspiciousAddressesNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log("\n[Node: Deep Dive] Recursively analyzing suspicious addresses...");
    
    if (state.queryType !== "abnormality_detection" || !state.metadata.dataFetchResult) {
        console.log("Skipping deep dive (not abnormality detection or no data)");
        return {};
    }
    
    try {
        const dataReport = JSON.parse(state.metadata.dataFetchResult);
        const suspiciousAddressList = state.metadata.suspiciousAddresses || [];
        
        if (!suspiciousAddressList || suspiciousAddressList.length === 0) {
            console.log("No suspicious addresses to investigate");
            return {};
        }
        
        const topSuspicious = suspiciousAddressList.slice(0, 5);
        console.log(`Investigating ${topSuspicious.length} suspicious addresses...`);
        
        const suspiciousAddressProfiles = [];
        
        for (const suspiciousAddr of topSuspicious) {
            const address = suspiciousAddr.address;
            console.log(`\n  → Analyzing ${address.substring(0, 8)}... (${suspiciousAddr.reason})`);
            
            try {
                console.log(`    Checking account type and isOnCurve status...`);
                
                const searchResultStr = await searchAddressTool.invoke({ address: address });
                const searchResultParsed = JSON.parse(searchResultStr);
                
                const accountInfoResultStr = await fetchAccountInfoTool.invoke({ address: address });
                const accountInfoResult = JSON.parse(accountInfoResultStr);
                
                if (!accountInfoResult.success) {
                    console.log(`    Error: ${accountInfoResult.error}`);
                    continue;
                }
                
                const accountInfo = accountInfoResult.accountInfo;
                const accountData = accountInfo?.data || accountInfo;
                
                let isOnCurve: boolean | null = null;
                let isPDA = false;
                
                if (searchResultParsed.success) {
                    const searchData = searchResultParsed.results?.data?.[0] || searchResultParsed.results?.data;
                    if (searchData && typeof searchData.isOnCurve === "boolean") {
                        isOnCurve = searchData.isOnCurve;
                        isPDA = !isOnCurve;
                    }
                }
                
                if (isOnCurve === null && accountData && typeof accountData.isOnCurve === "boolean") {
                    isOnCurve = accountData.isOnCurve;
                    isPDA = !isOnCurve;
                }
                
                if (isPDA) {
                    console.log(`    ✓ PDA detected (isOnCurve: false) - SKIPPING (PDAs cannot be flagged for illegal activity)`);
                    continue;
                }
                
                const solscanType = accountData?.type || "UNKNOWN";
                const accountType = accountData?.account_type || "unknown";
                const accountLabel = accountData?.account_label || null;
                const accountTags = accountData?.account_tags || [];
                
                console.log(`    isOnCurve: ${isOnCurve === null ? 'unknown' : isOnCurve} | Solscan Type: ${solscanType} | Account Type: ${accountType}${accountLabel ? ` | Label: ${accountLabel}` : ''}`);
                if (accountTags.length > 0) {
                    console.log(`    Tags: ${accountTags.join(", ")}`);
                }
                
                const addrTransactionsResultStr = await fetchTransactionsByAddressTool.invoke({ 
                    address: address, 
                    hoursBack: state.metadata.hoursBack || 10 
                });
                const addrTransactionsResult = JSON.parse(addrTransactionsResultStr);
                
                if (!addrTransactionsResult.success) {
                    console.log(`    Error fetching transactions: ${addrTransactionsResult.error}`);
                    continue;
                }
                
                const addrTransactions = addrTransactionsResult.transactions;
                console.log(`    Found ${addrTransactionsResult.totalTransactions} transactions`);
                
                const pools = new Set<string>();
                const tokens = new Set<string>();
                const counterparties = new Set<string>();
                let totalValue = 0;
                
                addrTransactions.forEach((tx: any) => {
                    if (tx.tokenTransfers) {
                        tx.tokenTransfers.forEach((transfer: any) => {
                            if (transfer.mint) tokens.add(transfer.mint);
                            if (transfer.fromUserAccount && transfer.fromUserAccount !== address) {
                                counterparties.add(transfer.fromUserAccount);
                            }
                            if (transfer.toUserAccount && transfer.toUserAccount !== address) {
                                counterparties.add(transfer.toUserAccount);
                            }
                            totalValue += transfer.tokenAmount || 0;
                        });
                    }
                });
                
                let classification = "unknown";
                let isBenign = false;
                
                if (isPDA) {
                    classification = "pda";
                    isBenign = true;
                } else if (solscanType === "SYSTEM" || solscanType === "system_account" || accountType === "system_account" || accountType === "token_account") {
                    classification = "infrastructure";
                    isBenign = true;
                } else if (solscanType === "UNKNOWN" && !accountLabel && accountTags.length === 0 && isOnCurve !== false) {
                    classification = "likely_trader";
                    isBenign = false;
                } else if (accountTags.includes("jupiter") || accountTags.includes("dex_wallet")) {
                    classification = "known_bot";
                    isBenign = false;
                } else if (accountTags.includes("protocol") || accountTags.includes("program")) {
                    classification = "protocol";
                    isBenign = true;
                } else if (accountType === "program") {
                    classification = "program";
                    isBenign = true;
                } else if (accountLabel && accountLabel.includes("Authority")) {
                    classification = "pda_authority";
                    isBenign = true;
                } else if (accountLabel && (accountTags.includes("dex") || accountTags.includes("market"))) {
                    classification = "dex_pool";
                    isBenign = true;
                } else if (isOnCurve === true) {
                    classification = "likely_trader";
                    isBenign = false;
                } else {
                    classification = "unknown";
                    isBenign = true;
                }
                
                suspiciousAddressProfiles.push({
                    address: address,
                    originalReason: suspiciousAddr.reason,
                    isOnCurve: isOnCurve,
                    isPDA: isPDA,
                    solscanType: solscanType,
                    accountType: accountType,
                    accountLabel: accountLabel,
                    accountTags: accountTags,
                    classification: classification,
                    isBenign: isBenign,
                    transactionCount: addrTransactions.length,
                    uniquePools: counterparties.size,
                    uniqueTokens: tokens.size,
                    totalVolume: totalValue,
                    activities: {
                        isMultiPoolTrader: counterparties.size > 3,
                        isHighFrequency: addrTransactions.length > 50,
                        tradesMultipleTokens: tokens.size > 2,
                        estimatedBotLikelihood: !isBenign && addrTransactions.length > 50 && counterparties.size > 3 ? "HIGH" : 
                                               !isBenign && addrTransactions.length > 20 ? "MEDIUM" : "LOW"
                    },
                    sampleTransactions: addrTransactions.slice(0, 3).map((tx: any) => ({
                        type: tx.type,
                        timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null,
                        tokenTransfers: tx.tokenTransfers?.length || 0
                    }))
                });
                
            } catch (error) {
                console.log(`    Error fetching data for ${address.substring(0, 8)}`);
            }
        }
        
        console.log(`\nDeep dive complete: Analyzed ${suspiciousAddressProfiles.length} addresses`);
        
        return {
            metadata: {
                ...state.metadata,
                suspiciousAddressProfiles: suspiciousAddressProfiles
            }
        };
        
    } catch (error: any) {
        console.error("Error in deep dive:", error);
        return {
            metadata: {
                ...state.metadata,
                deepDiveError: error.message
            }
        };
    }
}

export async function formatResponseNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log("\n[Node: Format Response] Formatting final output...");
    
    if (state.error) {
        return {
            analysis: `Error: ${state.error}\n\nPlease check your query and try again.`
        };
    }
    
    return {
        analysis: state.analysis || "No analysis available"
    };
}
