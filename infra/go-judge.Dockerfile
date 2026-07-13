FROM golang:1.25.0-bookworm AS builder
WORKDIR /src
COPY services/go-judge/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /out/go-judge ./cmd/go-judge

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates g++ \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/go-judge /usr/local/bin/go-judge
ENTRYPOINT ["/usr/local/bin/go-judge"]
