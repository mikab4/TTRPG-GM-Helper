FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./

EXPOSE 5173

CMD ["sh", "-c", "echo 'Open GM Workspace: http://localhost:5173' && exec npm run dev -- --host 0.0.0.0"]
