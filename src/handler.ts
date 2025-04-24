import * as Sentry from "@sentry/aws-serverless";

import {
	createLambdaFunction,
	createProbot,
} from "@probot/adapter-aws-lambda-serverless";
import app from "./index.js";

Sentry.init({
	dsn: process.env.SENTRY_DSN,
});

export const handler = Sentry.wrapHandler(async () => {
	return createLambdaFunction(app, {
		probot: createProbot(),
	});
});
