FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
VOLUME /data
EXPOSE 3000 3443
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server/index.js"]
