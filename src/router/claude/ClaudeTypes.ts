export type ClaudeRole = 'user' | 'assistant';

export interface ClaudeToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: any;
}

export interface ClaudeToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content?: string | { type: 'text'; text: string }[]; // Simplified
    is_error?: boolean;
}

export interface ClaudeTextBlock {
    type: 'text';
    text: string;
}

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock | ClaudeToolResultBlock;

export interface ClaudeMessage {
    role: ClaudeRole;
    content: string | ClaudeContentBlock[];
}

export interface ClaudeTool {
    name: string;
    description?: string;
    input_schema: any;
}

export interface ClaudeRequest {
    model: string;
    messages: ClaudeMessage[];
    system?: string;
    max_tokens?: number;
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    tools?: ClaudeTool[];
    tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
}

// Response types
export interface ClaudeUsage {
    input_tokens: number;
    output_tokens: number;
}

export interface ClaudeResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ClaudeContentBlock[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: ClaudeUsage;
}

export interface ClaudeThinkingConfig {
    type: "enabled";
    budget_tokens: number;
}

export interface ClaudeTokenCountRequest {
    model: string;
    messages: ClaudeMessage[];
    system?: string;
    tools?: ClaudeTool[];
    tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
    thinking?: ClaudeThinkingConfig;
}
