import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  return new Response(
    'google.com, pub-9843041963430696, DIRECT, f08c47fec0942fa0\n',
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    }
  );
};
