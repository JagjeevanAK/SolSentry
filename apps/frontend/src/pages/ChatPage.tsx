import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChatInput } from '@/components/ChatInput';
import { ThemeToggle } from '@/components/ThemeToggle';

export function ChatPage() {
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleSearch = async (query: string) => {
        setIsLoading(true);
        try {
            const response = await axios.post('http://localhost:3000/query', {
                query,
                userId: 'guest',
            });

            const { jobId } = response.data;
            navigate(`/result/${jobId}`);
        } catch (error) {
            console.error('Error submitting query:', error);
            alert('Failed to submit query. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Animated Background */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-background" />
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-background animate-gradient opacity-50" />
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-glow" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
            </div>

            {/* Content */}
            <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8 relative z-10">
                <div className="w-full max-w-4xl space-y-16">
                    {/* Hero Section */}
                    <div className="text-center space-y-8 animate-float">
                        <div className="space-y-4">
                            <h1 className="text-7xl sm:text-8xl lg:text-9xl font-black tracking-tight">
                                <span className="gradient-text-vibrant">SolSentry</span>
                            </h1>
                            <p className="text-2xl sm:text-3xl font-light text-muted-foreground tracking-wide">
                                Advanced AI-Powered Analysis
                            </p>
                        </div>

                        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed px-4">
                            Unlock deep insights into Solana wallets and transactions.
                            Detect risks, visualize patterns, and analyze blockchain data with cutting-edge AI.
                        </p>
                    </div>

                    {/* Search Input */}
                    <div className="w-full max-w-3xl mx-auto">
                        <ChatInput onSubmit={handleSearch} isLoading={isLoading} />
                    </div>

                    {/* Status Footer */}
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-8 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2.5 glass-card px-4 py-2 rounded-full">
                            <div className="relative">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-500/50 animate-ping" />
                            </div>
                            <span className="font-medium">System Online</span>
                        </div>
                        <div className="glass-card px-4 py-2 rounded-full font-mono text-xs">
                            v1.0.0
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
