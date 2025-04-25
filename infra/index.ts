import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import * as iam from "@pulumi/aws/iam";
import * as path from "node:path";

// Get configuration
const config = new pulumi.Config();

// Create ECR repository for storing the Docker image
const repository = new awsx.ecr.Repository("pr-stacker-repo", {
	forceDelete: true,
});

// Build and push Docker image from the Dockerfile in parent directory
const image = new awsx.ecr.Image("pr-stacker-image", {
	repositoryUrl: repository.url,
	context: path.join(__dirname, ".."),
	platform: "linux/amd64",
});

// Create an ECS cluster
const cluster = new aws.ecs.Cluster("pr-stacker-cluster");

// Create a load balancer for the service
const lb = new awsx.lb.ApplicationLoadBalancer("pr-stacker-lb", {
	defaultTargetGroup: {
		port: 3000,
		protocol: "HTTP",
		healthCheck: {
			path: "/health",
			protocol: "HTTP",
			interval: 30,
			timeout: 5,
			healthyThreshold: 2,
			unhealthyThreshold: 2,
		},
	},
});

// Create SSM parameters for GitHub app credentials
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

// Create the ECS task execution role with proper permissions
const ecsTaskExecutionRole = new aws.iam.Role("ecs-task-execution-role", {
	assumeRolePolicy: JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Effect: "Allow",
				Principal: {
					Service: "ecs-tasks.amazonaws.com",
				},
				Action: "sts:AssumeRole",
			},
		],
	}),
});

// Attach the ECS task execution policy
new aws.iam.RolePolicyAttachment("ecs-task-execution-policy", {
	role: ecsTaskExecutionRole.name,
	policyArn:
		"arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

const policyDocument = {
	Version: "2012-10-17",
	Statement: [
		{
			Effect: "Allow",
			Action: [
				"ssm:GetParameters",
				"secretsmanager:GetSecretValue",
				"kms:Decrypt",
			],
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
};

// Create the policy with the document
const ssmParameterPolicy = new aws.iam.Policy("ssm-parameter-access", {
	policy: iam.getPolicyDocumentOutput({
		statements: [
			{
				actions: [
					"ssm:GetParameters",
					"secretsmanager:GetSecretValue",
					"kms:Decrypt",
				],
				resources: [
					appId.arn,
					webhookSecret.arn,
					privateKey.arn,
					clientId.arn,
					clientSecret.arn,
					sentryDsn.arn,
				],
				effect: "Allow",
			},
		],
	}).json,
});

// Attach the SSM policy to the execution role
new aws.iam.RolePolicyAttachment("ssm-policy-attachment", {
	role: ecsTaskExecutionRole.name,
	policyArn: ssmParameterPolicy.arn,
});

// Create a Fargate service to run the container
const service = new awsx.ecs.FargateService("pr-stacker-service", {
	cluster: cluster.arn,
	assignPublicIp: true,
	taskDefinitionArgs: {
		container: {
			name: "pr-stacker",
			image: image.imageUri,
			cpu: 256,
			memory: 512,
			essential: true,
			portMappings: [
				{
					containerPort: 3000,
					hostPort: 3000,
					targetGroup: lb.defaultTargetGroup,
				},
			],
			environment: [{ name: "NODE_ENV", value: "production" }],
			secrets: [
				{ name: "APP_ID", valueFrom: appId.arn },
				{ name: "WEBHOOK_SECRET", valueFrom: webhookSecret.arn },
				{ name: "PRIVATE_KEY", valueFrom: privateKey.arn },
				{ name: "GITHUB_CLIENT_ID", valueFrom: clientId.arn },
				{ name: "GITHUB_CLIENT_SECRET", valueFrom: clientSecret.arn },
				{ name: "SENTRY_DSN", valueFrom: sentryDsn.arn },
			],
			// logConfiguration: {
			// 	logDriver: "awslogs",
			// 	options: {
			// 		"awslogs-group": "/ecs/pr-stacker",
			// 		"awslogs-region": aws.config.requireRegion(),
			// 		"awslogs-stream-prefix": "ecs",
			// 		"awslogs-create-group": "true",
			// 	},
			// },
		},
		executionRole: {
			roleArn: ecsTaskExecutionRole.arn,
		},
		taskRole: {
			roleArn: ecsTaskExecutionRole.arn,
		},
	},
});

// Export the webhook URL
export const webhookUrl = pulumi.interpolate`http://${lb.loadBalancer.dnsName}`;
