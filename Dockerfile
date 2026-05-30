FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure the data directory and uploads directory exist and have relaxed permissions
RUN mkdir -p /app/data /app/data/uploads && chmod -R 777 /app/data

EXPOSE 3000

ENV PORT=3000 \
    NODE_ENV=production

CMD ["node", "server.js"]
