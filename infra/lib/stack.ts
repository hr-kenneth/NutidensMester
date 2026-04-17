import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export class NutidensMesterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) throw new Error("Set COGNITO_USER_POOL_ID env var before deploying");

    // ── DynamoDB ──────────────────────────────────────────────────────────────

    const table = new dynamodb.Table(this, "Table", {
      tableName: "NutidensMester",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Lambda ────────────────────────────────────────────────────────────────

    const resolverFn = new lambdaNodejs.NodejsFunction(this, "ResolverFn", {
      entry: path.join(__dirname, "../lambda/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      environment: { TABLE_NAME: table.tableName },
      bundling: {
        externalModules: ["@aws-sdk/*"],
        minify: true,
        forceDockerBundling: false,
      },
    });

    table.grantReadWriteData(resolverFn);

    // ── AppSync ───────────────────────────────────────────────────────────────

    const userPool = cognito.UserPool.fromUserPoolArn(
      this, "UserPool",
      `arn:aws:cognito-idp:eu-central-1:${this.account}:userpool/${userPoolId}`
    );

    const api = new appsync.GraphqlApi(this, "Api", {
      name: "NutidensMesterApi",
      definition: appsync.Definition.fromFile(
        path.join(__dirname, "schema.graphql")
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: { userPool },
        },
      },
      xrayEnabled: false,
    });

    // ── Data sources ──────────────────────────────────────────────────────────

    const lambdaDs = api.addLambdaDataSource("LambdaDs", resolverFn);
    const noneDs = api.addNoneDataSource("NoneDs");

    // Queries
    for (const fieldName of ["listMyGroups", "listMembers", "listRoundsInCycle"]) {
      lambdaDs.createResolver(`Query_${fieldName}`, { typeName: "Query", fieldName });
    }

    // Mutations
    for (const fieldName of ["createGroup", "joinGroup", "recordRound"]) {
      lambdaDs.createResolver(`Mutation_${fieldName}`, { typeName: "Mutation", fieldName });
    }

    // Subscription — None data source, pass-through (AppSync fans out via @aws_subscribe)
    noneDs.createResolver("Subscription_onRoundAdded", {
      typeName: "Subscription",
      fieldName: "onRoundAdded",
      requestMappingTemplate: appsync.MappingTemplate.fromString(
        '{"version":"2018-05-29","payload":$util.toJson($context.arguments)}'
      ),
      responseMappingTemplate: appsync.MappingTemplate.fromString(
        "$util.toJson(null)"
      ),
    });

    // ── Outputs ───────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, "GraphqlUrl", {
      value: api.graphqlUrl,
      description: "Set as VITE_APPSYNC_URL in .env.local",
    });
    new cdk.CfnOutput(this, "Region", {
      value: this.region,
      description: "Set as VITE_AWS_REGION in .env.local",
    });
  }
}
