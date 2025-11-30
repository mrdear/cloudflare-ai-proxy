export interface Model {
    id: string;
    name: string;
    endpoint: string;
}

export const HOST = "https://gateway.ai.cloudflare.com";

// Load models from environment
export function getSupportedModels(env: Bindings): Model[] {
    try {
        // Handle both string (from .dev.vars) and object (from Cloudflare Dashboard)
        const config = typeof env.MODELS_CONFIG === 'string'
            ? JSON.parse(env.MODELS_CONFIG)
            : env.MODELS_CONFIG;

        return config as Model[];
    } catch (error) {
        console.error("Failed to parse MODELS_CONFIG:", error);
        throw error;
    }
}
