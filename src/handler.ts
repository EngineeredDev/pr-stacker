import {
	createLambdaFunction,
	createProbot,
} from "@probot/adapter-aws-lambda-serverless";
import app from "./index.js";

// Export the handler function for Lambda
export const handler = createLambdaFunction(app, {
	probot: createProbot(),
});
