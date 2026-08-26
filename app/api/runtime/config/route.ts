import { publicLlmConfig } from '../../../../lib/runtime/llm-config';

export async function GET() {
  return Response.json(publicLlmConfig(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
