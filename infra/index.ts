import * as fs from "node:fs";
import * as path from "node:path";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as esbuild from "esbuild";

const config = new pulumi.Config();

const buildDir = "dist";
if (!fs.existsSync(buildDir)) {
	fs.mkdirSync(buildDir);
}

esbuild.buildSync({
	entryPoints: ["../src/handler.ts"],
	bundle: true,
	platform: "node",
	target: "node18",
	outfile: path.join(buildDir, "handler.js"),
	external: ["aws-sdk"],
});

// Create an IAM role for the Lambda function
const lambdaRole = new aws.iam.Role("probot-lambda-role", {
	assumeRolePolicy: JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Action: "sts:AssumeRole",
				Effect: "Allow",
				Principal: {
					Service: "lambda.amazonaws.com",
				},
			},
		],
	}),
});

// Attach the basic execution role policy to the Lambda role
const lambdaRolePolicy = new aws.iam.RolePolicyAttachment(
	"probot-lambda-role-policy",
	{
		role: lambdaRole.name,
		policyArn:
			"arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
	},
);

// Create a Parameter Store parameter for each GitHub App credential
const appId = new aws.ssm.Parameter("github-app-id", {
	type: "SecureString",
	value: config.requireSecret("githubAppId"),
});

const webhookSecret = new aws.ssm.Parameter("github-webhook-secret", {
	type: "SecureString",
	value: config.requireSecret("githubWebhookSecret"),
});

const privateKey = new aws.ssm.Parameter("github-private-key", {
	type: "SecureString",
	value: config.requireSecret("githubPrivateKey"),
});

const clientId = new aws.ssm.Parameter("github-client-id", {
	type: "SecureString",
	value: config.requireSecret("githubClientId"),
});

const clientSecret = new aws.ssm.Parameter("github-client-secret", {
	type: "SecureString",
	value: config.requireSecret("githubClientSecret"),
});

const sentryDsn = new aws.ssm.Parameter("sentry-dsn", {
	type: "SecureString",
	value: config.requireSecret("sentryDsn"),
});

// Grant Lambda permission to read the parameters
const parameterPolicy = new aws.iam.Policy("parameter-access-policy", {
	policy: {
		Version: "2012-10-17",
		Statement: [
			{
				Action: ["ssm:GetParameter"],
				Effect: "Allow",
				Resource: [
					appId.arn,
					webhookSecret.arn,
					privateKey.arn,
					clientId.arn,
					clientSecret.arn,
					sentryDsn.arn,
				],
			},
		],
	},
});

const parameterPolicyAttachment = new aws.iam.RolePolicyAttachment(
	"parameter-policy-attachment",
	{
		role: lambdaRole.name,
		policyArn: parameterPolicy.arn,
	},
);

// Create the Lambda function
const lambdaFunction = new aws.lambda.Function("probot-lambda", {
	runtime: aws.lambda.Runtime.NodeJS22dX,
	role: lambdaRole.arn,
	handler: "handler.handler",
	code: new pulumi.asset.AssetArchive({
		".": new pulumi.asset.FileArchive(buildDir),
	}),
	environment: {
		variables: {
			APP_ID: appId.value,
			WEBHOOK_SECRET: webhookSecret.value,
			PRIVATE_KEY: privateKey.value,
			GITHUB_CLIENT_ID: clientId.value,
			GITHUB_CLIENT_SECRET: clientSecret.value,
			SENTRY_DSN: sentryDsn.value,
			NODE_ENV: "production",
		},
	},
	timeout: 30,
});

// Create an API Gateway REST API
const api = new aws.apigateway.RestApi("probot-api", {
	description: "GitHub Webhook API",
});

// Create a resource for the webhook endpoint
const webhookResource = new aws.apigateway.Resource("webhook-resource", {
	parentId: api.rootResourceId,
	pathPart: "github",
	restApi: api.id,
});

// Create an HTTP method for the resource
const webhookMethod = new aws.apigateway.Method("webhook-method", {
	httpMethod: "POST",
	authorization: "NONE",
	restApi: api.id,
	resourceId: webhookResource.id,
});

// Create an integration between the API Gateway and Lambda
const integration = new aws.apigateway.Integration("lambda-integration", {
	restApi: api.id,
	resourceId: webhookResource.id,
	httpMethod: webhookMethod.httpMethod,
	integrationHttpMethod: "POST",
	type: "AWS_PROXY",
	uri: lambdaFunction.invokeArn,
});

// Grant API Gateway permission to invoke the Lambda function
const permission = new aws.lambda.Permission("api-gateway-permission", {
	action: "lambda:InvokeFunction",
	function: lambdaFunction.name,
	principal: "apigateway.amazonaws.com",
	sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

// Deploy the API Gateway
const deployment = new aws.apigateway.Deployment(
	"api-deployment",
	{
		restApi: api.id,
	},
	{
		dependsOn: [integration],
	},
);

// Create a stage for the deployment
const stage = new aws.apigateway.Stage("production", {
	deployment: deployment.id,
	restApi: api.id,
	stageName: "prod",
});

// Export the URL of the API Gateway
export const webhookUrl = pulumi.interpolate`${stage.invokeUrl}/github`;
