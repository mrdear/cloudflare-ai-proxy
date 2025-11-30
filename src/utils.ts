import { OpenAI } from "openai";
import { HOST, Model } from "./constant";

export function createClient(env: Bindings, model: Model): OpenAI {
    const client = new OpenAI({
        apiKey: "-",
        baseURL: HOST + model.endpoint,
        defaultHeaders: {
            "cf-aig-authorization": `Bearer ${env.CF_GATEWAY_KEY}`,
            "Authorization": null, // Prevent sending default Authorization header
        },
    });
    return client;
}
