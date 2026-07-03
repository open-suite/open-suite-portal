FROM --platform=$BUILDPLATFORM node:22-alpine3.21 AS dev

WORKDIR /app

# Set build arguments
ARG NEXT_PUBLIC_BACKEND_BASE_URL

# Set environment variables for Next.js
ENV NEXT_PUBLIC_BACKEND_BASE_URL=$NEXT_PUBLIC_BACKEND_BASE_URL

COPY package.json package-lock.json next.config.ts tsconfig.json /app/
COPY src /app/src
COPY messages /app/messages

RUN npm ci

CMD ["npm", "run", "dev"]

FROM dev AS build

RUN npm run build

# NOTE: no --platform here — the runtime stage must be the TARGET platform.
# (BUILDPLATFORM on the node stages is fine: the static export is arch-neutral,
# building on the runner's native arch skips QEMU.)
FROM nginxinc/nginx-unprivileged:1.28-alpine3.21 AS prod

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
