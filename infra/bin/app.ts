import * as cdk from "aws-cdk-lib";
import { NutidensMesterStack } from "../lib/stack";

const app = new cdk.App();
new NutidensMesterStack(app, "NutidensMesterStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "eu-central-1",
  },
});
