export default async () => {
  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = {
  path: '/api/health',
};
