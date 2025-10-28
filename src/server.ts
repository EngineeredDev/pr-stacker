import { Probot, Server } from "probot";
import app from "./index.js";

/**
 * Custom server initialization to filter out HTTP webhook logs
 * while keeping LOG_LEVEL=info for application logs
 */

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
	throw new Error("PRIVATE_KEY environment variable is required");
}

const serverOptions = {
	Probot: Probot.defaults({
		appId: process.env.APP_ID,
		privateKey: privateKey,
		secret: process.env.WEBHOOK_SECRET,
	}),
	loggingOptions: {
		// Filter out HTTP logs for webhook endpoint to reduce spam
		// while keeping LOG_LEVEL=info for context.log.info() calls
		autoLogging: {
			ignore: (req: { method?: string; url?: string }) => {
				// Ignore POST requests to the GitHub webhook endpoint
				return !!(
					req.method === "POST" && req.url?.includes("/api/github/webhooks")
				);
			},
		},
	},
};

const server = new Server(serverOptions);

async function main() {
	await server.load(app);
	await server.start();
}

main().catch((error) => {
	console.error("Failed to start server:", error);
	process.exit(1);
});
