import { OpenAI } from "openai";
import * as Claude from "./ClaudeTypes";

export function mapTools(tools?: Claude.ClaudeTool[]): OpenAI.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(tool => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
        }
    }));
}

export function mapMessages(messages: Claude.ClaudeMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
        if (typeof msg.content === "string") {
            openaiMessages.push({ role: msg.role as any, content: msg.content });
            continue;
        }

        // Handle complex content
        const textBlocks = msg.content.filter(b => b.type === "text") as Claude.ClaudeTextBlock[];
        const toolUseBlocks = msg.content.filter(b => b.type === "tool_use") as Claude.ClaudeToolUseBlock[];
        const toolResultBlocks = msg.content.filter(b => b.type === "tool_result") as Claude.ClaudeToolResultBlock[];

        // 1. Consolidate Text (if any)
        let textContent = textBlocks.map(b => b.text).join("\n");

        if (msg.role === "assistant") {
             // Assistant can have text + tool_calls
             const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = toolUseBlocks.map(block => ({
                 id: block.id,
                 type: "function",
                 function: {
                     name: block.name,
                     arguments: JSON.stringify(block.input)
                 }
             }));

             openaiMessages.push({
                 role: "assistant",
                 content: textContent || null, // OpenAI allows null content if tool_calls are present
                 tool_calls: toolCalls.length > 0 ? toolCalls : undefined
             });
        } else if (msg.role === "user") {
            // User message can have text, image (ignored for now), or tool_result
            
            // If there is text, push a user message
            if (textContent) {
                openaiMessages.push({ role: "user", content: textContent });
            }

            // Push separate tool messages for each result
            for (const res of toolResultBlocks) {
                let contentStr = "";
                if (typeof res.content === 'string') {
                    contentStr = res.content;
                } else if (Array.isArray(res.content)) {
                    contentStr = res.content.map(c => c.text).join("\n");
                }
                
                openaiMessages.push({
                    role: "tool",
                    tool_call_id: res.tool_use_id,
                    content: contentStr
                });
            }
        }
    }
    
    return openaiMessages;
}

export function mapOpenAIResponse(
    openaiResp: OpenAI.Chat.Completions.ChatCompletion,
    model: string
): Claude.ClaudeResponse {
    const choice = openaiResp.choices[0];
    const msg = choice?.message;
    const content: Claude.ClaudeContentBlock[] = [];

    if (msg?.content) {
        content.push({ type: "text", text: msg.content });
    }

    if (msg?.tool_calls) {
        for (const toolCall of msg.tool_calls) {
            content.push({
                type: "tool_use",
                id: toolCall.id,
                // @ts-ignore
                name: toolCall.function.name,
                // @ts-ignore
                input: JSON.parse(toolCall.function.arguments)
            });
        }
    }

    return {
        id: "msg_" + openaiResp.id,
        type: "message",
        role: "assistant",
        model: model,
        content: content,
        stop_reason: choice?.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
        stop_sequence: null,
        usage: {
            input_tokens: openaiResp.usage?.prompt_tokens || 0,
            output_tokens: openaiResp.usage?.completion_tokens || 0
        }
    };
}
