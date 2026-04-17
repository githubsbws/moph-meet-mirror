# Stage 1: Build the Nuxt application
FROM node:22-alpine AS build

WORKDIR /app

# Enable Corepack for pnpm, yarn, or npm
RUN corepack enable

# Copy package.json and lockfile (e.g., pnpm-lock.yaml)
COPY package.json pnpm-lock.yaml .npmrc ./

# Install dependencies
RUN pnpm i

# Copy the entire project
COPY . ./

# Build the Nuxt application (generates static assets for CSR)
RUN pnpm run build

# Stage 2: Serve the built application with a lightweight server
FROM node:22-alpine

WORKDIR /app

# Copy only the necessary output from the build stage
COPY --from=build /app/.output/ ./

# Set environment variables for port and host
ENV PORT=80
ENV HOST=0.0.0.0

# Expose the port
EXPOSE 80

# Command to start the Nuxt server (which will serve the static assets)
CMD ["node", "/app/server/index.mjs"]