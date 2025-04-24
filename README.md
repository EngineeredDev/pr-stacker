# pr-stacker-bot

> A GitHub App built with [Probot](https://github.com/probot/probot) for easy folding of stacked PR's on Github.

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Docker

```sh
# 1. Build container
docker build -t pr-stacker .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> pr-stacker
```

## Contributing

If you have suggestions for pr-stacker could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2025 EngineeredDev
