FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy go.mod
COPY go.mod ./

# Download dependencies and generate go.sum
RUN go mod tidy

COPY . .

RUN go build -o main .

FROM alpine:latest

# Set the working directory
WORKDIR /app

# Copy the built executable from the builder stage
COPY --from=builder /app/main .

# Copy the static files
COPY static ./static

# Expose the port the application will run on
EXPOSE 8080

# Command to run the executable
CMD ["./main"]