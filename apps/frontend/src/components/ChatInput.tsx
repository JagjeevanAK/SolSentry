import { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ChatInputProps {
    onSubmit: (query: string) => void;
    isLoading?: boolean;
}

export function ChatInput({ onSubmit, isLoading = false }: ChatInputProps) {
    const [query, setQuery] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSubmit(query);
        }
    };

    return (
        <div className="w-full">
            <form onSubmit={handleSubmit} className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-2xl opacity-30 group-hover:opacity-50 blur transition-smooth" />

                <div className="relative flex gap-3 p-2 glass-card rounded-2xl">
                    <div className="flex-1 relative">
                        <Input
                            placeholder="Enter wallet address or transaction signature..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={isLoading}
                            className="h-14 text-base bg-background/50 border-border/50 rounded-xl pl-12 pr-4 focus-visible:ring-primary/30 transition-smooth"
                        />
                        <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/60" />
                    </div>

                    <Button
                        type="submit"
                        size="lg"
                        disabled={isLoading || !query.trim()}
                        className="h-14 px-8 rounded-xl bg-gradient-to-r from-primary to-accent hover:shadow-lg hover:shadow-primary/25 hover:scale-105 transition-smooth group"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                <span className="ml-2 font-semibold">Analyze</span>
                            </>
                        )}
                    </Button>
                </div>
            </form>

            {/* Example queries */}
            <div className="mt-6 text-center">
                <p className="text-xs text-muted-foreground mb-3">Try example queries:</p>
                <div className="flex flex-wrap justify-center gap-2">
                    {['Wallet Analysis', 'Transaction Trace', 'Risk Assessment'].map((example) => (
                        <button
                            key={example}
                            onClick={() => setQuery(`Analyze ${example.toLowerCase()}`)}
                            className="text-xs px-3 py-1.5 rounded-full glass border border-border/50 hover:border-primary/50 text-muted-foreground hover:text-foreground transition-smooth"
                            disabled={isLoading}
                        >
                            {example}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
