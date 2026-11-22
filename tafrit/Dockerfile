FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY data ./data
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "--no-warnings", "server/index.js"]
