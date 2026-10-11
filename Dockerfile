FROM node:20-alpine

RUN apk update && apk add --no-cache openjdk21-jre \
    && npm install -g firebase-tools

WORKDIR /app

EXPOSE 4000 9099 8080 5000

CMD ["firebase", "emulators:start", "--project", "campusreservage"]