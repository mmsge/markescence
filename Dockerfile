FROM node:22-alpine

WORKDIR /app

# Fonts needed by resvg-js for OG image text rendering
RUN apk add --no-cache font-noto

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY index.html ./
COPY robots.txt ./
COPY sitemap.xml ./

RUN mkdir -p db

EXPOSE 4001

CMD ["node", "server.js"]
