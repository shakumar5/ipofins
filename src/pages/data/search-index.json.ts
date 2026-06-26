import type { APIRoute } from 'astro';
import { buildSiteSearchIndex } from '../../lib/site-search-index';

export const prerender = true;

export const GET: APIRoute = async () => {
  const items = await buildSiteSearchIndex();
  return new Response(JSON.stringify(items), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
