# MCP server image for Amazon Bedrock AgentCore Runtime (ARM64, port 8000).
# The platform is set by the CDK asset (`Platform.LINUX_ARM64`).

FROM public.ecr.aws/docker/library/node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run bundle:server

FROM public.ecr.aws/docker/library/node:22-slim
ENV NODE_ENV=production
WORKDIR /app
# One self-contained bundle: no node_modules in the runtime image.
COPY --from=build /app/dist/server.mjs ./server.mjs
USER node
EXPOSE 8000
CMD ["node", "server.mjs"]
