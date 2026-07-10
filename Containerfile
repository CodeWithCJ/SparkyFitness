FROM node:24-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY SparkyFitnessFrontend/package.json SparkyFitnessFrontend/package.json
COPY shared/package.json shared/package.json
COPY patches patches

RUN pnpm install --frozen-lockfile --filter sparkyfitnessfrontend...

ENV NODE_ENV=production

COPY SparkyFitnessFrontend SparkyFitnessFrontend
COPY shared shared

RUN pnpm --dir SparkyFitnessFrontend exec vite build

CMD ["node", "SparkyFitnessFrontend/scripts/serve-vercel.mjs"]
