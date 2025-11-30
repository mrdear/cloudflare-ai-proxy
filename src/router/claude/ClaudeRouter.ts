import { Hono } from "hono";
import { OpenAI } from "openai";
import { streamSSE } from "hono/streaming";
import { getSupportedModels } from "../../constant";
import { createClient } from "../../utils";
import * as Claude from "./ClaudeTypes";
import * as Adapter from "./ClaudeAdapter";
import {ClaudeTokenCountRequest} from "./ClaudeTypes";

const claudeRouter = new Hono<{ Bindings: Bindings }>();

// ---------- Claude Adapter ----------

claudeRouter.post("/v1/messages", async (c) => {
    try {
        const req = await c.req.json() as Claude.ClaudeRequest;

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
        const openaiMessages = Adapter.mapMessages(req.messages);
        const openaiTools = Adapter.mapTools(req.tools);

        const openaiReq: any = {
            model: model.id,
            messages: openaiMessages,
            stream: req.stream,
            temperature: req.temperature,
            top_p: req.top_p,
        };
        
        if (openaiTools) {
            openaiReq.tools = openaiTools;
            if (req.tool_choice) {
                 // Simple mapping for tool_choice
                 if (req.tool_choice.type === 'any') {
                     openaiReq.tool_choice = 'required';
                 } else if (req.tool_choice.type === 'tool' && req.tool_choice.name) {
                     openaiReq.tool_choice = { type: 'function', function: { name: req.tool_choice.name } };
                 } else {
                     openaiReq.tool_choice = req.tool_choice.type;
                 }
            }
        }

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
                            usage: { input_tokens: 0, output_tokens: 0 }
                        }
                    })
                });

                let currentBlockIndex = 0;
                let currentBlockType: 'text' | 'tool_use' | null = null;

                for await (const chunk of completionStream) {
                    const delta = chunk.choices[0]?.delta;
                    const finishReason = chunk.choices[0]?.finish_reason;

                    // Handle Text
                    if (delta?.content) {
                        if (currentBlockType !== 'text') {
                             if (currentBlockType !== null) {
                                 // Close previous block
                                 await stream.writeSSE({
                                     event: "content_block_stop",
                                     data: JSON.stringify({ type: "content_block_stop", index: currentBlockIndex })
                                 });
                                 currentBlockIndex++;
                             }
                             
                             // Start text block
                             await stream.writeSSE({
                                 event: "content_block_start",
                                 data: JSON.stringify({
                                     type: "content_block_start",
                                     index: currentBlockIndex,
                                     content_block: { type: "text", text: "" }
                                 })
                             });
                             currentBlockType = 'text';
                        }

                        await stream.writeSSE({
                            event: "content_block_delta",
                            data: JSON.stringify({
                                type: "content_block_delta",
                                index: currentBlockIndex,
                                delta: { type: "text_delta", text: delta.content }
                            })
                        });
                    }

                    // Handle Tool Calls
                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            // If it's a new tool call (has ID)
                            if (tc.id) {
                                if (currentBlockType !== null) {
                                     // Close previous block
                                     await stream.writeSSE({
                                         event: "content_block_stop",
                                         data: JSON.stringify({ type: "content_block_stop", index: currentBlockIndex })
                                     });
                                     currentBlockIndex++;
                                }

                                // Start tool_use block
                                await stream.writeSSE({
                                    event: "content_block_start",
                                    data: JSON.stringify({
                                        type: "content_block_start",
                                        index: currentBlockIndex,
                                        content_block: {
                                            type: "tool_use",
                                            id: tc.id,
                                            name: tc.function?.name || "",
                                            input: {} 
                                        }
                                    })
                                });
                                currentBlockType = 'tool_use';
                            }

                            // If it has arguments
                            if (tc.function?.arguments) {
                                await stream.writeSSE({
                                    event: "content_block_delta",
                                    data: JSON.stringify({
                                        type: "content_block_delta",
                                        index: currentBlockIndex,
                                        delta: { type: "input_json_delta", partial_json: tc.function.arguments }
                                    })
                                });
                            }
                        }
                    }
                    
                    if (finishReason) {
                         if (currentBlockType !== null) {
                             await stream.writeSSE({
                                 event: "content_block_stop",
                                 data: JSON.stringify({ type: "content_block_stop", index: currentBlockIndex })
                             });
                         }
                        
                         const stopReason = finishReason === "tool_calls" ? "tool_use" : "end_turn";
                         
                         await stream.writeSSE({
                            event: "message_delta",
                            data: JSON.stringify({
                                type: "message_delta",
                                delta: { stop_reason: stopReason, stop_sequence: null },
                                usage: { output_tokens: 0 }
                            })
                        });
                    }
                }

                // Send message_stop
                await stream.writeSSE({
                    event: "message_stop",
                    data: JSON.stringify({ type: "message_stop" })
                });
            });

        } else {
            // Non-streaming response
            const openaiResp = await client.chat.completions.create(openaiReq);
            const response = Adapter.mapOpenAIResponse(openaiResp, req.model);
            return c.json(response);
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

claudeRouter.post("/v1/messages/count_tokens", async (c) => {
    try {
        const req = await c.req.json() as ClaudeTokenCountRequest;

        let tokenCount = 0;

        // 1. System Prompt
        if (req.system) {
            tokenCount += Math.ceil(req.system.length / 4);
        }

        // 2. Messages
        for (const msg of req.messages) {
            if (typeof msg.content === "string") {
                tokenCount += Math.ceil(msg.content.length / 4);
            } else if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    if (block.type === "text") {
                        tokenCount += Math.ceil(block.text.length / 4);
                    } else if (block.type === "tool_use") {
                        tokenCount += Math.ceil(block.name.length / 4);
                        tokenCount += Math.ceil(JSON.stringify(block.input).length / 4);
                    } else if (block.type === "tool_result") {
                        if (typeof block.content === "string") {
                            tokenCount += Math.ceil(block.content.length / 4);
                        } else if (Array.isArray(block.content)) {
                             for (const subBlock of block.content) {
                                 if (subBlock.type === "text") {
                                     tokenCount += Math.ceil(subBlock.text.length / 4);
                                 }
                             }
                        }
                    }
                }
            }
            // Add per-message overhead (approx 4 tokens)
            tokenCount += 4;
        }

        // 3. Tools
        if (req.tools) {
            for (const tool of req.tools) {
                tokenCount += Math.ceil(tool.name.length / 4);
                if (tool.description) {
                    tokenCount += Math.ceil(tool.description.length / 4);
                }
                tokenCount += Math.ceil(JSON.stringify(tool.input_schema).length / 4);
            }
        }

        return c.json({ input_tokens: tokenCount });
    } catch (error) {
        console.error("Error in /v1/messages/count_tokens:", error);
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
