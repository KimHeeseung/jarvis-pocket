FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
EXPOSE 8787
CMD ["node", "server/index.mjs"]
