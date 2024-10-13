import { useState } from "react";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
  baseURL: "https://api.aimlapi.com/v1",
});

interface UseAiReturn {
  generateImage: (model: string, prompt: string) => Promise<string | null>;
  generatePrompt: (model: string, prompt: string) => Promise<string | null>;
  isLoading: boolean;
  error: string | null;
}

const useAi = (): UseAiReturn => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const generateImage = async (
    model: string = "dall-e-3",
    prompt: string
  ): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await openai.images.generate({
        model: model,
        prompt: prompt,
        n: 1,
        size: "1024x1024",
      });
      setIsLoading(false);
      return response.data[0].url || null;
    } catch (err) {
      setIsLoading(false);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
      return null;
    }
  };

  const generatePrompt = async (
    model: string,
    prompt: string
  ): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "assistant",
            content:
              "You are an AI assistant that generates image prompts. Transform the user's input into a refined, interesting prompt for a generative AI to create a picture. Return only the prompt, nothing else.",
          },
          {
            role: "user",
            content: "This is the prompt to transform: " + prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.7,
      });

      const generatedPrompt = response.choices[0].message.content?.trim();
      if (!generatedPrompt) {
        throw new Error("No prompt generated");
      }
      setIsLoading(false);
      return response.choices[0].message.content || null;
    } catch (err) {
      setIsLoading(false);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
      return null;
    }
  };

  return { generateImage, generatePrompt, isLoading, error };
};

export default useAi;
