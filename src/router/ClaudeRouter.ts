import { Hono } from "hono";
import { OpenAI } from "openai";
import { streamSSE } from "hono/streaming";
import { getSupportedModels } from "../constant";
import { createClient } from "../utils";

// ---------- Claude Types ----------
interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string | { type: string; text?: string; source?: any }[];
}

interface ClaudeRequest {
    model: string;
    messages: ClaudeMessage[];
    system?: string;
    max_tokens?: number;
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    top_k?: number;
}

const claudeRouter = new Hono<{ Bindings: Bindings }>();

// ---------- Claude Adapter ----------

claudeRouter.post("/v1/messages", async (c) => {
    try {
        const req = await c.req.json() as ClaudeRequest;

        // 1. Model mapping
        const supportedModels = getSupportedModels(c.env);
        const model = supportedModels.find(x => x.name == req.model);
        if (!model) {
            return c.json({
                type: "error",
                error: {
                    type: "invalid_request_error",
                    message: `Model ${req.model} not supported`
                }
            }, 400);
        }

        // 2. Request transformation (Claude -> OpenAI)
        const openaiMessages: any[] = [];

        // Handle system prompt
        if (req.system) {
            openaiMessages.push({ role: "system", content: req.system });
        }

        // Handle messages
        for (const msg of req.messages) {
            let content = "";
            if (typeof msg.content === "string") {
                content = msg.content;
            } else if (Array.isArray(msg.content)) {
                // Simple concatenation for text blocks, ignoring images for now as OpenAI generic interface might differ
                content = msg.content
                    .filter(block => block.type === "text")
                    .map(block => block.text)
                    .join("\n");
            }
            openaiMessages.push({ role: msg.role, content });
        }

        const openaiReq: any = {
            model: model.id,
            messages: openaiMessages,
            stream: req.stream,
            temperature: req.temperature,
            top_p: req.top_p,
        };
        if (req.max_tokens) {
            openaiReq.max_tokens = req.max_tokens;
        }

        const client = createClient(c.env, model);

        // 3. Response transformation
        if (req.stream) {
            const abortController = new AbortController();
            const msgId = "msg_" + Math.random().toString(36).substring(2, 15);

            return streamSSE(c, async (stream: any) => {
                stream.onAbort(() => {
                    abortController.abort();
                });

                const completionStream = await client.chat.completions.create(
                    { ...openaiReq, stream: true },
                    { signal: abortController.signal }
                ) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

                // Send message_start
                await stream.writeSSE({
                    event: "message_start",
                    data: JSON.stringify({
                        type: "message_start",
                        message: {
                            id: msgId,
                            type: "message",
                            role: "assistant",
                            model: req.model,
                            content: [],
                            stop_reason: null,
                            stop_sequence: null,
                            usage: { input_tokens: 0, output_tokens: 0 } // Dummy usage
                        }
                    })
                });

                // Send content_block_start
                await stream.writeSSE({
                    event: "content_block_start",
                    data: JSON.stringify({
                        type: "content_block_start",
                        index: 0,
                        content_block: { type: "text", text: "" }
                    })
                });

                for await (const chunk of completionStream) {
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        await stream.writeSSE({
                            event: "content_block_delta",
                            data: JSON.stringify({
                                type: "content_block_delta",
                                index: 0,
                                delta: { type: "text_delta", text: content }
                            })
                        });
                    }
                }

                // Send content_block_stop
                await stream.writeSSE({
                    event: "content_block_stop",
                    data: JSON.stringify({
                        type: "content_block_stop",
                        index: 0
                    })
                });

                // Send message_delta (stop reason)
                await stream.writeSSE({
                    event: "message_delta",
                    data: JSON.stringify({
                        type: "message_delta",
                        delta: { stop_reason: "end_turn", stop_sequence: null },
                        usage: { output_tokens: 0 }
                    })
                });

                // Send message_stop
                await stream.writeSSE({
                    event: "message_stop",
                    data: JSON.stringify({ type: "message_stop" })
                });
            });

        } else {
            // Non-streaming response
            const openaiResp = await client.chat.completions.create(openaiReq);
            const contentText = openaiResp.choices[0]?.message?.content || "";

            return c.json({
                id: "msg_" + openaiResp.id,
                type: "message",
                role: "assistant",
                model: req.model,
                content: [
                    {
                        type: "text",
                        text: contentText
                    }
                ],
                stop_reason: "end_turn",
                stop_sequence: null,
                usage: {
                    input_tokens: openaiResp.usage?.prompt_tokens || 0,
                    output_tokens: openaiResp.usage?.completion_tokens || 0
                }
            });
        }
    } catch (error) {
        console.error("Error in /v1/messages:", error);
        return c.json({
            type: "error",
            error: {
                type: "api_error",
                message: error instanceof Error ? error.message : "Internal server error"
            }
        }, 500);
    }
});

export default claudeRouter;
