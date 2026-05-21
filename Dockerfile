FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY index.html ./

RUN mkdir -p db

EXPOSE 4001

CMD ["node", "server.js"]
