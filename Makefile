BINARY_NAME=mock-api
BINARY_DIR=bin

.PHONY: build
build:
	mkdir -p ${BINARY_DIR}
	go build -o ${BINARY_DIR}/${BINARY_NAME} main.go

.PHONY: run
run: build
	./${BINARY_DIR}/${BINARY_NAME}

.PHONY: clean
clean:
	go clean
	rm -rf ${BINARY_DIR}

.PHONY: deps
deps:
	go mod download

.PHONY: install
install:
	go mod tidy
	go mod download
