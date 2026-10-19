import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));

  // API Route: AI Data Assistant ("Ask the data")
  app.post('/api/ask', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(200).json({
          answer: 'The Gemini API key is not configured. Please set the GEMINI_API_KEY environment variable to use the AI assistant.',
          configured: false,
        });
      }

      const { question, context } = req.body;
      if (!question) {
        return res.status(400).json({ error: 'Question is required' });
      }

      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `You are an industrial energy specialist reviewing monthly energy performance data under ISO 50001 / ISO 50002.
Strict rules:
1. Answer ONLY from the JSON context supplied below. Never make up figures or extrapolate beyond provided data.
2. Cite the specific plant, SEU (Significant Energy Use), and period in your answer whenever applicable.
3. If the answer cannot be determined from the provided context, state clearly: "That information is not in the data."
4. Never calculate new EnPIs, regressions, or unverified savings. Use the pre-calculated numbers from the data.
5. Emphasize that SEU diagnoses are hypotheses to verify on-site, not definite conclusions.
6. Note that activity-driven deviations are load effects, not faults.
7. Keep responses concise, objective, and engineering-focused with bullet points where appropriate.`;

      const prompt = `Context:\n${JSON.stringify(context || {}, null, 2)}\n\nQuestion:\n${question}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      const answer = response.text || 'No response generated.';
      return res.json({ answer, configured: true });
    } catch (err: any) {
      console.error('Gemini API error:', err);
      return res.status(500).json({
        error: err.message || 'Failed to generate answer from data assistant.',
      });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Energy Dashboard running at http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
