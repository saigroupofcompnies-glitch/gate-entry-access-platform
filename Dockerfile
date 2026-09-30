FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY client ./client
COPY server ./server
RUN npm install
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4170
EXPOSE 4170
VOLUME ["/app/data"]
CMD ["node", "server/index.js"]
