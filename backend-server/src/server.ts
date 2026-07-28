import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/api/v1/health', async () => ({ status: 'ok' }));

const port = parseInt(process.env.PORT || '5172', 10);
app.listen({ port }).then(() => {
  console.log(`Server listening on port ${port}`);
});
