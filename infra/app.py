import os
import aws_cdk as cdk
from nutidens_mester.stack import NutidensMesterStack

app = cdk.App()

NutidensMesterStack(
    app, "NutidensMesterStack",
    env=cdk.Environment(
        account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
        region=os.environ.get("CDK_DEFAULT_REGION", "eu-central-1"),
    ),
)

app.synth()
