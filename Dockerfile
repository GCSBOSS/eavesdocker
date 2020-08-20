
FROM node:13-alpine

COPY package*.json ./
RUN npm i -P
COPY . .

RUN mkdir /dist
RUN cp -r ./lib /dist/
RUN cp -r ./node_modules /dist/
RUN cp package*.json /dist/

FROM gcsboss/nodecaf:0.10.1
COPY --from=0 /dist /app
