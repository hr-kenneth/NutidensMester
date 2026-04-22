import os

import aws_cdk as cdk
from aws_cdk import (
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_dynamodb as dynamodb,
    aws_appsync as appsync,
    aws_cognito as cognito,
    aws_lambda as lambda_,
)
from constructs import Construct


class NutidensMesterStack(cdk.Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        user_pool_id = os.environ.get("COGNITO_USER_POOL_ID", "").strip()
        if not user_pool_id:
            raise ValueError("Set COGNITO_USER_POOL_ID env var before deploying")

        # ── DynamoDB ──────────────────────────────────────────────────────────

        table = dynamodb.Table(
            self, "Table",
            table_name="NutidensMester",
            partition_key=dynamodb.Attribute(name="PK", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="SK", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        table.add_global_secondary_index(
            index_name="GSI1",
            partition_key=dynamodb.Attribute(name="GSI1PK", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="GSI1SK", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── Lambda ────────────────────────────────────────────────────────────

        resolver_fn = lambda_.Function(
            self, "ResolverFn",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.handler",
            code=lambda_.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "../lambda")
            ),
            timeout=Duration.seconds(10),
            environment={"TABLE_NAME": table.table_name},
        )

        table.grant_read_write_data(resolver_fn)

        # ── AppSync ───────────────────────────────────────────────────────────

        user_pool = cognito.UserPool.from_user_pool_arn(
            self, "UserPool",
            f"arn:aws:cognito-idp:eu-central-1:{self.account}:userpool/{user_pool_id}",
        )

        api = appsync.GraphqlApi(
            self, "Api",
            name="NutidensMesterApi",
            definition=appsync.Definition.from_file(
                os.path.join(os.path.dirname(__file__), "../lib/schema.graphql")
            ),
            authorization_config=appsync.AuthorizationConfig(
                default_authorization=appsync.AuthorizationMode(
                    authorization_type=appsync.AuthorizationType.USER_POOL,
                    user_pool_config=appsync.UserPoolConfig(user_pool=user_pool),
                )
            ),
            xray_enabled=False,
        )

        # ── Data sources ──────────────────────────────────────────────────────

        lambda_ds = api.add_lambda_data_source("LambdaDs", resolver_fn)
        none_ds = api.add_none_data_source("NoneDs")

        for field_name in ["listMyGroups", "listMembers", "listRoundsInCycle"]:
            lambda_ds.create_resolver(
                f"Query_{field_name}",
                type_name="Query",
                field_name=field_name,
            )

        for field_name in ["createGroup", "joinGroup", "recordRound"]:
            lambda_ds.create_resolver(
                f"Mutation_{field_name}",
                type_name="Mutation",
                field_name=field_name,
            )

        none_ds.create_resolver(
            "Subscription_onRoundAdded",
            type_name="Subscription",
            field_name="onRoundAdded",
            request_mapping_template=appsync.MappingTemplate.from_string(
                '{"version":"2018-05-29","payload":$util.toJson($context.arguments)}'
            ),
            response_mapping_template=appsync.MappingTemplate.from_string(
                "$util.toJson(null)"
            ),
        )

        # ── Outputs ───────────────────────────────────────────────────────────

        CfnOutput(
            self, "GraphqlUrl",
            value=api.graphql_url,
            description="Set as VITE_APPSYNC_URL in .env.local",
        )
        CfnOutput(
            self, "Region",
            value=self.region,
            description="Set as VITE_AWS_REGION in .env.local",
        )
