require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function checkAvailableModels() {
    try {
        console.log("Checking models for API Key...");
        // This asks Google: "What models can I use?"
        const modelList = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).apiKey; // Dummy call to init
        
        // We use the raw API list method
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
        );
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        console.log("\n=== YOUR AVAILABLE MODELS ===");
        if (data.models) {
            data.models.forEach(m => {
                // Only show "generateContent" models (the ones for chatbots)
                if (m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`✅ ${m.name.replace('models/', '')}`);
                }
            });
        } else {
            console.log("No models found. Check your API Key permissions.");
        }
        console.log("=============================\n");

    } catch (error) {
        console.error("FAILED:", error.message);
    }
}

checkAvailableModels();